import { NextRequest, NextResponse } from "next/server";
import { deleteAsset } from "@/lib/cloudinary";
import { deleteDocument, getDocument } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * DELETE /api/documentos/[id]
 *
 * Borra el documento de Firestore Y el asset de Cloudinary. Si falla
 * Cloudinary (asset ya borrado, transient, etc.) igual borramos el doc de
 * Firestore — no queremos huérfanos en nuestra DB.
 *
 * Nota de seguridad: por ahora NO validamos uploaderUid contra la sesión.
 * Esto es un agujero menor en el demo. Cuando agreguemos middleware de auth,
 * verificar que `req.user.uid === doc.uploaderUid` o que `req.user.role === 'admin'`.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const log = startLog(req, "documentos.delete");
  try {
    const { id } = await params;
    if (!id) {
      log.end({ status: 400 });
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const doc = await getDocument(id);
    if (!doc) {
      log.end({ status: 404, extra: { id } });
      return NextResponse.json({ error: "documento no encontrado" }, { status: 404 });
    }

    // Borrar primero de Cloudinary (best-effort), después de Firestore.
    const cloudinaryDeleted = await deleteAsset(doc.publicId, "auto");
    const dbDeleted = await deleteDocument(id);

    log.end({
      status: 200,
      extra: { id, cloudinaryDeleted, dbDeleted, profileId: doc.profileId },
    });

    return NextResponse.json({
      ok: true,
      cloudinaryDeleted,
      dbDeleted,
    });
  } catch (err) {
    log.error("documentos.delete.exception", { message: (err as Error)?.message });
    log.end({ status: 500 });
    return NextResponse.json(
      { error: "No pudimos borrar el documento." },
      { status: 500 },
    );
  }
}
