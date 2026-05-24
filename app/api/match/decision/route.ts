import { NextRequest, NextResponse } from "next/server";
import {
  getNeed,
  listDecisionsByNeed,
  listDecisionsForProfile,
  recordFeedback,
  upsertMatchDecision,
} from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { MatchDecisionStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID_STATUSES = new Set<MatchDecisionStatus>(["interested", "discarded"]);

export async function POST(req: NextRequest) {
  const log = startLog(req, "match.decision");
  try {
    const body = (await req.json()) as {
      needId?: string;
      profileId?: string;
      companyId?: string;
      status?: MatchDecisionStatus;
      icsAtTime?: number;
    };

    const needId = typeof body.needId === "string" ? body.needId.trim() : "";
    const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const status = body.status;

    if (!needId || !profileId || !companyId || !status || !VALID_STATUSES.has(status)) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        {
          error: "needId, profileId, companyId y status (interested|discarded) son requeridos.",
          code: "fields_required",
        },
        { status: 400 }
      );
    }

    const need = await getNeed(needId);
    if (!need) {
      log.end({ status: 404, extra: { needId } });
      return NextResponse.json({ error: "Necesidad no encontrada." }, { status: 404 });
    }

    const ownerUid = need.ownerUid;
    if (!ownerUid || ownerUid !== companyId) {
      log.end({ status: 403, extra: { needId, companyId } });
      return NextResponse.json(
        { error: "No autorizado para decidir sobre esta búsqueda." },
        { status: 403 }
      );
    }

    const decision = await upsertMatchDecision({
      needId,
      profileId,
      companyId,
      status: status as "interested" | "discarded",
      ...(typeof body.icsAtTime === "number" && { icsAtTime: body.icsAtTime }),
    });

    const matchId = `${needId}__${profileId}`;
    await recordFeedback({
      matchId,
      needId,
      profileId,
      useful: status === "interested",
      source: "empresa_match",
      signalType: "explicit_vote",
      ...(typeof body.icsAtTime === "number" && { icsAtTime: body.icsAtTime }),
    });

    log.end({ status: 200, extra: { needId, profileId, status } });
    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    log.error("match.decision.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos guardar la decisión.", code: "unknown" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "match.decision");
  const needId = req.nextUrl.searchParams.get("needId");
  const profileId = req.nextUrl.searchParams.get("profileId");

  if (needId) {
    const decisions = await listDecisionsByNeed(needId);
    log.end({ status: 200, extra: { needId, count: decisions.length } });
    return NextResponse.json({ decisions });
  }

  if (profileId) {
    const decisions = await listDecisionsForProfile(profileId);
    const enriched = await Promise.all(
      decisions.map(async (d) => {
        const need = await getNeed(d.needId);
        return {
          ...d,
          companyName: need?.companyName,
          role: need?.role,
        };
      })
    );
    log.end({ status: 200, extra: { profileId, count: enriched.length } });
    return NextResponse.json(
      { decisions: enriched },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  log.end({ status: 400, extra: { reason: "needId_or_profileId_required" } });
  return NextResponse.json(
    { error: "Indica needId o profileId.", code: "fields_required" },
    { status: 400 }
  );
}
