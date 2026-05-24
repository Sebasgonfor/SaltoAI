import type { Match } from "@/lib/types";

function storageKey(needId: string, profileId: string): string {
  return `salto_match_${needId}_${profileId}`;
}

/** Guarda ICS del candidato al navegar desde la lista de matches (evita refetch). */
export function storeMatchForNavigation(
  needId: string,
  profileId: string,
  match: Match
): void {
  try {
    sessionStorage.setItem(storageKey(needId, profileId), JSON.stringify(match));
  } catch {
    /* quota / private mode */
  }
}

export function readStoredMatchForNavigation(
  needId: string,
  profileId: string
): Match | null {
  try {
    const raw = sessionStorage.getItem(storageKey(needId, profileId));
    if (!raw) return null;
    return JSON.parse(raw) as Match;
  } catch {
    return null;
  }
}
