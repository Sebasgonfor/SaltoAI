import { NextRequest, NextResponse } from "next/server";
import { getProfile, upsertProfileWithId, storageFromId } from "@/lib/db";
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
      log.end({ status: 200, extra: { profileId: uid, mode: "already_linked" } });
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

    const saved = await getProfile(uid);
    // #region agent log
    fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'D',location:'app/api/perfil/link/route.ts',message:'profile_linked',data:{uid,sourceId,mode:'linked'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    log.end({ status: 200, extra: { profileId: uid, sourceId, mode: "linked" } });
    return NextResponse.json({ id: uid, profile: saved, storage: storageFromId(uid) });
  } catch (err) {
    log.error("perfil.link.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json({ error: "No pudimos vincular el perfil." }, { status: 500 });
  }
}
