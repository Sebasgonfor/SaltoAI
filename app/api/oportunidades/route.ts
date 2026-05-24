import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllNeeds, getAllProfiles, getProfile } from "@/lib/db";
import { scoreCandidates, SHORTLIST_SIZE, RETURN_SIZE } from "@/lib/ics";
import { startLog } from "@/lib/logger";
import type { OpportunityMatch, Profile } from "@/lib/types";

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

    // 2. Anchors de calibración: cuando llamamos a scoreCandidates() con UN
    // solo perfil, el LLM no tiene con qué comparar y tiende a inflar todos
    // los scores ("93% para todo" cuando la empresa veía "21%"). Pasamos
    // 3-4 perfiles aleatorios DEL MISMO sistema como referencia comparativa;
    // sus scores se descartan, solo conservamos el del joven que consulta.
    // Esto restaura la simetría con /api/match (que ya naturalmente batched).
    const allProfiles = await getAllProfiles();
    const otherProfiles: Profile[] = allProfiles
      .filter((p) => p.id && p.id !== profile.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    // 3. Para cada necesidad del shortlist, calculamos el ICS contra ESTE
    // joven + anchors. En paralelo con límite de concurrencia.
    const results = await Promise.all(
      shortlistNeeds.map(async (need) => {
        const batch = [profile, ...otherProfiles];
        const scored = await scoreCandidates(need, batch, { applyHardFilter: false });
        // Filtramos para devolver SOLO el del joven que consulta.
        const ours = scored.matches.find((m) => m.profileId === profile.id);
        return { need, scored, ours };
      })
    );

    // 3. Combinamos a OpportunityMatch (lo que espera el frontend del joven).
    const opportunities: OpportunityMatch[] = [];
    let llmCount = 0;
    let degradedCount = 0;
    const excludedNeedIds: string[] = [];

    for (const { need, scored, ours } of results) {
      if (!ours) {
        // El joven cayó fuera del ranking (penalizaciones duras, etc.)
        if (need.id) excludedNeedIds.push(need.id);
        continue;
      }
      if (scored.rankingMode === "llm") llmCount++;
      else degradedCount++;
      opportunities.push({
        needId: need.id!,
        companyName: need.companyName,
        role: need.role,
        ics: ours.ics,
        reason: ours.reason,
        breakdown: ours.breakdown,
        redFlag: ours.redFlag,
        topSkills: ours.topSkills,
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
