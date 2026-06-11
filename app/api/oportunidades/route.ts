import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import {
  getAllNeeds,
  getNeed,
  getNeedMatches,
  getProfile,
  getYouthMatches,
  saveYouthMatches,
  listDecisionsForProfile,
} from "@/lib/db";
import { RETURN_SIZE, scoreNeedsForProfile } from "@/lib/ics";
import { isNeedOpen } from "@/lib/need-status";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, OpportunityMatch, Profile, YouthMatchSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tiempo de vida del cache joven-céntrico (colección youth_matches). */
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Calcula las oportunidades de un joven de forma JOVEN-CÉNTRICA:
 *  1. Shortlist de necesidades por similitud de embedding.
 *  2. Si el joven ya está en el snapshot empresa-céntrico de una necesidad,
 *     reusamos ESE ICS (autoritativo — es el mismo número que ve la empresa).
 *  3. Para el resto, UNA llamada LLM scorea al joven contra todas a la vez
 *     (con fallback heurístico). Así toda oportunidad tiene ICS real, no
 *     heurística por falta de un score precalculado.
 */
async function computeYouthOpportunities(
  profile: Profile,
  needs: CompanyNeed[]
): Promise<{ opportunities: OpportunityMatch[]; rankingMode: "llm" | "degraded"; degradedReason?: string }> {
  // Devolvemos RETURN_SIZE; scoreamos un poco más como buffer por si alguna
  // necesidad queda excluida por hard constraints. Acotar aquí baja la latencia
  // y el costo del batch LLM (scorear 20 cuando mostramos 10 es desperdicio).
  const shortlist = needs
    .map((n) => ({ n, sim: cosineSimilarity(profile.embedding, n.embedding) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, RETURN_SIZE + 4)
    .map((s) => s.n);

  const fromSnapshot: OpportunityMatch[] = [];
  const toScore: CompanyNeed[] = [];
  for (const need of shortlist) {
    if (!need.id) continue;
    const snap = await getNeedMatches(need.id);
    const ours = snap?.matches.find((m) => m.profileId === profile.id);
    if (ours) {
      fromSnapshot.push({
        needId: need.id,
        companyName: need.companyName,
        role: need.role,
        ics: ours.ics,
        reason: ours.reason,
        breakdown: ours.breakdown,
        redFlag: ours.redFlag,
        topSkills: ours.topSkills,
      });
    } else {
      toScore.push(need);
    }
  }

  let rankingMode: "llm" | "degraded" = "llm";
  let degradedReason: string | undefined;
  const scored: OpportunityMatch[] = [];
  if (toScore.length > 0) {
    const result = await scoreNeedsForProfile(profile, toScore);
    if (result.rankingMode === "degraded") {
      rankingMode = "degraded";
      degradedReason = result.degradedReason;
    }
    for (const need of toScore) {
      const s = result.scores.get(need.id!);
      if (!s) continue; // excluido por hard constraints → no se muestra
      scored.push({
        needId: need.id!,
        companyName: need.companyName,
        role: need.role,
        ics: s.ics,
        reason: s.reason,
        breakdown: s.breakdown,
        redFlag: s.redFlag,
        topSkills: s.topSkills,
        ...(result.rankingMode === "degraded" && { estimated: true }),
      });
    }
  }

  return { opportunities: [...fromSnapshot, ...scored], rankingMode, degradedReason };
}

/**
 * POST /api/oportunidades — necesidades compatibles para un joven.
 * Body: { profileId: string, force?: boolean }
 *
 * El scoring LLM (caro) se cachea por joven en youth_matches; las decisiones de
 * empresa (interested/discarded) se superponen frescas en cada request (baratas).
 * `force: true` (botón "Recalcular") salta el cache.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "oportunidades");
  try {
    const { profileId, force } = (await req.json()) as { profileId: string; force?: boolean };
    if (!profileId) {
      log.end({ status: 400, extra: { reason: "profileId_required" } });
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const profile = await getProfile(profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId } });
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    // La página solo necesita id + name para el encabezado; no devolvemos el
    // perfil completo (embedding/transcript/evidencia) — payload de más.
    const profileSummary = { id: profile.id, name: profile.name };

    const needs = (await getAllNeeds()).filter(isNeedOpen);
    if (needs.length === 0) {
      log.end({ status: 200, extra: { profileId, note: "no_needs" } });
      return NextResponse.json({ profile: profileSummary, opportunities: [], note: "no_needs" });
    }

    // 1. Scoring base (cacheado). Se recalcula si: force, cache vencido, o
    //    cambió el nº de necesidades abiertas (apareció/cerró una).
    const cached = force ? null : await getYouthMatches(profileId);
    const cacheFresh =
      cached &&
      Date.now() - cached.computedAt < CACHE_TTL_MS &&
      cached.needsConsidered === needs.length;

    let baseOpportunities: OpportunityMatch[];
    let rankingMode: "llm" | "degraded";
    let fromCache = false;
    if (cacheFresh && cached) {
      baseOpportunities = cached.opportunities;
      rankingMode = cached.rankingMode;
      fromCache = true;
    } else {
      const computed = await computeYouthOpportunities(profile, needs);
      baseOpportunities = computed.opportunities;
      rankingMode = computed.rankingMode;
      const snapshot: YouthMatchSnapshot = {
        profileId,
        opportunities: baseOpportunities,
        rankingMode,
        needsConsidered: needs.length,
        ...(computed.degradedReason && { degradedReason: computed.degradedReason }),
        computedAt: Date.now(),
      };
      await saveYouthMatches(snapshot);
    }

    // 2. Overlay de decisiones de empresa (siempre fresco, sin LLM).
    const decisions = await listDecisionsForProfile(profileId);
    const statusByNeed = new Map(
      decisions.map((d) => [
        d.needId,
        d.status === "interested" || d.status === "discarded" ? d.status : null,
      ])
    );

    const opportunities: OpportunityMatch[] = baseOpportunities.map((o) => ({
      ...o,
      companyStatus: statusByNeed.get(o.needId) ?? null,
    }));

    // Necesidades donde la empresa marcó interés pero no están en el shortlist.
    for (const d of decisions) {
      if (d.status !== "interested") continue;
      if (opportunities.some((o) => o.needId === d.needId)) continue;
      const need = await getNeed(d.needId);
      if (!need?.id) continue;
      opportunities.push({
        needId: need.id,
        companyName: need.companyName,
        role: need.role,
        ics: d.icsAtTime ?? 0,
        reason: "Una empresa marcó interés en tu perfil para esta búsqueda.",
        companyStatus: "interested",
      });
    }

    opportunities.sort((a, b) => {
      const aInt = a.companyStatus === "interested" ? 1 : 0;
      const bInt = b.companyStatus === "interested" ? 1 : 0;
      if (aInt !== bInt) return bInt - aInt;
      return b.ics - a.ics;
    });

    const interested = opportunities.filter((o) => o.companyStatus === "interested");
    const rest = opportunities
      .filter((o) => o.companyStatus !== "interested")
      .slice(0, Math.max(0, RETURN_SIZE - interested.length));
    const top = [...interested, ...rest];

    log.end({
      status: 200,
      extra: {
        profileId,
        needsTotal: needs.length,
        opportunitiesReturned: top.length,
        rankingMode,
        fromCache,
        force: force === true,
      },
    });

    return NextResponse.json({
      profile: profileSummary,
      opportunities: top,
      ...(rankingMode === "degraded" && {
        warning:
          "Algunas oportunidades se calcularon con scoring heurístico estimado (la IA no respondió a tiempo). Toca Recalcular en un momento para afinar tu ICS.",
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
