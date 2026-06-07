import { NextRequest, NextResponse } from "next/server";
import { getProfile, upsertProfileWithId, storageFromId, reassignMicroTasksProfileId } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/perfil/link — copia un perfil anónimo/local al uid de Firebase
 * cuando el joven inicia sesión y su doc uid aún no existe.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "perfil.link");
  try {
    const body = (await req.json()) as { uid?: string; sourceId?: string };
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";

    if (!uid || !sourceId || uid === sourceId) {
      log.end({ status: 400, extra: { reason: "invalid_ids" } });
      return NextResponse.json({ error: "uid y sourceId requeridos" }, { status: 400 });
    }

    const existing = await getProfile(uid);
    if (existing) {
      await reassignMicroTasksProfileId(sourceId, uid);
      log.end({ status: 200, extra: { profileId: uid, mode: "already_linked", sourceId } });
      return NextResponse.json({ id: uid, profile: existing, storage: storageFromId(uid) });
    }

    const source = await getProfile(sourceId);
    if (!source) {
      log.end({ status: 404, extra: { sourceId } });
      return NextResponse.json({ error: "Perfil origen no encontrado" }, { status: 404 });
    }

    await upsertProfileWithId(uid, {
      ...source,
      embedding: source.embedding,
      createdAt: source.createdAt ?? Date.now(),
      latent: source.latent,
      taskStats: source.taskStats,
    });

    await reassignMicroTasksProfileId(sourceId, uid);

    const saved = await getProfile(uid);
    log.end({ status: 200, extra: { profileId: uid, sourceId, mode: "linked" } });
    return NextResponse.json({ id: uid, profile: saved, storage: storageFromId(uid) });
  } catch (err) {
    log.error("perfil.link.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json({ error: "No pudimos vincular el perfil." }, { status: 500 });
  }
}
