import { NextRequest, NextResponse } from "next/server";
import { getNeed, recordFeedback, updateNeed } from "@/lib/db";
import { isNeedClosed } from "@/lib/need-status";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/necesidad/close — cierra una vacante.
 * Las necesidades cerradas NO entran en /api/oportunidades ni recalculan matches.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "necesidad.close");
  try {
    const body = (await req.json()) as {
      needId?: string;
      companyId?: string;
      hired?: boolean;
      hiredProfileId?: string;
    };

    const needId = typeof body.needId === "string" ? body.needId.trim() : "";
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";

    if (!needId || !companyId) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "needId y companyId son requeridos.", code: "fields_required" },
        { status: 400 }
      );
    }

    const need = await getNeed(needId);
    if (!need) {
      log.end({ status: 404, extra: { needId } });
      return NextResponse.json({ error: "Necesidad no encontrada." }, { status: 404 });
    }

    if (need.ownerUid && need.ownerUid !== companyId) {
      log.end({ status: 403, extra: { needId, companyId } });
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    if (isNeedClosed(need)) {
      log.end({ status: 200, extra: { needId, alreadyClosed: true } });
      return NextResponse.json({ ok: true, need, alreadyClosed: true });
    }

    const hiredProfileId =
      typeof body.hiredProfileId === "string" ? body.hiredProfileId.trim() : undefined;
    const hiredOnClose = typeof body.hired === "boolean" ? body.hired : undefined;

    const updated = await updateNeed(needId, {
      status: "closed",
      closedAt: Date.now(),
      ...(hiredOnClose !== undefined && { hiredOnClose }),
      ...(hiredProfileId && { hiredProfileId }),
    });

    if (hiredOnClose !== undefined) {
      try {
        await recordFeedback({
          matchId: `${needId}__close`,
          needId,
          profileId: hiredProfileId,
          useful: hiredOnClose,
          source: "other",
          touchpoint: "post_hire_followup",
          kind: "explicit",
          targetType: "need",
          targetId: needId,
          userId: companyId,
          userRole: "empresa",
          signalType: "explicit_vote",
          note: hiredOnClose ? "need_close:hired" : "need_close:no_hire",
        });
      } catch (e) {
        log.warn("necesidad.close.feedback_failed", { message: (e as Error).message });
      }
    }

    log.end({ status: 200, extra: { needId, hiredOnClose } });
    return NextResponse.json({ ok: true, need: updated });
  } catch (err) {
    log.error("necesidad.close.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos cerrar la vacante.", code: "unknown" },
      { status: 500 }
    );
  }
}
