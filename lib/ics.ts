/**
 * Motor de scoring ICS (Índice de Compatibilidad Salto) — UNIFICADO.
 *
 * Antes había dos copias casi idénticas: `heuristicRank` en /api/match y
 * `heuristicOpportunity` en /api/oportunidades. Una usaba LLM batch, la otra
 * solo heurística. Resultado: la empresa veía 55%, el joven veía 75% para el
 * mismo par. Ahora todo pasa por `scoreCandidates()` con la misma pipeline.
 *
 * Diseño:
 *   1. (opcional) Filtro duro por hardConstraints — si la necesidad declara
 *      "Barranquilla" y el perfil dice "Bogotá", se descarta antes del scoring.
 *      Best-effort: matchea contra summary + evidence + skills + traits del
 *      perfil. Conservador: ante duda, NO excluye (penaliza vía LLM si acaso).
 *   2. Ranking batched con Gemini — UNA sola llamada por necesidad cubriendo
 *      hasta SHORTLIST_SIZE candidatos. Si Gemini falla / no hay key / timeout,
 *      caemos a la heurística determinística y marcamos `degraded: true` en
 *      cada match para que el frontend lo señalice.
 *   3. Validación posicional: si el LLM devuelve `profileId` que no coincide
 *      con el candidato en esa posición del batch, se descarta ESE item y se
 *      usa heurística solo para ese candidato (los demás siguen LLM-ranked).
 *   4. Ponderación final: skillsFit·0.35 + behavioralFit·0.3 + learningSignal·0.2
 *      + contextFit·0.15 − penalties. Clamp a [0, 100].
 */
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "./gemini";
import { isQuotaError } from "./gemini";
import {
  ICS_WEIGHTS,
  type CompanyNeed,
  type ICSBreakdown,
  type Match,
  type Profile,
} from "./types";

// --- Tunables públicos ---
export const SHORTLIST_SIZE = 15;
export const RETURN_SIZE = 10;

const GEMINI_TIMEOUT_MS = 25_000;

const RANK_BATCH_PROMPT = `Eres el motor de scoring ICS (Índice de Compatibilidad Salto).
Recibís UNA necesidad de empresa y N candidatos (shortlist). Devuelves un objeto con un array "results" del MISMO largo y MISMO orden que la lista de candidatos.

Para cada candidato devuelve:
- profileId: copia EXACTAMENTE el profileId del candidato en esa posición. NO inventes IDs.
- skillsFit (0-100): cuán bien las habilidades del candidato cubren los requiredSkills (semánticamente, no por keywords). "Atención al Cliente" cubre "manejo de clientes en local" → suma.
- behavioralFit (0-100): compatibilidad entre traits del candidato y desiredTraits de la empresa.
- learningSignal (0-100): evidencia REAL de aprendizaje autónomo / resolver sin guía en el campo evidence. Si no hay evidencia clara, bajo (20-40). Si hay caso concreto (aprendió Excel por YouTube, descubrió cómo hacer X solo), alto (70+).
- contextFit (0-100): cuán bien los traits aguantan el contexto operativo descrito (caos, ritmo rápido, multitarea, presencial, etc.). Si el contexto pide "tolerancia al caos" y el candidato tiene "metódico" pero ningún rasgo de tolerancia al caos, bajo.
- penalties (0-100): 0 si no hay hardConstraints incumplidos. 30-60 si un hard constraint está claramente incumplido. 100 si es bloqueante (ej. necesidad pide ubicación fija incompatible).
- reason (1-2 frases): CITANDO evidencia concreta del candidato. Sin halagos genéricos.
- redFlag (1 frase): nota honesta sobre lo que falta o NO tenemos evidencia. Si no hay nada, "Ninguna señal negativa visible."
- topSkills: hasta 3 skills del candidato más relevantes para ESTE rol.

CRÍTICO:
- Compara los candidatos entre sí. NO inflar todos al mismo nivel.
- NO inventes datos. Si un campo no tiene evidencia, refleja eso en score bajo + redFlag honesto.
- El array results debe tener el MISMO orden que la lista recibida.`;

const itemSchema = {
  type: Type.OBJECT,
  properties: {
    profileId: { type: Type.STRING },
    skillsFit: { type: Type.NUMBER },
    behavioralFit: { type: Type.NUMBER },
    learningSignal: { type: Type.NUMBER },
    contextFit: { type: Type.NUMBER },
    penalties: { type: Type.NUMBER },
    reason: { type: Type.STRING },
    redFlag: { type: Type.STRING },
    topSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "profileId",
    "skillsFit",
    "behavioralFit",
    "learningSignal",
    "contextFit",
    "penalties",
    "reason",
    "redFlag",
    "topSkills",
  ],
};

const batchSchema = {
  type: Type.OBJECT,
  properties: {
    results: { type: Type.ARRAY, items: itemSchema },
  },
  required: ["results"],
};

// --- Helpers ---

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export function computeICS(b: ICSBreakdown): number {
  const raw =
    ICS_WEIGHTS.skillsFit * b.skillsFit +
    ICS_WEIGHTS.behavioralFit * b.behavioralFit +
    ICS_WEIGHTS.learningSignal * b.learningSignal +
    ICS_WEIGHTS.contextFit * b.contextFit -
    b.penalties;
  return Math.round(clamp(raw));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// --- Heurística determinística (fallback sin LLM) ---

export function heuristicScore(
  need: CompanyNeed,
  profile: Profile
): Omit<Match, "profileId" | "profileName"> {
  const norm = (s: string) => s.toLowerCase().trim();
  const reqSet = new Set(need.requiredSkills.map(norm));
  const traitSet = new Set(need.desiredTraits.map(norm));

  const skillMatches = profile.skills.filter((s) => {
    const n = norm(s);
    for (const r of reqSet) if (n.includes(r) || r.includes(n)) return true;
    return false;
  });
  const traitMatches = profile.traits.filter((t) => {
    const n = norm(t);
    for (const r of traitSet) if (n.includes(r) || r.includes(n)) return true;
    return false;
  });

  const skillsFit = clamp((skillMatches.length / Math.max(reqSet.size, 1)) * 100);
  const behavioralFit = clamp(
    (traitMatches.length / Math.max(traitSet.size, 1)) * 100
  );
  const evText = profile.evidence
    .map((e) => e.quote)
    .join(" ")
    .toLowerCase();
  const learningSignal = clamp(
    /(aprend|sol[oa]|autodidacta|sin que|por mi cuenta|nadie me|youtube|tutoriales?)/.test(
      evText
    )
      ? 70
      : 40
  );
  const contextFit = clamp(traitMatches.length > 0 ? 65 : 45);

  const breakdown: ICSBreakdown = {
    skillsFit,
    behavioralFit,
    learningSignal,
    contextFit,
    penalties: 0,
  };

  return {
    ics: computeICS(breakdown),
    breakdown,
    reason: skillMatches.length
      ? `Tiene experiencia directa en ${skillMatches.slice(0, 2).join(" y ")}, alineado con lo que pediste.`
      : `Sin coincidencia literal de skills; el match se basa en señales conductuales del perfil.`,
    redFlag:
      profile.evidence.length < 2
        ? "Evidencia escasa: vale la pena profundizar en entrevista."
        : "Ninguna señal negativa visible.",
    topSkills: (skillMatches.length ? skillMatches : profile.skills).slice(0, 3),
  };
}

// --- Filtro por hardConstraints (best-effort, conservador) ---

/**
 * Detecta una ciudad/región declarada en un hardConstraint y la compara contra
 * el texto del perfil. Solo descarta si encuentra una contradicción CLARA —
 * ante duda, devuelve null (el LLM aplica el penalty fino vía `penalties`).
 *
 * Ejemplos que SÍ descartan:
 *   need: "ubicación Barranquilla, presencial"
 *   profile.summary: "vivo en Bogotá y busco remoto" → descartado.
 *
 * Ejemplos que NO descartan (incertidumbre):
 *   need: "ubicación Barranquilla"
 *   profile sin ninguna referencia geográfica → pasa al scoring normal.
 */
const COLOMBIA_CITIES = [
  "barranquilla",
  "bogotá",
  "bogota",
  "medellín",
  "medellin",
  "cali",
  "cartagena",
  "santa marta",
  "bucaramanga",
  "cúcuta",
  "cucuta",
  "ibagué",
  "ibague",
  "pereira",
  "manizales",
  "soledad",
  "neiva",
  "villavicencio",
];

function extractCityFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const city of COLOMBIA_CITIES) {
    if (lower.includes(city)) return city;
  }
  return null;
}

export interface HardFilterResult {
  passes: boolean;
  reason?: string;
}

export function checkHardConstraints(
  need: CompanyNeed,
  profile: Profile
): HardFilterResult {
  if (!need.hardConstraints || need.hardConstraints.length === 0) {
    return { passes: true };
  }
  const profileText = [
    profile.summary,
    ...profile.skills,
    ...profile.traits,
    ...profile.evidence.map((e) => e.quote),
  ]
    .join(" ")
    .toLowerCase();
  const constraintsText = need.hardConstraints.join(" ").toLowerCase();

  // 1. Ubicación: si el constraint nombra UNA ciudad concreta y el perfil
  // nombra OTRA ciudad concreta, contradicción → no pasa.
  const needCity = extractCityFromText(constraintsText);
  const profileCity = extractCityFromText(profileText);
  if (needCity && profileCity && needCity !== profileCity) {
    return {
      passes: false,
      reason: `Ubicación incompatible: el rol pide ${needCity}, el perfil declara ${profileCity}.`,
    };
  }

  // 2. Edad mínima: si el constraint pide "mayor de 18" / "18 años mínimo"
  // y el perfil tiene `age` declarada por debajo.
  const ageMatch = constraintsText.match(/(?:mayor de|m[íi]nimo|al menos)\s*(\d{2})\s*años?/);
  if (ageMatch && typeof profile.age === "number") {
    const minAge = parseInt(ageMatch[1], 10);
    if (Number.isFinite(minAge) && profile.age < minAge) {
      return {
        passes: false,
        reason: `Edad mínima del rol: ${minAge}; el candidato declara ${profile.age}.`,
      };
    }
  }

  // Cualquier otra restricción (idioma, jornada, herramientas) la decide el LLM
  // vía `penalties`. No bloqueamos sin evidencia clara — sería peor descartar a
  // un buen candidato por una palabra que no leímos bien.
  return { passes: true };
}

// --- LLM batch ranking ---

interface BatchItem {
  profileId?: string;
  skillsFit: number;
  behavioralFit: number;
  learningSignal: number;
  contextFit: number;
  penalties: number;
  reason: string;
  redFlag: string;
  topSkills: string[];
}

async function rankBatchWithLLM(
  need: CompanyNeed,
  profiles: Profile[]
): Promise<Map<string, Omit<Match, "profileId" | "profileName">>> {
  const needPayload = {
    role: need.role,
    context: need.context,
    requiredSkills: need.requiredSkills,
    desiredTraits: need.desiredTraits,
    hardConstraints: need.hardConstraints,
  };
  const candidatesPayload = profiles.map((p) => ({
    profileId: p.id,
    name: p.name,
    summary: p.summary,
    skills: p.skills,
    traits: p.traits,
    evidence: p.evidence,
  }));

  const response = await withTimeout(
    gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: `${RANK_BATCH_PROMPT}\n\nNECESIDAD:\n${JSON.stringify(needPayload, null, 2)}\n\nCANDIDATOS (en orden):\n${JSON.stringify(candidatesPayload, null, 2)}\n\nDevuelve { "results": [...] } con un objeto por candidato, en el MISMO orden y con el MISMO profileId.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: batchSchema,
      },
    }),
    GEMINI_TIMEOUT_MS,
    "ics.rankBatch"
  );

  const parsed = JSON.parse(response.text || "{}");
  const items: BatchItem[] = Array.isArray(parsed.results) ? parsed.results : [];
  const map = new Map<string, Omit<Match, "profileId" | "profileName">>();

  items.forEach((it, idx) => {
    const profile = profiles[idx];
    if (!profile) return;

    // Validación posicional: si el LLM devolvió un profileId distinto al
    // candidato que ocupa esa posición del batch, el orden está roto y NO
    // podemos confiar en el score (asignaríamos los números a otra persona).
    // Saltamos ese item — el caller usará la heurística para ese profile.
    if (it.profileId && profile.id && it.profileId !== profile.id) {
      console.warn(
        `[ics] LLM batch position mismatch at idx=${idx}: expected ${profile.id}, got ${it.profileId}. Falling back to heuristic for this candidate.`
      );
      return;
    }

    const breakdown: ICSBreakdown = {
      skillsFit: clamp(Number(it.skillsFit)),
      behavioralFit: clamp(Number(it.behavioralFit)),
      learningSignal: clamp(Number(it.learningSignal)),
      contextFit: clamp(Number(it.contextFit)),
      penalties: clamp(Number(it.penalties)),
    };
    map.set(profile.id!, {
      ics: computeICS(breakdown),
      breakdown,
      reason: it.reason || "",
      redFlag: it.redFlag || "Ninguna señal negativa visible.",
      topSkills: Array.isArray(it.topSkills) ? it.topSkills.slice(0, 3) : [],
    });
  });

  return map;
}

// --- API pública ---

export interface ScoreOptions {
  /** Si true, filtra duro candidatos que violan hardConstraints. Default true. */
  applyHardFilter?: boolean;
}

export interface ScoreResult {
  matches: Match[];
  /** Modo de ranking: llm = todos vía LLM. degraded = algunos o todos heurísticos. */
  rankingMode: "llm" | "degraded";
  /** Mensaje legible cuando rankingMode = degraded (para mostrar al usuario). */
  degradedReason?: string;
  /** Candidatos descartados por hardConstraints, con razón. */
  excluded: { profileId: string; reason: string }[];
  /** Métricas para logging. */
  meta: {
    shortlistSize: number;
    llmHits: number;
    heuristicHits: number;
  };
}

/**
 * Función única de scoring. Llamada desde /api/match y /api/oportunidades.
 *
 * Devuelve hasta `RETURN_SIZE` matches rankeados por ICS, con `degraded` y
 * `excluded` para que el frontend muestre estado honesto.
 */
export async function scoreCandidates(
  need: CompanyNeed,
  shortlist: Profile[],
  opts: ScoreOptions = {}
): Promise<ScoreResult> {
  const applyHardFilter = opts.applyHardFilter !== false;

  // 1. Hard filter
  const excluded: { profileId: string; reason: string }[] = [];
  const filtered: Profile[] = [];
  for (const p of shortlist) {
    if (!p.id) continue;
    if (applyHardFilter) {
      const check = checkHardConstraints(need, p);
      if (!check.passes) {
        excluded.push({ profileId: p.id, reason: check.reason || "hardConstraint" });
        continue;
      }
    }
    filtered.push(p);
  }

  if (filtered.length === 0) {
    return {
      matches: [],
      rankingMode: "degraded",
      degradedReason: "Todos los candidatos del shortlist quedaron excluidos por restricciones duras.",
      excluded,
      meta: { shortlistSize: shortlist.length, llmHits: 0, heuristicHits: 0 },
    };
  }

  // 2. LLM batch (con fallback a heurística)
  let llmResults: Map<string, Omit<Match, "profileId" | "profileName">> | null = null;
  let degradedReason: string | undefined;

  if (hasGeminiKey()) {
    try {
      llmResults = await rankBatchWithLLM(need, filtered);
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (isQuotaError(e)) {
        degradedReason =
          "Estamos sobre el límite de uso de la IA por minuto. Los scores siguen disponibles pero con menor precisión.";
        console.warn("[ics] rate limited, falling back to heuristic");
      } else if (msg.startsWith("timeout:")) {
        degradedReason =
          "La IA tardó más de lo normal. Los scores siguen disponibles pero con menor precisión.";
        console.warn("[ics] gemini timeout, falling back to heuristic");
      } else {
        degradedReason =
          "El ranking semántico falló. Los scores siguen disponibles pero con menor precisión.";
        console.warn("[ics] rank batch failed:", msg);
      }
    }
  } else {
    degradedReason =
      "Modo demo sin clave de IA: los scores son heurísticos. Configura GEMINI_API_KEY para ranking real.";
  }

  // 3. Resolver cada match: LLM si lo tenemos para ese profile, heurística si no.
  let llmHits = 0;
  let heuristicHits = 0;
  const ranked: Match[] = filtered.map((p) => {
    const r = llmResults?.get(p.id!);
    if (r) {
      llmHits++;
      return { profileId: p.id!, profileName: p.name, ...r };
    }
    heuristicHits++;
    return { profileId: p.id!, profileName: p.name, ...heuristicScore(need, p) };
  });

  ranked.sort((a, b) => b.ics - a.ics);
  const matches = ranked.slice(0, RETURN_SIZE);

  return {
    matches,
    rankingMode: llmHits > 0 && heuristicHits === 0 ? "llm" : "degraded",
    degradedReason: heuristicHits > 0 ? degradedReason : undefined,
    excluded,
    meta: {
      shortlistSize: filtered.length,
      llmHits,
      heuristicHits,
    },
  };
}
