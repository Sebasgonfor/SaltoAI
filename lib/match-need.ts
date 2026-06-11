import { cosineSimilarity } from "@/lib/embeddings";
import {
  getAllProfiles,
  getNeed,
  getNeedMatches,
  getProfile,
  listProfilesBySourceRecruiter,
  saveNeedMatches,
} from "@/lib/db";
import { scoreCandidates, SHORTLIST_SIZE } from "@/lib/ics";
import { isDemoProfile } from "@/lib/profile-source";
import { isNeedClosed } from "@/lib/need-status";
import type { CompanyNeed, NeedMatchSnapshot } from "@/lib/types";

/**
 * Alcance del pool de candidatos para una necesidad:
 *   - "all"  → pool GLOBAL (todos los jóvenes de la plataforma). Default; es el
 *              marketplace y se cachea por needId (comportamiento histórico).
 *   - "mine" → solo los candidatos del dueño de la necesidad (jóvenes que
 *              entraron por SU link de marca, sourceRecruiterUid === ownerUid).
 *              Pool pequeño → se computa EN VIVO y NO se persiste, para no
 *              contaminar la caché global ni getAllNeedMatches (dashboard).
 */
export type MatchScope = "all" | "mine";

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

export async function computeMatchesForNeed(
  need: CompanyNeed,
  scope: MatchScope = "all",
): Promise<NeedMatchSnapshot> {
  if (!need.id) {
    throw new Error("need_id_required");
  }
  // Solo el pool global se persiste; "mine" se devuelve sin cachear.
  const persist = scope === "all";

  if (isNeedClosed(need)) {
    const cached = await getNeedMatches(need.id);
    if (cached) return cached;
    const empty: NeedMatchSnapshot = {
      needId: need.id,
      matches: [],
      rankingMode: "degraded",
      excluded: [],
      meta: { shortlistSize: 0, llmHits: 0, heuristicHits: 0, profileCount: 0 },
      computedAt: Date.now(),
      warning: "Esta vacante está cerrada; no se generan nuevos matches.",
    };
    return empty;
  }

  const profilesRaw =
    scope === "mine"
      ? need.ownerUid
        ? await listProfilesBySourceRecruiter(need.ownerUid)
        : []
      : await getAllProfiles();
  const resolved = await Promise.all(
    profilesRaw.map(async (p) => (p.id && (await getProfile(p.id)) ? p : null))
  );
  const allReal = resolved.filter((p): p is NonNullable<typeof p> => p != null);
  // Opción 3: el matching NO mezcla perfiles demo/seed (Camila, Andrés, etc.)
  // con candidatos reales. En producción solo entran perfiles reales; los demo
  // se incluyen únicamente si SALTO_INCLUDE_DEMO=1 (para demos controladas).
  const includeDemo = process.env.SALTO_INCLUDE_DEMO === "1";
  const profiles = includeDemo ? allReal : allReal.filter((p) => !isDemoProfile(p.id));

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
    if (persist) await saveNeedMatches(empty);
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

  if (persist) await saveNeedMatches(snapshot);
  return snapshot;
}

export async function getOrComputeMatchesForNeed(
  needId: string,
  opts: { force?: boolean; scope?: MatchScope } = {}
): Promise<{ need: CompanyNeed; snapshot: NeedMatchSnapshot } | null> {
  const need = await getNeed(needId);
  if (!need) return null;

  // "mine" no usa la caché global: siempre se computa en vivo.
  if (opts.scope === "mine") {
    const snapshot = await computeMatchesForNeed(need, "mine");
    return { need, snapshot };
  }

  if (isNeedClosed(need)) {
    const cached = await getNeedMatches(needId);
    if (cached) return { need, snapshot: cached };
    const snapshot = await computeMatchesForNeed(need);
    return { need, snapshot };
  }

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
    closed: isNeedClosed(need),
    ...(snapshot.warning && { warning: snapshot.warning }),
    ...(isNeedClosed(need) && {
      note: "need_closed",
      warning:
        snapshot.warning ??
        "Vacante cerrada: no recibe nuevos candidatos. El ranking es histórico.",
    }),
    ...(snapshot.matches.length === 0 &&
      snapshot.meta.profileCount === 0 &&
      !isNeedClosed(need) && { note: "no_profiles" }),
  };
}
