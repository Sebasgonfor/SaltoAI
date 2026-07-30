import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { cosineSimilarity } from "@/lib/embeddings";
import {
  getAllNeeds,
  getNeed,
  getProfile,
  getRecruiterConfig,
  getRecruiterConfigBySlug,
} from "@/lib/db";
import { toPromptConfig, type PromptConfig } from "@/lib/recruiter-config";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 25;

/** Resuelve la config de la reclutadora del perfil (para sesgar idioma/foco). */
async function resolveRecruiterCfg(profile: Profile): Promise<PromptConfig | undefined> {
  let rc = null;
  if (profile.sourceRecruiterUid) rc = await getRecruiterConfig(profile.sourceRecruiterUid);
  if (!rc && profile.sourceRecruiterSlug) rc = await getRecruiterConfigBySlug(profile.sourceRecruiterSlug);
  return rc ? toPromptConfig(rc) : undefined;
}

/** Bloque aditivo: idioma + foco de la reclutadora. No cambia el schema. */
function buildGapPersonaBlock(cfg?: PromptConfig): string {
  if (!cfg) return "";
  const L: string[] = [];
  if (cfg.focus) {
    L.push(`Sesga las sugerencias de "missing" hacia el sector/foco: ${cfg.focus} (no asumas tech).`);
  }
  if (cfg.language === "en") {
    L.push("Devuelve TODOS los textos (suggestion, reason, etc.) en INGLÉS.");
  }
  return L.length ? `\n\nPERSONALIZACIÓN (aditiva, no cambia el formato): ${L.join(" ")}` : "";
}

/**
 * GET /api/perfil/gaps?profileId=X[&needId=Y]
 *
 * Análisis de brechas (gap analysis) entre las skills del joven y lo que
 * pide el mercado. Dos modos:
 *
 *  - Por necesidad concreta (?needId=Y): devuelve para ESE rol cuáles
 *    skills del joven cubren los requiredSkills, cuáles los cubren
 *    parcialmente, y cuáles le faltan completamente.
 *
 *  - Agregado (sin needId): corre contra las top-5 necesidades semánticamente
 *    más cercanas al joven y agrega resultados — sirve para mostrar
 *    "skills más pedidas en el mercado que NO tienes".
 *
 * El matching es SEMÁNTICO (vía Gemini), no por substring. "Atención al
 * Cliente" cubre "Manejo de reclamos en local" aunque sean strings
 * distintos. Esto es lo que el ICS ya hace, pero acá lo exponemos
 * skill-por-skill en vez de en agregado.
 */

const GAP_PROMPT = `Eres el analizador de brechas de habilidades de SaltoAI.
Recibes:
  - Las habilidades de un candidato joven (con su evidencia citada).
  - Las habilidades requeridas por una empresa.

Tu trabajo es decir, para CADA requiredSkill, si el candidato la cubre,
la cubre parcialmente, o le falta.

REGLAS:
- covered (cubierta): el candidato tiene una skill que cubre semánticamente
  esa requiredSkill. Devuelve la skill del candidato + la cita de evidencia
  más relevante.
- partial (parcial): el candidato tiene algo relacionado pero no el match
  completo. Ej: la empresa pide "Excel avanzado" y el candidato tiene "Excel
  intermedio" + cita corta. Devuelve la skill que más se acerca + razón breve.
- missing (faltante): el candidato no tiene nada relevante. Devuelve un
  priority 1-5 (5 = más crítico de aprender para este rol) y una sugerencia
  de cómo subsanarla en 1 frase.

NO inventes. Si no hay evidencia, marca como missing.
Español neutro latinoamericano. Tuteo con "tú" (PROHIBIDO voseo).

Devuelve JSON con:
{
  "covered": [{ "requiredSkill": "...", "candidateSkill": "...", "evidence": "cita textual" }],
  "partial": [{ "requiredSkill": "...", "candidateSkill": "...", "reason": "..." }],
  "missing": [{ "requiredSkill": "...", "priority": 1-5, "suggestion": "..." }]
}`;

const itemCoveredSchema = {
  type: Type.OBJECT,
  properties: {
    requiredSkill: { type: Type.STRING },
    candidateSkill: { type: Type.STRING },
    evidence: { type: Type.STRING },
  },
  required: ["requiredSkill", "candidateSkill", "evidence"],
};
const itemPartialSchema = {
  type: Type.OBJECT,
  properties: {
    requiredSkill: { type: Type.STRING },
    candidateSkill: { type: Type.STRING },
    reason: { type: Type.STRING },
  },
  required: ["requiredSkill", "candidateSkill", "reason"],
};
const itemMissingSchema = {
  type: Type.OBJECT,
  properties: {
    requiredSkill: { type: Type.STRING },
    priority: { type: Type.NUMBER },
    suggestion: { type: Type.STRING },
  },
  required: ["requiredSkill", "priority", "suggestion"],
};
const gapSchema = {
  type: Type.OBJECT,
  properties: {
    covered: { type: Type.ARRAY, items: itemCoveredSchema },
    partial: { type: Type.ARRAY, items: itemPartialSchema },
    missing: { type: Type.ARRAY, items: itemMissingSchema },
  },
  required: ["covered", "partial", "missing"],
};

export interface SkillGap {
  needId: string;
  companyName: string;
  role: string;
  covered: { requiredSkill: string; candidateSkill: string; evidence: string }[];
  partial: { requiredSkill: string; candidateSkill: string; reason: string }[];
  missing: { requiredSkill: string; priority: number; suggestion: string }[];
  /** % skills cubiertas (covered + partial*0.5) sobre el total. */
  coveragePct: number;
}

interface AggregatedGap {
  skill: string;
  /** Cuántas necesidades del shortlist piden esta skill que NO tienes. */
  demandedBy: number;
  /** Avg priority. */
  avgPriority: number;
  topNeedExample: string;
  topSuggestion: string;
}

/** Heurística determinística (fallback sin LLM). Substring match básico. */
function heuristicGap(profile: Profile, need: CompanyNeed): SkillGap {
  const norm = (s: string) => s.toLowerCase().trim();
  const profileSkills = profile.skills.map(norm);

  const covered: SkillGap["covered"] = [];
  const missing: SkillGap["missing"] = [];

  for (const req of need.requiredSkills) {
    const n = norm(req);
    const match = profile.skills.find((s) => {
      const ns = norm(s);
      return ns.includes(n) || n.includes(ns);
    });
    if (match) {
      const ev = profile.evidence.find((e) =>
        norm(e.skill).includes(norm(match)) || norm(match).includes(norm(e.skill)),
      );
      covered.push({
        requiredSkill: req,
        candidateSkill: match,
        evidence: ev?.quote ?? "Skill declarada en el perfil (sin cita textual).",
      });
    } else {
      missing.push({
        requiredSkill: req,
        priority: 3,
        suggestion: `Considera tomar un curso introductorio de "${req}".`,
      });
    }
  }

  const total = need.requiredSkills.length || 1;
  const coveragePct = Math.round((covered.length / total) * 100);

  return {
    needId: need.id!,
    companyName: need.companyName,
    role: need.role,
    covered,
    partial: [],
    missing,
    coveragePct,
  };
}

async function gapWithLLM(
  profile: Profile,
  need: CompanyNeed,
  cfg?: PromptConfig
): Promise<SkillGap> {
  const payload = {
    candidato: {
      name: profile.name,
      skills: profile.skills,
      evidence: profile.evidence,
    },
    empresa: {
      role: need.role,
      requiredSkills: need.requiredSkills,
      context: need.context,
    },
  };
  const response = await gemini().models.generateContent({
    model: GEMINI_LITE_MODEL,
    contents: `${GAP_PROMPT}${buildGapPersonaBlock(cfg)}\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: gapSchema,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const parsed = JSON.parse(response.text || "{}");
  const covered = Array.isArray(parsed.covered) ? parsed.covered : [];
  const partial = Array.isArray(parsed.partial) ? parsed.partial : [];
  const missing = Array.isArray(parsed.missing) ? parsed.missing : [];

  const total = need.requiredSkills.length || 1;
  const coveragePct = Math.round(
    ((covered.length + partial.length * 0.5) / total) * 100,
  );

  return {
    needId: need.id!,
    companyName: need.companyName,
    role: need.role,
    covered,
    partial,
    missing,
    coveragePct,
  };
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "perfil.gaps");
  try {
    const profileId = req.nextUrl.searchParams.get("profileId");
    const needIdParam = req.nextUrl.searchParams.get("needId");

    if (!profileId) {
      log.end({ status: 400, extra: { reason: "profileId_required" } });
      return NextResponse.json({ error: "profileId requerido" }, { status: 400 });
    }

    const profile = await getProfile(profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId } });
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    const recruiterCfg = await resolveRecruiterCfg(profile);

    // Modo 1: gap específico para una necesidad concreta.
    if (needIdParam) {
      const need = await getNeed(needIdParam);
      if (!need) {
        log.end({ status: 404, extra: { needId: needIdParam } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      const gap = hasGeminiKey()
        ? await gapWithLLM(profile, need, recruiterCfg).catch(() => heuristicGap(profile, need))
        : heuristicGap(profile, need);
      log.end({
        status: 200,
        extra: { mode: "per_need", coveragePct: gap.coveragePct, missing: gap.missing.length },
      });
      return NextResponse.json({ mode: "per_need", gap });
    }

    // Modo 2: agregado contra top-5 necesidades semánticamente más cercanas.
    const allNeeds = await getAllNeeds();
    if (allNeeds.length === 0) {
      log.end({ status: 200, extra: { mode: "aggregate", note: "no_needs" } });
      return NextResponse.json({
        mode: "aggregate",
        gaps: [],
        aggregated: [],
        note: "no_needs",
      });
    }

    const shortlist = allNeeds
      .map((n) => ({ n, sim: cosineSimilarity(profile.embedding, n.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5)
      .map((s) => s.n);

    const gaps = await Promise.all(
      shortlist.map((need) =>
        hasGeminiKey()
          ? gapWithLLM(profile, need, recruiterCfg).catch(() => heuristicGap(profile, need))
          : Promise.resolve(heuristicGap(profile, need)),
      ),
    );

    // Agregar: ¿qué skills aparecen en .missing de varias necesidades?
    const aggMap = new Map<string, AggregatedGap>();
    for (const gap of gaps) {
      for (const m of gap.missing) {
        const key = m.requiredSkill.toLowerCase().trim();
        const existing = aggMap.get(key);
        if (existing) {
          existing.demandedBy++;
          existing.avgPriority =
            (existing.avgPriority * (existing.demandedBy - 1) + m.priority) /
            existing.demandedBy;
        } else {
          aggMap.set(key, {
            skill: m.requiredSkill,
            demandedBy: 1,
            avgPriority: m.priority,
            topNeedExample: `${gap.companyName} — ${gap.role}`,
            topSuggestion: m.suggestion,
          });
        }
      }
    }
    const aggregated = Array.from(aggMap.values()).sort((a, b) => {
      // Ordenar por (demanda × prioridad)
      const scoreA = a.demandedBy * a.avgPriority;
      const scoreB = b.demandedBy * b.avgPriority;
      return scoreB - scoreA;
    });

    log.end({
      status: 200,
      extra: {
        mode: "aggregate",
        shortlistSize: shortlist.length,
        aggregatedCount: aggregated.length,
      },
    });

    return NextResponse.json({
      mode: "aggregate",
      gaps,
      aggregated,
    });
  } catch (err) {
    log.error("perfil.gaps.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos calcular las brechas." },
      { status: 500 },
    );
  }
}
