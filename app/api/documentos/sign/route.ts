import { NextRequest, NextResponse } from "next/server";
import { hasCloudinaryConfig, signUpload } from "@/lib/cloudinary";
import { getProfile, listDocumentsByProfile } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_DOCS_PER_PROFILE = 20;

/**
 * POST /api/documentos/sign
 * Body: { profileId, fileName }
 *
 * Devuelve los params firmados para que el cliente haga POST directo a
 * Cloudinary. El secret nunca toca el cliente. Cada upload queda en una
 * carpeta `salto-documents/<profileId>/`.
 *
 * Anti-abuse: máximo 20 documentos por perfil (Cloudinary gratis tiene
 * 25GB de storage; este límite es por usuario, no global).
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "documentos.sign");
  try {
    if (!hasCloudinaryConfig()) {
      log.end({ status: 503, extra: { reason: "no_cloudinary_config" } });
      return NextResponse.json(
        {
          error:
            "Cloudinary no está configurado. Falta CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET en el servidor.",
        },
        { status: 503 },
      );
    }

    const { profileId, fileName } = (await req.json()) as {
      profileId?: string;
      fileName?: string;
    };

    if (!profileId || !fileName) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "profileId y fileName son requeridos" },
        { status: 400 },
      );
    }

    // Validamos que el perfil existe ANTES de firmar (evita uploads huérfanos).
    const profile = await getProfile(profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId } });
      return NextResponse.json({ error: "perfil no encontrado" }, { status: 404 });
    }

    // Anti-abuse: rate limit por cantidad de docs.
    const existing = await listDocumentsByProfile(profileId);
    if (existing.length >= MAX_DOCS_PER_PROFILE) {
      log.warn("edge.too_many_docs", { profileId, count: existing.length });
      log.end({ status: 429, extra: { reason: "too_many_docs" } });
      return NextResponse.json(
        {
          error: `Máximo ${MAX_DOCS_PER_PROFILE} documentos por perfil. Borra alguno viejo antes de subir uno nuevo.`,
          code: "too_many_docs",
        },
        { status: 429 },
      );
    }

    const signed = signUpload({ profileId, fileName });
    if (!signed) {
      log.end({ status: 500, extra: { reason: "sign_failed" } });
      return NextResponse.json(
        { error: "No pudimos firmar el upload." },
        { status: 500 },
      );
    }

    log.end({
      status: 200,
      extra: { profileId, publicId: signed.publicId },
    });
    return NextResponse.json(signed);
  } catch (err) {
    log.error("documentos.sign.exception", { message: (err as Error)?.message });
    log.end({ status: 500 });
    return NextResponse.json({ error: "Error al firmar el upload." }, { status: 500 });
  }
}
