import { NextRequest, NextResponse } from "next/server";
import { listFeedback, recordFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type {
  FeedbackEntry,
  FeedbackTarget,
  FeedbackTouchpoint,
  SignalKind,
} from "@/lib/types";

export const runtime = "nodejs";

/**
 * Feedback loop (PRD §6.2.6 + §8.6).
 *
 * Acepta DOS shapes:
 *
 *   1. LEGACY (sí/no de match):
 *      { matchId | (needId+profileId), useful: boolean, source?, note?, icsAtTime? }
 *      → mapea a touchpoint="match_useful", kind="explicit", binary=useful.
 *
 *   2. V3 (touchpoint-aware, los 17 touchpoints del flow):
 *      {
 *        touchpoint: "interview_quality" | "profile_accuracy" | ...,
 *        kind: "explicit" | "implicit",
 *        targetType: "profile" | "need" | "match" | "microtask" | "evidence" | "suggestion",
 *        targetId: string,
 *        userId?: string, userRole?: "joven"|"empresa",
 *        rating?: 1-5, binary?: bool, text?: string,
 *        icsAtTime?, modelVersion?, needId?, profileId?, note?
 *      }
 *
 *   3. BATCH: el body puede ser un array de cualquiera de los dos shapes.
 *      Útil para emitir múltiples señales en un mismo end-of-flow.
 *
 * Hoy NO se reentrena nada; el dato queda como combustible del data
 * flywheel (foso defensivo del producto, ver dashboard /api/admin/flywheel).
 */

type LegacyPayload = {
  matchId?: string;
  needId?: string;
  profileId?: string;
  useful?: boolean;
  note?: string;
  source?: "empresa_match" | "joven_perfil" | "other";
  icsAtTime?: number;
};

type V3Payload = {
  touchpoint: FeedbackTouchpoint;
  kind?: SignalKind;
  targetType?: FeedbackTarget;
  targetId?: string;
  userId?: string;
  userRole?: "joven" | "empresa";
  rating?: number;
  binary?: boolean;
  text?: string;
  modelVersion?: string;
  // Backward-compatible context fields
  needId?: string;
  profileId?: string;
  matchId?: string;
  source?: "empresa_match" | "joven_perfil" | "other";
  note?: string;
  icsAtTime?: number;
};

type AnyPayload = LegacyPayload | V3Payload;

function isV3(p: AnyPayload): p is V3Payload {
  return typeof (p as V3Payload).touchpoint === "string";
}

/**
 * Construye el `matchId` legacy a partir del payload (necesario porque el
 * shape de Firestore requiere `matchId` no-vacío). Usa el targetId/touchpoint
 * para que las señales de los 17 touchpoints sean idempotentes sin colisionar.
 */
function buildMatchId(p: AnyPayload): string {
  if (p.matchId) return p.matchId;
  if (p.needId && p.profileId) return `${p.needId}__${p.profileId}`;
  if (isV3(p) && p.targetType && p.targetId) return `${p.targetType}__${p.targetId}__${p.touchpoint}`;
  return `signal__${Date.now()}__${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mapea un payload (legacy o v3) al shape persistido `FeedbackEntry`.
 * `useful` se computa así: si vino binary, lo usa; si vino rating, true si ≥ 3.
 */
function toEntry(p: AnyPayload): Omit<FeedbackEntry, "id" | "timestamp"> | null {
  if (isV3(p)) {
    if (!p.touchpoint) return null;
    const useful =
      typeof p.binary === "boolean"
        ? p.binary
        : typeof p.rating === "number"
        ? p.rating >= 3
        : true; // señales implícitas sin valor (clicks) cuentan como positivas
    return {
      matchId: buildMatchId(p),
      needId: p.needId,
      profileId: p.profileId,
      useful,
      source: p.source,
      note: p.note,
      icsAtTime: p.icsAtTime,
      touchpoint: p.touchpoint,
      kind: p.kind ?? "explicit",
      targetType: p.targetType,
      targetId: p.targetId,
      userId: p.userId,
      userRole: p.userRole,
      rating: p.rating,
      binary: p.binary,
      text: p.text,
      modelVersion: p.modelVersion,
      // signalType legacy: derivado del touchpoint cuando aplica
      signalType:
        p.kind === "implicit"
          ? p.touchpoint === "microtask_proposed"
            ? "implicit_microtask"
            : "implicit_connect"
          : p.touchpoint === "microtask_outcome"
          ? "microtask_outcome"
          : "explicit_vote",
      score: p.rating,
    };
  }
  // Legacy
  const matchId = buildMatchId(p);
  if (typeof p.useful !== "boolean") return null;
  return {
    matchId,
    needId: p.needId,
    profileId: p.profileId,
    useful: p.useful,
    source: p.source ?? "empresa_match",
    note: p.note,
    icsAtTime: p.icsAtTime,
    signalType: "explicit_vote",
    touchpoint: "match_useful",
    kind: "explicit",
    targetType: "match",
    targetId: matchId,
    binary: p.useful,
  };
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "feedback");
  try {
    const body = (await req.json()) as AnyPayload | AnyPayload[];
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      log.end({ status: 400, extra: { reason: "empty_payload" } });
      return NextResponse.json(
        { error: "Payload vacío.", code: "fields_required" },
        { status: 400 }
      );
    }

    const ids: string[] = [];
    const rejected: { index: number; reason: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const entry = toEntry(items[i]);
      if (!entry) {
        rejected.push({
          index: i,
          reason: "missing required fields (touchpoint or matchId+useful)",
        });
        continue;
      }
      const id = await recordFeedback(entry);
      ids.push(id);
    }

    log.end({
      status: rejected.length === items.length ? 400 : 200,
      extra: {
        accepted: ids.length,
        rejected: rejected.length,
        touchpoints: items
          .filter(isV3)
          .map((p) => p.touchpoint)
          .filter(Boolean),
      },
    });

    if (rejected.length === items.length) {
      return NextResponse.json(
        { error: "Ningún item válido en el batch.", rejected, code: "fields_required" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, ids, ...(rejected.length > 0 && { rejected }) });
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
 * Endpoint de lectura: usado por /api/admin/flywheel para construir el
 * dashboard, y por el smoke test para verificar persistencia. Soporta
 * filtros opcionales por touchpoint y targetId.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "feedback");
  const all = await listFeedback();
  const touchpoint = req.nextUrl.searchParams.get("touchpoint");
  const targetId = req.nextUrl.searchParams.get("targetId");
  let filtered = all;
  if (touchpoint) filtered = filtered.filter((f) => f.touchpoint === touchpoint);
  if (targetId) filtered = filtered.filter((f) => f.targetId === targetId || f.matchId === targetId);
  log.end({
    status: 200,
    extra: { count: filtered.length, total: all.length, touchpoint, targetId },
  });
  return NextResponse.json({ feedback: filtered });
}
