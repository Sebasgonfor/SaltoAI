import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllProfiles, getNeed } from "@/lib/db";
import { scoreCandidates, SHORTLIST_SIZE, RETURN_SIZE } from "@/lib/ics";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/match — devuelve hasta 10 candidatos rankeados para una necesidad.
 *
 * Pipeline (toda la lógica en lib/ics.ts):
 *   1. Shortlist por similitud semántica (cosine sobre embeddings).
 *   2. Filtro duro por hardConstraints (ubicación incompatible, edad mínima).
 *   3. Ranking batched con Gemini → 4 sub-scores + reason + redFlag por candidato.
 *      Si Gemini falla → heurística determinística + flag `degraded: true`.
 *   4. Validación posicional: si el LLM devuelve un profileId desalineado, ese
 *      item cae a heurística sin romper el resto del batch.
 */
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

    // Aviso si la necesidad no tiene señales estructuradas (matching ruidoso)
    const needHasSignals =
      need.requiredSkills.length > 0 ||
      need.desiredTraits.length > 0 ||
      need.context.length > 0;
    if (!needHasSignals) {
      log.warn("edge.need_without_signals", { needId });
    }

    // 1. Shortlist semántico
    const shortlist = profiles
      .map((p) => ({ p, sim: cosineSimilarity(need.embedding, p.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, SHORTLIST_SIZE)
      .map((s) => s.p);

    // 2 + 3 + 4. Hard filter + LLM batch + heurística fallback (lib/ics.ts)
    const result = await scoreCandidates(need, shortlist);

    // Combinamos avisos en un solo campo `warning` para el frontend.
    const warnings: string[] = [];
    if (result.degradedReason) warnings.push(result.degradedReason);
    if (!needHasSignals)
      warnings.push(
        "La necesidad no tiene contexto estructurado; el ranking puede ser ruidoso."
      );

    log.end({
      status: 200,
      extra: {
        needId,
        rankingMode: result.rankingMode,
        shortlistSize: result.meta.shortlistSize,
        llmHits: result.meta.llmHits,
        heuristicHits: result.meta.heuristicHits,
        excludedCount: result.excluded.length,
        matchesReturned: result.matches.length,
        topIcs: result.matches[0]?.ics,
        returnSize: RETURN_SIZE,
      },
    });

    return NextResponse.json({
      need,
      matches: result.matches,
      rankingMode: result.rankingMode,
      excluded: result.excluded,
      ...(warnings.length > 0 && { warning: warnings.join(" ") }),
    });
  } catch (err) {
    log.error("match.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "Match failed", code: "unknown" },
      { status: 500 }
    );
  }
}
