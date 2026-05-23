import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllProfiles, getNeed } from "@/lib/db";
import { ICS_WEIGHTS } from "@/lib/types";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, ICSBreakdown, Match, Profile } from "@/lib/types";

export const runtime = "nodejs";

const SHORTLIST_SIZE = 5;
const RETURN_SIZE = 3;

const RANK_BATCH_PROMPT = `Eres el motor de scoring ICS (Índice de Compatibilidad Salto).
Recibes UNA necesidad de empresa y N candidatos (shortlist). Devuelves un objeto con un array "results" de la MISMA longitud y MISMO orden que la lista de candidatos.

Para cada candidato devuelve 4 sub-scores 0-100, una penalización 0-100, una razón, un red flag y top skills.

Reglas:
- skillsFit: cuán bien las habilidades del candidato cubren los requiredSkills (semánticamente, no por keywords). Si "Atención al Cliente" cubre "manejo de clientes en local", suma.
- behavioralFit: compatibilidad entre traits del candidato y desiredTraits de la empresa.
- learningSignal: evidencia de aprendizaje autónomo / resolver sin guía en el campo evidence del candidato.
- contextFit: cuán bien los traits aguantan el contexto operativo descrito (caos, ritmo rápido, multitarea, etc.).
- penalties: 0 si no hay hardConstraints o no hay evidencia de incumplimiento; 30-60 si un hard constraint está claramente incumplido; 100 si es bloqueante.
- reason: 1-2 frases CITANDO evidencia concreta del candidato. Sin halagos genéricos.
- redFlag: 1 nota honesta sobre lo que falta o lo que NO tenemos evidencia. Si no hay nada, "Ninguna señal negativa visible."
- topSkills: hasta 3 skills del candidato más relevantes para ESTE rol específico.

CRÍTICO: compara los candidatos entre sí. Si dos candidatos cubren la skill principal, el que la tenga con evidencia más fuerte debe puntuar más alto. NO inflar todos al mismo nivel.
NO inventes datos. Si no hay evidencia, refleja eso en un score más bajo y en el redFlag.
El array results debe tener exactamente el mismo orden que la lista de candidatos recibida.`;

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

function clamp(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function computeICS(b: ICSBreakdown): number {
  const raw =
    ICS_WEIGHTS.skillsFit * b.skillsFit +
    ICS_WEIGHTS.behavioralFit * b.behavioralFit +
    ICS_WEIGHTS.learningSignal * b.learningSignal +
    ICS_WEIGHTS.contextFit * b.contextFit -
    b.penalties;
  return Math.round(clamp(raw));
}

function heuristicRank(need: CompanyNeed, profile: Profile): Omit<Match, "profileId" | "profileName"> {
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
  const behavioralFit = clamp((traitMatches.length / Math.max(traitSet.size, 1)) * 100);
  const evText = profile.evidence.map((e) => e.quote).join(" ").toLowerCase();
  const learningSignal = clamp(
    /(aprend|sol[oa]|autodidacta|sin que|por mi cuenta|nadie me)/.test(evText) ? 70 : 40
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

  const response = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: `${RANK_BATCH_PROMPT}\n\nNECESIDAD:\n${JSON.stringify(needPayload, null, 2)}\n\nCANDIDATOS (en orden):\n${JSON.stringify(candidatesPayload, null, 2)}\n\nDevuelve { "results": [...] } con un objeto por candidato, en el MISMO orden.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: batchSchema,
    },
  });

  const parsed = JSON.parse(response.text || "{}");
  const items: BatchItem[] = Array.isArray(parsed.results) ? parsed.results : [];
  const map = new Map<string, Omit<Match, "profileId" | "profileName">>();

  items.forEach((it, idx) => {
    const profile = profiles[idx];
    if (!profile) return;
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

export async function POST(req: NextRequest) {
  const log = startLog(req, "match");
  try {
    const { needId } = (await req.json()) as { needId: string };
    if (!needId) {
      log.end({ status: 400, extra: { reason: "needId_required" } });
      return NextResponse.json({ error: "needId required" }, { status: 400 });
    }

    const need = await getNeed(needId);
    if (!need) {
      log.end({ status: 404, extra: { needId } });
      return NextResponse.json({ error: "need not found" }, { status: 404 });
    }

    const profiles = await getAllProfiles();
    if (profiles.length === 0) {
      log.end({ status: 200, extra: { needId, note: "no_profiles" } });
      return NextResponse.json({ need, matches: [], note: "no_profiles" });
    }

    // Edge case: necesidad sin contexto/skills. El matching todavía corre
    // sobre embeddings de la rawDescription pero la calidad será baja; lo
    // marcamos en el log y le añadimos un aviso al cliente.
    const needHasSignals =
      need.requiredSkills.length > 0 || need.desiredTraits.length > 0 || need.context.length > 0;
    if (!needHasSignals) {
      log.warn("edge.need_without_signals", { needId });
    }

    // 1. Shortlist por similitud semántica
    const scored = profiles
      .map((p) => ({ p, sim: cosineSimilarity(need.embedding, p.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, SHORTLIST_SIZE);

    const shortlist = scored.map((s) => s.p);

    // 2. Ranking batched (1 sola llamada al LLM)
    let llmResults: Map<string, Omit<Match, "profileId" | "profileName">> | null = null;
    let rankingMode: "llm" | "heuristic" | "rate_limited_fallback" = "heuristic";
    let rateLimitedShape: ReturnType<typeof classifyProviderError> | null = null;
    if (hasGeminiKey()) {
      try {
        llmResults = await rankBatchWithLLM(need, shortlist);
        rankingMode = "llm";
      } catch (e) {
        // Si el 429 ocurre en el ranking, NO devolvemos 500 — caemos a la
        // heurística (matching sigue siendo útil) y avisamos al cliente.
        if (isRateLimitError(e)) {
          rateLimitedShape = classifyProviderError(e);
          rankingMode = "rate_limited_fallback";
          log.warn("rate_limited", {
            stage: "ranking",
            message: (e as Error)?.message,
          });
        } else {
          log.warn("rank_batch_failed", { message: (e as Error)?.message });
        }
      }
    }

    const ranked: Match[] = shortlist.map((p) => {
      const r = llmResults?.get(p.id!) ?? heuristicRank(need, p);
      return { profileId: p.id!, profileName: p.name, ...r };
    });

    ranked.sort((a, b) => b.ics - a.ics);
    const matches = ranked.slice(0, RETURN_SIZE);
    log.end({
      status: 200,
      extra: {
        needId,
        rankingMode,
        shortlistSize: shortlist.length,
        matchesReturned: matches.length,
        topIcs: matches[0]?.ics,
      },
    });
    // Combinamos avisos en un solo campo `warning` para que el frontend
    // muestre una sola cinta amarilla, no dos pegadas.
    const warnings: string[] = [];
    if (rateLimitedShape) warnings.push(rateLimitedShape.error);
    if (!needHasSignals)
      warnings.push("La necesidad no tiene contexto estructurado; el ranking puede ser ruidoso.");

    return NextResponse.json({
      need,
      matches,
      ...(warnings.length > 0 && { warning: warnings.join(" ") }),
      ...(rateLimitedShape && { warningCode: rateLimitedShape.code }),
    });
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }
    log.error("match.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json({ error: "Match failed", code: "unknown" }, { status: 500 });
  }
}
