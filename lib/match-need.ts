import { cosineSimilarity } from "@/lib/embeddings";
import { getAllProfiles, getNeed, getNeedMatches, getProfile, saveNeedMatches } from "@/lib/db";
import { scoreCandidates, SHORTLIST_SIZE } from "@/lib/ics";
import type { CompanyNeed, NeedMatchSnapshot } from "@/lib/types";

function buildWarning(need: CompanyNeed, degradedReason?: string): string | undefined {
  const warnings: string[] = [];
  if (degradedReason) warnings.push(degradedReason);
  const needHasSignals =
    need.requiredSkills.length > 0 ||
    need.desiredTraits.length > 0 ||
    need.context.length > 0;
  if (!needHasSignals) {
    warnings.push("La necesidad no tiene contexto estructurado; el ranking puede ser ruidoso.");
  }
  return warnings.length > 0 ? warnings.join(" ") : undefined;
}

export async function computeMatchesForNeed(need: CompanyNeed): Promise<NeedMatchSnapshot> {
  if (!need.id) {
    throw new Error("need_id_required");
  }

  const profilesRaw = await getAllProfiles();
  const resolved = await Promise.all(
    profilesRaw.map(async (p) => (p.id && (await getProfile(p.id)) ? p : null))
  );
  const profiles = resolved.filter((p): p is NonNullable<typeof p> => p != null);

  if (profiles.length === 0) {
    const empty: NeedMatchSnapshot = {
      needId: need.id,
      matches: [],
      rankingMode: "degraded",
      excluded: [],
      meta: {
        shortlistSize: 0,
        llmHits: 0,
        heuristicHits: 0,
        profileCount: 0,
      },
      computedAt: Date.now(),
    };
    await saveNeedMatches(empty);
    return empty;
  }

  const shortlist = profiles
    .map((p) => ({ p, sim: cosineSimilarity(need.embedding, p.embedding) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, SHORTLIST_SIZE)
    .map((s) => s.p);

  const result = await scoreCandidates(need, shortlist);
  const snapshot: NeedMatchSnapshot = {
    needId: need.id,
    matches: result.matches,
    rankingMode: result.rankingMode,
    degradedReason: result.degradedReason,
    excluded: result.excluded,
    meta: {
      ...result.meta,
      profileCount: profiles.length,
    },
    warning: buildWarning(need, result.degradedReason),
    computedAt: Date.now(),
  };

  await saveNeedMatches(snapshot);
  return snapshot;
}

export async function getOrComputeMatchesForNeed(
  needId: string,
  opts: { force?: boolean } = {}
): Promise<{ need: CompanyNeed; snapshot: NeedMatchSnapshot } | null> {
  const need = await getNeed(needId);
  if (!need) return null;

  if (!opts.force) {
    const cached = await getNeedMatches(needId);
    if (cached) return { need, snapshot: cached };
  }

  const snapshot = await computeMatchesForNeed(need);
  return { need, snapshot };
}

export function snapshotToMatchResponse(need: CompanyNeed, snapshot: NeedMatchSnapshot) {
  return {
    need,
    matches: snapshot.matches,
    rankingMode: snapshot.rankingMode,
    excluded: snapshot.excluded,
    cached: true,
    computedAt: snapshot.computedAt,
    ...(snapshot.warning && { warning: snapshot.warning }),
    ...(snapshot.matches.length === 0 &&
      snapshot.meta.profileCount === 0 && { note: "no_profiles" }),
  };
}
