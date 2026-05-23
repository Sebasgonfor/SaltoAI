import { NextRequest, NextResponse } from "next/server";
import { listFeedback, recordFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Feedback loop básico (PRD §6.2.6 + §8.6).
 *
 * El founder marca "¿útil? sí/no" en cada match → guardamos
 * `{matchId, needId, profileId, useful, timestamp}` en Firestore
 * (colección `feedback`). Hoy NO se reentrena nada; el dato queda como
 * combustible del data flywheel (foso defensivo del producto).
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "feedback");
  try {
    const body = (await req.json()) as {
      matchId?: string;
      needId?: string;
      profileId?: string;
      useful?: boolean;
      note?: string;
      source?: "empresa_match" | "joven_perfil" | "other";
    };

    // matchId puede venir armado por el cliente, o lo derivamos de needId+profileId
    const matchId = body.matchId ?? (body.needId && body.profileId ? `${body.needId}__${body.profileId}` : undefined);

    if (!matchId || typeof body.useful !== "boolean") {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "matchId (o needId+profileId) y useful (boolean) son requeridos", code: "fields_required" },
        { status: 400 }
      );
    }

    const id = await recordFeedback({
      matchId,
      needId: body.needId,
      profileId: body.profileId,
      useful: body.useful,
      source: body.source ?? "empresa_match",
      note: body.note,
    });

    log.end({
      status: 200,
      extra: { feedbackId: id, matchId, useful: body.useful, source: body.source },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    log.error("feedback.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos guardar el feedback.", code: "unknown" },
      { status: 500 }
    );
  }
}

/**
 * Pequeño endpoint de lectura, útil para auditoría manual durante la demo y
 * para que el smoke test pueda verificar que el feedback persistió.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "feedback");
  const all = await listFeedback();
  log.end({ status: 200, extra: { count: all.length } });
  return NextResponse.json({ feedback: all });
}
