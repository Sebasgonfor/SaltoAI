import { NextRequest, NextResponse } from "next/server";
import { getNeed, getNeedMatches } from "@/lib/db";
import {
  computeMatchesForNeed,
  getOrComputeMatchesForNeed,
  snapshotToMatchResponse,
} from "@/lib/match-need";
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

    const snapshot = await getNeedMatches(needId);
    if (!snapshot) {
      // #region agent log
      fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'A',location:'app/api/match/route.ts:GET',message:'cache_miss_will_compute',data:{needId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

    // #region agent log
    fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'A',location:'app/api/match/route.ts:GET',message:'cache_hit',data:{needId,matches:snapshot.matches.length,computedAt:snapshot.computedAt},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
    const body = (await req.json()) as { needId?: string; force?: boolean };
    const needId = typeof body.needId === "string" ? body.needId.trim() : "";
    const force = body.force === true;

    if (!needId) {
      log.end({ status: 400, extra: { reason: "needId_required" } });
      return NextResponse.json({ error: "needId required" }, { status: 400 });
    }

    if (force) {
      const need = await getNeed(needId);
      if (!need) {
        log.end({ status: 404, extra: { needId } });
        return NextResponse.json({ error: "need not found" }, { status: 404 });
      }
      const snapshot = await computeMatchesForNeed(need);
      log.end({
        status: 200,
        extra: { needId, force: true, matchesReturned: snapshot.matches.length },
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
