import { NextRequest, NextResponse } from "next/server";
import { getNeed, listNeedsByOwner, listFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, FeedbackEntry } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Radiografía de una necesidad publicada. Alimenta el dashboard rico de
 * `/empresa/matches/[needId]` con:
 *
 *   - `need`            la necesidad estructurada (igual que GET /api/necesidad)
 *   - `companyProfile`  perfil de la empresa: legal, founder, otras needs publicadas.
 *   - `engagement`      counts de señales del feedback log atadas a este need:
 *                       profileClicks, microtaskProposals, matchUsefulCount,
 *                       passReasons, lastActivityAt, distribuciones.
 *
 * Endpoint público (igual que el flywheel) — agrega solo counts y referencias
 * que la empresa misma generó. No expone IDs ni contenido de otras empresas.
 *
 * Diseñado para una sola request por carga de la página: no hace falta
 * coordinar varios fetches en el cliente.
 */

interface CompanyOtherNeed {
  id: string;
  role: string;
  createdAt: number;
  status: "active" | "older";
}

interface EngagementSummary {
  /** Cuántos founders/jóvenes interactuaron con esta need (clicks en perfiles
   *  desde su shortlist, propuestas de microtask, votos útiles, descartes). */
  profileClicks: number;
  microtaskProposals: number;
  matchUsefulCount: number;
  matchNotUsefulCount: number;
  passReasons: number;
  totalSignals: number;
  /** Timestamp ms de la última señal — útil para "hace X días que nadie clickeó". */
  lastActivityAt: number | null;
  /** Top 3 profileIds con más interés (para ranking secundario). */
  topProfileIds: { profileId: string; clicks: number }[];
}

function summarizeEngagement(
  needId: string,
  all: FeedbackEntry[],
): EngagementSummary {
  // Una señal pertenece a este need si:
  //   - `needId` viene explícito en el payload, o
  //   - `targetId` empieza con `${needId}__` (matches v3 con targetId compuesto), o
  //   - `matchId` empieza con `${needId}__` (legacy match feedback).
  const relevant = all.filter((f) => {
    if (f.needId === needId) return true;
    if (f.targetId?.startsWith(`${needId}__`)) return true;
    if (f.matchId?.startsWith(`${needId}__`)) return true;
    return false;
  });

  const profileClicks = relevant.filter(
    (f) => f.touchpoint === "profile_click" || f.signalType === "implicit_connect",
  ).length;

  const microtaskProposals = relevant.filter(
    (f) =>
      f.touchpoint === "microtask_proposed" ||
      f.signalType === "implicit_microtask",
  ).length;

  const matchUseful = relevant.filter(
    (f) =>
      (f.touchpoint === "match_useful" || f.signalType === "explicit_vote") &&
      f.useful === true,
  ).length;

  const matchNotUseful = relevant.filter(
    (f) =>
      (f.touchpoint === "match_useful" || f.signalType === "explicit_vote") &&
      f.useful === false,
  ).length;

  const passReasons = relevant.filter(
    (f) => f.touchpoint === "company_pass_reason",
  ).length;

  const lastActivityAt = relevant.reduce(
    (max, f) => Math.max(max, f.timestamp ?? 0),
    0,
  );

  // Aggregate clicks por profileId para ver qué candidatos despertaron más
  // atención. Útil para que el founder priorice el follow-up.
  const clicksByProfile = new Map<string, number>();
  for (const f of relevant) {
    if (
      (f.touchpoint === "profile_click" ||
        f.signalType === "implicit_connect") &&
      f.profileId
    ) {
      clicksByProfile.set(
        f.profileId,
        (clicksByProfile.get(f.profileId) ?? 0) + 1,
      );
    }
  }
  const topProfileIds = Array.from(clicksByProfile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([profileId, clicks]) => ({ profileId, clicks }));

  return {
    profileClicks,
    microtaskProposals,
    matchUsefulCount: matchUseful,
    matchNotUsefulCount: matchNotUseful,
    passReasons,
    totalSignals: relevant.length,
    lastActivityAt: lastActivityAt || null,
    topProfileIds,
  };
}

function buildCompanyProfile(
  need: CompanyNeed,
  otherNeeds: CompanyNeed[],
): {
  legal: CompanyNeed["legal"] | null;
  ownerName: string | null;
  ownerEmail: string | null;
  totalNeeds: number;
  otherNeeds: CompanyOtherNeed[];
  /** ¿Es la primera vez que esta empresa publica? Importa para señalar
   *  "primera vez en el producto" en la UI con un badge. */
  isFirstNeed: boolean;
} {
  // "Otras" = excluye el actual.
  const others = otherNeeds.filter((n) => n.id !== need.id);
  // 30 días para considerar "activa".
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS;
  return {
    legal: need.legal ?? null,
    ownerName: need.ownerName ?? null,
    ownerEmail: need.ownerEmail ?? null,
    totalNeeds: otherNeeds.length,
    otherNeeds: others.slice(0, 5).map((n) => ({
      id: n.id ?? "",
      role: n.role,
      createdAt: n.createdAt,
      status: n.createdAt > cutoff ? "active" : "older",
    })),
    isFirstNeed: others.length === 0,
  };
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "empresa.radiography");
  const needId = req.nextUrl.searchParams.get("needId");
  if (!needId) {
    log.end({ status: 400, extra: { reason: "missing_need_id" } });
    return NextResponse.json(
      { error: "Falta ?needId=", code: "need_id_required" },
      { status: 400 },
    );
  }

  const need = await getNeed(needId);
  if (!need) {
    log.end({ status: 404, extra: { needId } });
    return NextResponse.json(
      { error: "Necesidad no encontrada", code: "not_found" },
      { status: 404 },
    );
  }

  // Fetch paralelo: otras needs del founder + feedback log.
  const [otherNeeds, feedback] = await Promise.all([
    need.ownerUid ? listNeedsByOwner(need.ownerUid) : Promise.resolve([]),
    listFeedback(),
  ]);

  const companyProfile = buildCompanyProfile(need, otherNeeds);
  const engagement = summarizeEngagement(needId, feedback);

  log.end({
    status: 200,
    extra: {
      needId,
      totalSignals: engagement.totalSignals,
      otherNeedsCount: companyProfile.totalNeeds,
    },
  });

  return NextResponse.json({
    need,
    companyProfile,
    engagement,
  });
}
