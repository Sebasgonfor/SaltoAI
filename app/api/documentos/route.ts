import { NextRequest, NextResponse } from "next/server";
import { hasGeminiKey } from "@/lib/gemini";
import {
  createDocument,
  getProfile,
  listDocumentsByProfile,
  updateDocument,
} from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { ProfileDocument } from "@/lib/types";
import { extractDocumentSkills } from "@/lib/document-extractor";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Persistencia de documentos en Firestore (POST) y listado (GET).
 *
 * POST: el cliente llama a este endpoint DESPUÉS de subir a Cloudinary con
 * el signed URL. Le pasamos la metadata que Cloudinary devolvió. Acá:
 *   1. Persistimos el ProfileDocument en Firestore (`extractionStatus: pending`)
 *   2. Disparamos la extracción de skills con Gemini multimodal (`lib/document-extractor.ts`).
 *   3. Si la extracción falla, marcamos `extractionStatus: failed` con razón
 *      legible y dejamos el doc visible — el joven puede reintentar con
 *      POST /api/documentos/[id]/retry.
 *
 * El extractor en sí vive en `lib/document-extractor.ts` para que el endpoint
 * de retry pueda reusarlo sin duplicar prompt/schema/manejo de errores.
 */

/** POST /api/documentos — persiste un doc subido a Cloudinary y dispara extracción. */
export async function POST(req: NextRequest) {
  const log = startLog(req, "documentos.create");
  try {
    const body = (await req.json()) as {
      profileId?: string;
      url?: string;
      publicId?: string;
      format?: string;
      bytes?: number;
      originalName?: string;
      uploaderUid?: string;
    };

    if (!body.profileId || !body.url || !body.publicId || !body.format || !body.originalName) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        {
          error:
            "profileId, url, publicId, format y originalName son requeridos",
        },
        { status: 400 },
      );
    }

    const profile = await getProfile(body.profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId: body.profileId } });
      return NextResponse.json({ error: "perfil no encontrado" }, { status: 404 });
    }

    // 1. Persistir con extractionStatus=pending
    const { id } = await createDocument({
      profileId: body.profileId,
      uploaderUid: body.uploaderUid,
      url: body.url,
      publicId: body.publicId,
      format: body.format.toLowerCase(),
      bytes: body.bytes ?? 0,
      originalName: body.originalName,
      extractionStatus: hasGeminiKey() ? "pending" : "skipped",
    });

    // 2. Extracción (si hay key). Esperamos para devolver el doc enriquecido.
    if (hasGeminiKey()) {
      const outcome = await extractDocumentSkills(body.url, body.format.toLowerCase());
      const patch: Partial<ProfileDocument> = outcome.ok
        ? {
            extractionStatus: "done",
            kind: outcome.result.kind,
            institution: outcome.result.institution,
            programTitle: outcome.result.programTitle,
            issuedAt: outcome.result.issuedAt,
            extractedSkills: outcome.result.extractedSkills,
            extractionError: undefined,
          }
        : {
            extractionStatus: "failed",
            extractionError: outcome.errorReason,
          };
      await updateDocument(id, patch);
    }

    // 3. Devolver el doc final (con la extracción si la hicimos)
    const docs = await listDocumentsByProfile(body.profileId);
    const created = docs.find((d) => d.id === id);

    log.end({
      status: 200,
      extra: {
        documentId: id,
        profileId: body.profileId,
        extractionStatus: created?.extractionStatus,
        skillsExtracted: created?.extractedSkills?.length ?? 0,
      },
    });

    return NextResponse.json({ document: created });
  } catch (err) {
    log.error("documentos.create.exception", { message: (err as Error)?.message });
    log.end({ status: 500 });
    return NextResponse.json(
      { error: "No pudimos guardar el documento." },
      { status: 500 },
    );
  }
}

/** GET /api/documentos?profileId=X — lista los docs del perfil. */
export async function GET(req: NextRequest) {
  const log = startLog(req, "documentos.list");
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    log.end({ status: 400 });
    return NextResponse.json({ error: "profileId requerido" }, { status: 400 });
  }
  const docs = await listDocumentsByProfile(profileId);
  log.end({ status: 200, extra: { profileId, count: docs.length } });
  return NextResponse.json({ documents: docs });
}
