import type { MatchDecision, OpportunityMatch } from "./types";

export type EnrichedDecision = MatchDecision & {
  companyName?: string;
  role?: string;
};

/** Fusiona decisiones de empresa en oportunidades ya cargadas (sin recalcular ICS). */
export function mergeDecisionsIntoOpportunities(
  opportunities: OpportunityMatch[],
  decisions: EnrichedDecision[]
): OpportunityMatch[] {
  const byNeed = new Map(decisions.map((d) => [d.needId, d]));
  const seen = new Set(opportunities.map((o) => o.needId));

  const merged = opportunities.map((o) => {
    const d = byNeed.get(o.needId);
    const st =
      d?.status === "interested" || d?.status === "discarded" ? d.status : null;
    return { ...o, companyStatus: st ?? o.companyStatus ?? null };
  });

  for (const d of decisions) {
    if (d.status !== "interested" || seen.has(d.needId)) continue;
    if (!d.companyName || !d.role) continue;
    merged.push({
      needId: d.needId,
      companyName: d.companyName,
      role: d.role,
      ics: d.icsAtTime ?? 0,
      reason: "Una empresa marcó interés en tu perfil para esta búsqueda.",
      companyStatus: "interested",
    });
    seen.add(d.needId);
  }

  return sortOpportunitiesByInterest(merged);
}

export function sortOpportunitiesByInterest(
  opportunities: OpportunityMatch[]
): OpportunityMatch[] {
  return [...opportunities].sort((a, b) => {
    const aInt = a.companyStatus === "interested" ? 1 : 0;
    const bInt = b.companyStatus === "interested" ? 1 : 0;
    if (aInt !== bInt) return bInt - aInt;
    return b.ics - a.ics;
  });
}
