import { NextRequest, NextResponse } from "next/server";
import { getNeed, getNeedMatches } from "@/lib/db";
import {
  computeMatchesForNeed,
  getOrComputeMatchesForNeed,
  snapshotToMatchResponse,
  type MatchScope,
} from "@/lib/match-need";
import { isNeedClosed } from "@/lib/need-status";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/match?needId= — devuelve matches persistidos (sin recalcular).
 * POST /api/match { needId, force? } — recalcula solo con force=true; si no hay cache, calcula una vez.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "match");
  try {
    const needId = req.nextUrl.searchParams.get("needId")?.trim() ?? "";
    if (!needId) {
      log.end({ status: 400, extra: { reason: "needId_required" } });
      return NextResponse.json({ error: "needId required" }, { status: 400 });
    }

    const need = await getNeed(needId);
    if (!need) {
      log.end({ status: 404, extra: { needId } });
      return NextResponse.json({ error: "need not found" }, { status: 404 });
    }

    // scope=mine → pool propio del dueño, computado en vivo (sin caché global).
    const scope: MatchScope =
      req.nextUrl.searchParams.get("scope") === "mine" ? "mine" : "all";
    if (scope === "mine") {
      const computed = await getOrComputeMatchesForNeed(needId, { scope: "mine" });
      if (!computed) {
        log.end({ status: 404, extra: { needId } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      log.end({
        status: 200,
        extra: { needId, scope, matchesReturned: computed.snapshot.matches.length },
      });
      return NextResponse.json({
        ...snapshotToMatchResponse(computed.need, computed.snapshot),
        cached: false,
      });
    }

    const snapshot = await getNeedMatches(needId);
    if (!snapshot) {
      const computed = await getOrComputeMatchesForNeed(needId);
      if (!computed) {
        log.end({ status: 404, extra: { needId } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      log.end({
        status: 200,
        extra: {
          needId,
          cached: false,
          firstCompute: true,
          matchesReturned: computed.snapshot.matches.length,
        },
      });
      return NextResponse.json(snapshotToMatchResponse(computed.need, computed.snapshot));
    }

    log.end({
      status: 200,
      extra: {
        needId,
        cached: true,
        matchesReturned: snapshot.matches.length,
        computedAt: snapshot.computedAt,
      },
    });
    return NextResponse.json(snapshotToMatchResponse(need, snapshot));
  } catch (err) {
    log.error("match.get.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json({ error: "Match failed", code: "unknown" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "match");
  try {
    const body = (await req.json()) as { needId?: string; force?: boolean; scope?: string };
    const needId = typeof body.needId === "string" ? body.needId.trim() : "";
    const force = body.force === true;
    const scope: MatchScope = body.scope === "mine" ? "mine" : "all";

    if (!needId) {
      log.end({ status: 400, extra: { reason: "needId_required" } });
      return NextResponse.json({ error: "needId required" }, { status: 400 });
    }

    // scope=mine siempre se computa en vivo (no hay caché que forzar).
    if (force || scope === "mine") {
      const need = await getNeed(needId);
      if (!need) {
        log.end({ status: 404, extra: { needId } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      if (scope === "all" && isNeedClosed(need)) {
        log.end({ status: 400, extra: { needId, reason: "need_closed" } });
        return NextResponse.json(
          {
            error: "Esta vacante está cerrada; no se pueden recalcular matches.",
            code: "need_closed",
          },
          { status: 400 }
        );
      }
      const snapshot = await computeMatchesForNeed(need, scope);
      log.end({
        status: 200,
        extra: { needId, force, scope, matchesReturned: snapshot.matches.length },
      });
      return NextResponse.json({
        ...snapshotToMatchResponse(need, snapshot),
        cached: false,
      });
    }

    const cached = await getNeedMatches(needId);
    if (cached) {
      const need = await getNeed(needId);
      if (!need) {
        log.end({ status: 404, extra: { needId } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      log.end({ status: 200, extra: { needId, cached: true } });
      return NextResponse.json(snapshotToMatchResponse(need, cached));
    }

    const result = await getOrComputeMatchesForNeed(needId);
    if (!result) {
      log.end({ status: 404, extra: { needId } });
      return NextResponse.json({ error: "need not found" }, { status: 404 });
    }

    log.end({
      status: 200,
      extra: {
        needId,
        cached: false,
        matchesReturned: result.snapshot.matches.length,
      },
    });
    return NextResponse.json(snapshotToMatchResponse(result.need, result.snapshot));
  } catch (err) {
    log.error("match.post.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json({ error: "Match failed", code: "unknown" }, { status: 500 });
  }
}
