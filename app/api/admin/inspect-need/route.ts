import { NextRequest, NextResponse } from "next/server";
import { getNeed } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/admin/inspect-need?id=X  → devuelve la necesidad COMPLETA
 * tal como está en Firestore, incluyendo el bloque `legal`. Sirve para
 * verificar que los datos legales del founder (razón social, NIT, etc)
 * se están persistiendo correctamente desde el chat.
 *
 * Token-protegido. Quita el embedding del response (vector de 768 floats,
 * inútil para inspección manual).
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 8) return false;
  const got = req.headers.get("x-admin-token") || "";
  return got === expected;
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "admin.inspect-need");
  if (!isAuthorized(req)) {
    log.end({ status: 401 });
    return NextResponse.json(
      { error: "unauthorized — requires x-admin-token header" },
      { status: 401 },
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    log.end({ status: 400 });
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const need = await getNeed(id);
  if (!need) {
    log.end({ status: 404, extra: { id } });
    return NextResponse.json({ error: "need no encontrada" }, { status: 404 });
  }

  // Excluimos el embedding del response (vector de 768 floats, inútil).
  const { embedding: _embedding, ...rest } = need;
  void _embedding;
  log.end({
    status: 200,
    extra: {
      id,
      hasLegal: !!need.legal,
      hasOwnerUid: !!need.ownerUid,
    },
  });

  return NextResponse.json({
    ...rest,
    embeddingDim: need.embedding?.length ?? 0,
    legalSaved: !!need.legal,
    ownerSaved: !!need.ownerUid,
  });
}
