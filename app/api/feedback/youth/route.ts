import { NextRequest, NextResponse } from "next/server";
import { listFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { FeedbackEntry } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Inbox de feedback DIRIGIDO al joven (PRD §8.6 v4 — bidireccional).
 *
 * Una empresa puede dejarle al joven:
 *   - `company_feedback_to_youth`: comentario + rating sobre su candidatura.
 *   - `company_pass_reason`: razón corta del descarte (no avanzó con el perfil).
 *
 * El joven puede responder a cualquiera con `youth_reply_to_company`. Esos
 * replies tienen `parentFeedbackId` apuntando al feedback original, y este
 * endpoint los anida en el hilo correcto.
 *
 * Filtra por `?profileId=X` (el joven dueño del perfil). Sin profileId
 * devuelve 400 — endpoint inútil sin contexto.
 *
 * No requiere auth en este MVP. En producción: validar que el `profileId`
 * solicitado coincide con el `uid` del joven autenticado. Hoy las API
 * routes corren con Web SDK sin auth (ver firestore.rules), así que la
 * protección efectiva vive en el cliente: solo el dueño del perfil ve
 * los CTAs que llevan acá.
 */

interface FeedbackThread {
  /** Feedback de la empresa (parent). */
  feedback: FeedbackEntry;
  /** Replies del joven en orden cronológico. */
  replies: FeedbackEntry[];
}

const COMPANY_TOUCHPOINTS = new Set<FeedbackEntry["touchpoint"]>([
  "company_feedback_to_youth",
  "company_pass_reason",
]);

export async function GET(req: NextRequest) {
  const log = startLog(req, "feedback.youth");
  const profileId = req.nextUrl.searchParams.get("profileId");
  // `uid` opcional: si el joven está autenticado, puede pasar su user.uid
  // ADEMÁS del profileId del URL. El endpoint busca feedback contra AMBOS
  // (deduplicados) — soluciona el caso donde la empresa dejó feedback
  // contra un perfil con id distinto al user.uid del joven (ej. perfiles
  // del seed con id=seed_xxx vs uid del joven real autenticado).
  // Sin esto, un joven que tuvo su perfil persistido bajo dos ids
  // distintos en el tiempo (legacy local_… + uid actual) podía no ver
  // feedback dejado contra cualquiera de los dos.
  const uid = req.nextUrl.searchParams.get("uid");
  if (!profileId) {
    log.end({ status: 400, extra: { reason: "missing_profile_id" } });
    return NextResponse.json(
      { error: "Falta ?profileId=", code: "profile_id_required" },
      { status: 400 }
    );
  }

  const targetIds = new Set<string>([profileId]);
  if (uid && uid !== profileId) targetIds.add(uid);

  const all = await listFeedback();

  // 1. Feedback dirigido a este joven (parent): targetType=profile + targetId
  //    en el set de aliases del joven + touchpoint en company→youth.
  const parents = all.filter(
    (f) =>
      COMPANY_TOUCHPOINTS.has(f.touchpoint) &&
      f.targetType === "profile" &&
      typeof f.targetId === "string" &&
      targetIds.has(f.targetId),
  );

  // 2. Replies del joven: youth_reply_to_company con parentFeedbackId
  //    apuntando a uno de los parents.
  const replies = all.filter(
    (f) => f.touchpoint === "youth_reply_to_company" && !!f.parentFeedbackId,
  );

  // 3. Indexar replies por parent y armar threads.
  const byParent = new Map<string, FeedbackEntry[]>();
  for (const r of replies) {
    const pid = r.parentFeedbackId as string;
    const bucket = byParent.get(pid) ?? [];
    bucket.push(r);
    byParent.set(pid, bucket);
  }

  const threads: FeedbackThread[] = parents
    .map((p) => ({
      feedback: p,
      replies: (byParent.get(p.id ?? "") ?? []).sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      ),
    }))
    .sort((a, b) => (b.feedback.timestamp ?? 0) - (a.feedback.timestamp ?? 0));

  log.end({
    status: 200,
    extra: {
      profileId,
      uidAlias: uid && uid !== profileId ? uid : undefined,
      threadCount: threads.length,
      replyCount: replies.length,
    },
  });

  return NextResponse.json({
    profileId,
    threads,
    // Para que el cliente pueda mostrar contadores sin recorrer threads.
    summary: {
      total: threads.length,
      withReplies: threads.filter((t) => t.replies.length > 0).length,
      passReasons: threads.filter(
        (t) => t.feedback.touchpoint === "company_pass_reason",
      ).length,
      positives: threads.filter(
        (t) =>
          t.feedback.touchpoint === "company_feedback_to_youth" &&
          (t.feedback.rating ?? 0) >= 4,
      ).length,
    },
  });
}
