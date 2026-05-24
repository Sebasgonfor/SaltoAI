import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllNeeds, getProfile } from "@/lib/db";
import { scoreCandidates, SHORTLIST_SIZE, RETURN_SIZE } from "@/lib/ics";
import { startLog } from "@/lib/logger";
import type { OpportunityMatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/oportunidades — devuelve necesidades compatibles para un joven.
 *
 * Antes esta ruta usaba heurística pura (skillsFit por substring, learningSignal
 * por regex). Eso producía scores inflados (75% para matches que la empresa
 * vería como 55%). Ahora pasa por la misma `scoreCandidates()` que /api/match:
 * mismo LLM, mismo fallback, mismo cálculo de ICS. Simetría real.
 *
 * Implementación: invertimos el problema — en lugar de "rankea N candidatos
 * para 1 necesidad", hacemos "rankea N necesidades para 1 candidato". El
 * scorer no distingue: la pipeline (shortlist semántico → hard filter → LLM
 * batch → heurística fallback) funciona en ambas direcciones porque la
 * relación (need, profile) → score es simétrica.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "oportunidades");
  try {
    const { profileId } = (await req.json()) as { profileId: string };
    if (!profileId) {
      log.end({ status: 400, extra: { reason: "profileId_required" } });
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const profile = await getProfile(profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId } });
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    const needs = await getAllNeeds();
    if (needs.length === 0) {
      log.end({ status: 200, extra: { profileId, note: "no_needs" } });
      return NextResponse.json({ profile, opportunities: [], note: "no_needs" });
    }

    // 1. Shortlist semántico — top N necesidades más parecidas al embedding del joven.
    const shortlistNeeds = needs
      .map((n) => ({ n, sim: cosineSimilarity(profile.embedding, n.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, SHORTLIST_SIZE)
      .map((s) => s.n);

    // 2. Para cada necesidad del shortlist, calculamos el ICS contra ESTE joven.
    // No batcheamos por necesidad (cada need tiene 1 candidato a evaluar);
    // hacemos N pequeñas llamadas en paralelo con limite de concurrencia.
    // En la práctica para el demo N≤15 y Gemini absorbe bien la concurrencia.
    const results = await Promise.all(
      shortlistNeeds.map(async (need) => {
        const scored = await scoreCandidates(need, [profile], { applyHardFilter: true });
        return { need, scored };
      })
    );

    // 3. Combinamos a OpportunityMatch (lo que espera el frontend del joven).
    const opportunities: OpportunityMatch[] = [];
    let llmCount = 0;
    let degradedCount = 0;
    const excludedNeedIds: string[] = [];

    for (const { need, scored } of results) {
      const match = scored.matches[0];
      if (!match) {
        // Excluido por hardConstraints
        if (need.id) excludedNeedIds.push(need.id);
        continue;
      }
      if (scored.rankingMode === "llm") llmCount++;
      else degradedCount++;
      opportunities.push({
        needId: need.id!,
        companyName: need.companyName,
        role: need.role,
        ics: match.ics,
        reason: match.reason,
        breakdown: match.breakdown,
        redFlag: match.redFlag,
        topSkills: match.topSkills,
      });
    }

    opportunities.sort((a, b) => b.ics - a.ics);
    const top = opportunities.slice(0, RETURN_SIZE);

    log.end({
      status: 200,
      extra: {
        profileId,
        needsTotal: needs.length,
        shortlistSize: shortlistNeeds.length,
        opportunitiesReturned: top.length,
        excludedCount: excludedNeedIds.length,
        llmCount,
        degradedCount,
      },
    });

    return NextResponse.json({
      profile,
      opportunities: top,
      ...(degradedCount > 0 && {
        warning:
          "Algunas oportunidades se calcularon con scoring heurístico. La precisión puede ser menor.",
      }),
    });
  } catch (err) {
    console.error("oportunidades error:", err);
    return NextResponse.json(
      { error: "No pudimos cargar oportunidades." },
      { status: 500 }
    );
  }
}
