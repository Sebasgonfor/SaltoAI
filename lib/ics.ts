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
import { loadFeedbackIndex } from "./feedback-signal";
import { listDocumentsByProfile } from "./db";
import type { DocumentSkill } from "./types";
import {
  weightsForNeed,
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
Recibes UNA necesidad de empresa y N candidatos (shortlist). Devuelves un objeto con un array "results" del MISMO largo y MISMO orden que la lista de candidatos.

CRÍTICO — NATURALEZA DEL ROL (lee esto antes de scorear):
La necesidad incluye un campo "jobNature" que cambia QUÉ se valora. SaltoAI sirve a una variedad de roles, NO solo a vendedores y growth hackers. Tu evaluación debe adaptarse.

  * jobNature = "cuantitativa" → el valor del rol se mide en NÚMEROS (ventas, leads, % de crecimiento, NPS).
    Ejemplos: vendedor, growth, marketing digital, community manager con KPI, e-commerce, SDR.
    EN ESTE CASO valora ALTO: "Resultados medibles" en la evidencia, autodidactismo, iniciativa scrappy.
    Si el candidato no trae métricas concretas (números, %, cantidades) → learningSignal baja, skillsFit baja.

  * jobNature = "cualitativa" → el valor se mide en CONSISTENCIA, RIGOR Y CUIDADO. NO en números.
    Ejemplos: contador / contabilidad MIPYME, cajero, diseñador gráfico, archivista, asistente
    administrativo, operario, recepcionista, conserje, cocinero, mensajero confiable, costurero,
    encargado de stock.
    EN ESTE CASO valora ALTO: "Confiabilidad", "Detallismo", "Sentido del orden", "Constancia",
    "Atención a la regla", "Estabilidad". NO esperes ni penalices la falta de métricas — un
    contador que dice "cuadré caja todos los días sin un faltante en 8 meses" es ORO, no necesita
    "triplé las ventas". Un diseñador gráfico que muestra criterio estético y rigor no necesita
    decir "subí seguidores 200%".
    PROHIBIDO penalizar learningSignal por ausencia de números — en roles cualitativos, learningSignal
    debe medir "aprendió a hacer su trabajo BIEN", no "aprendió a hacerlo SOLO con tutoriales".

  * jobNature = "mixta" → balance neutro. Default cuando no hay clasificación clara.

Para cada candidato devuelve:
- profileId: copia EXACTAMENTE el profileId del candidato en esa posición. NO inventes IDs.
- skillsFit (0-100): cuán bien las habilidades del candidato cubren los requiredSkills (semánticamente, no por keywords). "Atención al Cliente" cubre "manejo de clientes en local" → suma. CADA candidato trae dos listas de habilidades: "skills" (declaradas en entrevista, auto-reportadas) Y "verifiedSkills" (EXTRAÍDAS DE DOCUMENTOS reales como certificados/diplomas, con cita textual). Las verifiedSkills PESAN MÁS: si una verifiedSkill cubre una requiredSkill, súmale 15-20 puntos extra a skillsFit respecto a si solo estuviera en "skills". Si TODAS las requiredSkills están cubiertas por verifiedSkills, skillsFit debe estar en 85-100.
- verifiedSkills (relacionadas al rol): de las verifiedSkills del candidato, identifica las que cubren requiredSkills. Devuélvelas en el campo "verifiedRelevant" del response.
- behavioralFit (0-100): compatibilidad entre traits del candidato y desiredTraits de la empresa. EN ROLES CUALITATIVOS este es el más importante — buscás rasgos como "detallista", "responsable", "constante", "cuidadoso", "metódico", "paciente". Una cita como "cuadré la caja todos los días sin faltantes" o "ordené el stock y no se perdió nada en 6 meses" debe llevar behavioralFit a 80+.
- learningSignal (0-100):
  - Roles cuantitativos: evidencia REAL de aprendizaje autónomo / resolver sin guía (aprendió Excel por YouTube, etc). Sin evidencia clara → 20-40. Caso concreto → 70+.
  - Roles cualitativos: NO PENALICES si el candidato no muestra autodidactismo scrappy. Acá learningSignal mide la capacidad de hacer su trabajo BIEN con instrucciones claras. Si demuestra constancia + ejecución pulcra → 60-80 (no más, porque cualitativo NO necesita iniciativa de inventar la rueda).
- contextFit (0-100): cuán bien los traits del candidato encajan con el contexto operativo descrito. Si el contexto es caos+multitarea pero el candidato es "metódico ordenado", contextFit bajo. Si el contexto es "MIPYME tranquila, finanzas que ordenar" y el candidato es "detallista paciente", contextFit alto.
- penalties (0-100): 0 si no hay hardConstraints incumplidos. 30-60 si un hard constraint está claramente incumplido. 100 si es bloqueante (ej. necesidad pide ubicación fija incompatible).
- reason (1-2 frases): CITANDO evidencia concreta del candidato. Sin halagos genéricos.
- redFlag (1 frase): nota honesta sobre lo que falta o NO tenemos evidencia. Si no hay nada, "Ninguna señal negativa visible."
- topSkills: hasta 3 skills del candidato más relevantes para ESTE rol.

CRÍTICO:
- Compara los candidatos entre sí. NO inflar todos al mismo nivel.
- NO inventes datos. Si un campo no tiene evidencia, refleja eso en score bajo + redFlag honesto.
- ADAPTA TU EVALUACIÓN AL jobNature — no penalices al contador callado y detallista por no traer métricas.
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
    verifiedRelevant: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          evidence: { type: Type.STRING },
        },
        required: ["skill", "evidence"],
      },
    },
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

/**
 * Cálculo del ICS final.
 *
 * Acepta `need` opcional para usar los pesos calibrados a la naturaleza del
 * rol (cuantitativa/cualitativa/mixta). Sin `need`, usa los pesos "mixta"
 * — retro-compatible con el comportamiento anterior.
 *
 * Por qué el cambio: un perfil "callado y detallista" candidato a contador
 * de MIPYME no debería castigarse por NO traer métricas. Las métricas pesan
 * en roles cuantitativos (vendedor, growth); en roles cualitativos pesa más
 * el behavioralFit (cuidado, confiabilidad, consistencia).
 */
export function computeICS(b: ICSBreakdown, need?: Pick<CompanyNeed, "jobNature">): number {
  const w = need ? weightsForNeed(need) : weightsForNeed({});
  const raw =
    w.skillsFit * b.skillsFit +
    w.behavioralFit * b.behavioralFit +
    w.learningSignal * b.learningSignal +
    w.contextFit * b.contextFit -
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

/**
 * Stopwords en español que filtramos antes de comparar skills por token.
 * Sin esto, "Gestión de Redes Sociales" vs "Manejo de redes sociales" se
 * compara como sub-strings completos y NO matchea ("gestion de redes" no
 * está en "manejo de redes"). Con tokenización + stopword removal nos
 * quedamos con {redes, sociales} en ambos lados → match 100%.
 */
const SPANISH_STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "en", "para", "por", "y", "e", "o",
  "u", "con", "sin", "a", "al", "un", "una", "unos", "unas", "se", "su",
  "sus", "lo", "le", "les", "es", "que",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SPANISH_STOPWORDS.has(t));
}

/**
 * Match fuzzy de skill por solapamiento de tokens significativos.
 * Devuelve un puntaje 0-1:
 *   - 1.0 si todos los tokens del requirement están en la skill del candidato
 *   - >0  si al menos un token relevante coincide
 *   - 0   si no hay overlap
 * Esto reemplaza el viejo `n.includes(r) || r.includes(n)` que era
 * substring puro y fallaba en sinónimos básicos del español ("gestión"/"manejo",
 * "marketing"/"mercadeo").
 */
function skillOverlap(required: string, candidate: string): number {
  const reqTokens = tokenize(required);
  const candTokens = new Set(tokenize(candidate));
  if (reqTokens.length === 0 || candTokens.size === 0) return 0;
  let hits = 0;
  for (const t of reqTokens) if (candTokens.has(t)) hits++;
  return hits / reqTokens.length;
}

export function heuristicScore(
  need: CompanyNeed,
  profile: Profile
): Omit<Match, "profileId" | "profileName"> {
  const norm = (s: string) => s.toLowerCase().trim();
  const traitSet = new Set(need.desiredTraits.map(norm));

  // Para cada required skill, buscamos la mejor candidate skill del joven.
  // Si el overlap >= 0.5 (al menos la mitad de tokens significativos coinciden),
  // contamos como "covered" total. Si está entre 0.25 y 0.5, "parcial" (cuenta como medio).
  let coveredCount = 0;
  let partialCount = 0;
  const skillMatches: string[] = [];
  for (const req of need.requiredSkills) {
    let best = 0;
    let bestCand = "";
    for (const cand of profile.skills) {
      const score = skillOverlap(req, cand);
      if (score > best) {
        best = score;
        bestCand = cand;
      }
    }
    if (best >= 0.5) {
      coveredCount++;
      if (bestCand) skillMatches.push(bestCand);
    } else if (best >= 0.25) {
      partialCount++;
      if (bestCand) skillMatches.push(bestCand);
    }
  }

  const traitMatches = profile.traits.filter((t) => {
    const n = norm(t);
    for (const r of traitSet) if (n.includes(r) || r.includes(n)) return true;
    return false;
  });

  // skillsFit = (covered + 0.5 * partial) / total — el match parcial cuenta como medio.
  const totalReq = Math.max(need.requiredSkills.length, 1);
  const skillsFit = clamp(((coveredCount + partialCount * 0.5) / totalReq) * 100);
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
    ics: computeICS(breakdown, need),
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

  // Nota: NO filtramos por edad. SaltoAI no captura ni usa edad/género —
  // evaluamos solo evidencia y skills para evitar sesgo etario o de género.

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
  verifiedRelevant?: { skill: string; evidence: string }[];
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
    jobNature: need.jobNature ?? "mixta",
    jobNatureReason: need.jobNatureReason,
  };
  const candidatesPayload = profiles.map((p) => ({
    profileId: p.id,
    name: p.name,
    summary: p.summary,
    skills: p.skills,
    traits: p.traits,
    evidence: p.evidence,
    // verifiedSkills: skills extraídas de DOCUMENTOS (certificados, diplomas)
    // — pesan MÁS porque tienen evidencia documental. Si está vacío, el
    // candidato solo tiene skills auto-reportadas en la entrevista.
    verifiedSkills: p.documentSkills?.map((ds) => ({
      skill: ds.skill,
      evidence: ds.evidence,
      confidence: ds.confidence,
    })) ?? [],
  }));

  const response = await withTimeout(
    gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: `${RANK_BATCH_PROMPT}\n\nNECESIDAD:\n${JSON.stringify(needPayload, null, 2)}\n\nCANDIDATOS (en orden):\n${JSON.stringify(candidatesPayload, null, 2)}\n\nDevuelve { "results": [...] } con un objeto por candidato, en el MISMO orden y con el MISMO profileId.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: batchSchema,
        // gemini-2.5-flash trae "thinking" activado por defecto. Para un batch
        // de hasta SHORTLIST_SIZE candidatos eso empuja la latencia por encima
        // del timeout (GEMINI_TIMEOUT_MS) → caíamos SIEMPRE a heurístico
        // (rankingMode "degraded"). El ranking aquí es clasificación estructurada,
        // no requiere cadena de razonamiento, así que desactivamos thinking para
        // responder en pocos segundos y obtener ICS reales del LLM.
        thinkingConfig: { thinkingBudget: 0 },
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
      ics: computeICS(breakdown, need),
      breakdown,
      reason: it.reason || "",
      redFlag: it.redFlag || "Ninguna señal negativa visible.",
      topSkills: Array.isArray(it.topSkills) ? it.topSkills.slice(0, 3) : [],
      verifiedSkills: Array.isArray(it.verifiedRelevant)
        ? it.verifiedRelevant
            .filter((v) => v && typeof v.skill === "string" && typeof v.evidence === "string")
            .slice(0, 5)
        : undefined,
    });
  });

  return map;
}

// --- API pública ---

export interface ScoreOptions {
  /** Si true, filtra duro candidatos que violan hardConstraints. Default true. */
  applyHardFilter?: boolean;
  /** Si true, aplica el delta de feedback (señales acumuladas) sobre el ICS
   * predicho por el LLM. Default true. Apagar para A/B testing del motor sin
   * señal vs con señal. */
  useFeedbackSignal?: boolean;
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
/**
 * Enriquece cada perfil con sus `documentSkills` leyendo de la colección
 * `documents`. Se hace antes del scoring para que el LLM tenga visibilidad
 * de qué skills están verificadas por documento (certificado, diploma) y
 * pueda ponderarlas más alto.
 *
 * Fail-soft: si la lectura falla para un perfil, ese candidato simplemente
 * va sin documentSkills (igual de bien que antes). NO bloqueamos el match.
 */
async function enrichWithDocumentSkills(profiles: Profile[]): Promise<Profile[]> {
  return Promise.all(
    profiles.map(async (p) => {
      if (!p.id) return p;
      try {
        const docs = await listDocumentsByProfile(p.id);
        const allSkills: DocumentSkill[] = [];
        for (const d of docs) {
          if (d.extractionStatus !== "done") continue;
          if (!d.extractedSkills) continue;
          for (const s of d.extractedSkills) {
            // Solo skills con cita textual y confianza alta (anti-alucinación).
            if (s.skill && s.evidence && s.confidence >= 60) {
              allSkills.push(s);
            }
          }
        }
        // Dedup por skill name (case-insensitive). Conservamos la más confiable.
        const seen = new Map<string, DocumentSkill>();
        for (const s of allSkills) {
          const key = s.skill.toLowerCase().trim();
          const prev = seen.get(key);
          if (!prev || (s.confidence ?? 0) > (prev.confidence ?? 0)) seen.set(key, s);
        }
        return { ...p, documentSkills: Array.from(seen.values()) };
      } catch {
        return p; // sin documentSkills, el scorer trabaja igual
      }
    })
  );
}

export async function scoreCandidates(
  need: CompanyNeed,
  shortlist: Profile[],
  opts: ScoreOptions = {}
): Promise<ScoreResult> {
  const applyHardFilter = opts.applyHardFilter !== false;
  const useFeedbackSignal = opts.useFeedbackSignal !== false;
  // Enriquecemos los perfiles con sus skills verificadas por documento ANTES
  // de cualquier filtro o scoring. Así el LLM las ve y las pondera más.
  shortlist = await enrichWithDocumentSkills(shortlist);

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

  // 4. Aplicar delta de feedback acumulado por par (needId, profileId).
  // Esto es el primer eslabón del data flywheel: cada vez que el founder
  // marca 👍/👎, clickea conectar, o ratea una microtask, ese signal se
  // suma como corrección al ICS predicho por el LLM.
  if (useFeedbackSignal && need.id) {
    try {
      const getSignal = await loadFeedbackIndex();
      for (const m of ranked) {
        const agg = getSignal(need.id, m.profileId);
        if (agg.delta !== 0) {
          const original = m.ics;
          m.ics = Math.max(0, Math.min(100, m.ics + agg.delta));
          // Anotamos la razón con la corrección visible. El founder ve POR QUÉ
          // el score subió/bajó respecto del puro juicio LLM.
          const sign = agg.delta > 0 ? "+" : "";
          m.reason = `${m.reason} [Ajustado ${sign}${agg.delta}pts: ${agg.reasons.join(", ")}]`;
          m.breakdown = {
            ...m.breakdown,
            // No tocamos los sub-scores — el delta solo afecta el ICS final.
            // El breakdown sigue mostrando lo que el LLM realmente percibió.
          };
          void original; // referencia inadvertida para debug breakpoint
        }
      }
    } catch (e) {
      // Si la lectura de feedback falla, NO rompemos el scoring — solo
      // continuamos sin la corrección. Mejor un score sin ajuste que un 500.
      console.warn("[ics] feedback signal load failed:", (e as Error).message);
    }
  }

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
