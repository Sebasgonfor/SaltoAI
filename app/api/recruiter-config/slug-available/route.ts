import { NextRequest, NextResponse } from "next/server";
import { isSlugAvailable } from "@/lib/db";
import { isValidSlug, normalizeSlug } from "@/lib/recruiter-config";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Disponibilidad de slug para el chequeo en vivo del formulario.
 *
 *   GET ?slug=maria&uid=abc → { slug: "maria", valid: true, available: true }
 *
 * `uid` es opcional: si llega, el slug que ya posee esa misma reclutadora se
 * considera disponible para ella (puede re-guardar sin colisionar consigo misma).
 * Normaliza el slug igual que el guardado para que el preview coincida.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "recruiter-config.slug-available");
  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const uid = req.nextUrl.searchParams.get("uid")?.trim() ?? "";
  const slug = normalizeSlug(raw);

  if (!isValidSlug(slug)) {
    log.end({ status: 200, extra: { slug, valid: false } });
    return NextResponse.json({ slug, valid: false, available: false });
  }

  const available = await isSlugAvailable(slug, uid);
  log.end({ status: 200, extra: { slug, valid: true, available } });
  return NextResponse.json({ slug, valid: true, available });
}
