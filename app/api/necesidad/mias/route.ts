import { NextRequest, NextResponse } from "next/server";
import { listNeedsByOwner } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Lista las necesidades publicadas por el founder actual.
 *
 * El cliente pasa su uid via query (`?uid=...`) o header `x-salto-uid`.
 * No es auth fuerte — el backend SDK del cliente no verifica el ID token
 * todavía (Admin SDK pendiente para el piloto). Pero al menos el dashboard
 * deja de cargar TODAS las necesidades del mundo.
 *
 * Si el uid viene vacío devolvemos array vacío en lugar de error: el
 * dashboard lo muestra como "publicá tu primera necesidad" en lugar de
 * pantalla rota.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "necesidad.mias");
  const uid = req.nextUrl.searchParams.get("uid") || req.headers.get("x-salto-uid") || "";

  if (!uid) {
    log.end({ status: 200, extra: { reason: "no_uid", count: 0 } });
    return NextResponse.json({ needs: [], note: "no_uid" });
  }

  const needs = await listNeedsByOwner(uid);
  log.end({ status: 200, extra: { uid, count: needs.length } });
  return NextResponse.json({ needs });
}
