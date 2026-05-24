import { NextRequest, NextResponse } from "next/server";
import { hasGeminiKey } from "@/lib/gemini";
import {
  getDocument,
  listDocumentsByProfile,
  updateDocument,
} from "@/lib/db";
import { extractDocumentSkills } from "@/lib/document-extractor";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/documentos/[id]/retry
 *
 * Re-dispara la extracción de skills sobre un documento que YA está en
 * Cloudinary + Firestore. Sin re-subir. Útil cuando el primer intento falló
 * por timeout, rate limit, error transitorio de Gemini, o porque el documento
 * era ilegible y el usuario sube uno mejor pero quiere reintentar el viejo.
 *
 * Comparte la lógica con POST /api/documentos vía lib/document-extractor.ts.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const log = startLog(req, "documentos.retry");
  try {
    const { id } = await params;
    const doc = await getDocument(id);
    if (!doc) {
      log.end({ status: 404, extra: { id } });
      return NextResponse.json({ error: "documento no encontrado" }, { status: 404 });
    }

    if (!hasGeminiKey()) {
      log.end({ status: 503, extra: { reason: "no_gemini_key" } });
      return NextResponse.json(
        { error: "Gemini no está configurado en el servidor." },
        { status: 503 },
      );
    }

    // Marcamos pending mientras corre — la UI puede mostrar "Analizando…"
    await updateDocument(id, {
      extractionStatus: "pending",
      extractionError: undefined,
    });

    const outcome = await extractDocumentSkills(doc.url, doc.format);

    const patch = outcome.ok
      ? {
          extractionStatus: "done" as const,
          kind: outcome.result.kind,
          institution: outcome.result.institution,
          programTitle: outcome.result.programTitle,
          issuedAt: outcome.result.issuedAt,
          extractedSkills: outcome.result.extractedSkills,
          extractionError: undefined,
        }
      : {
          extractionStatus: "failed" as const,
          extractionError: outcome.errorReason,
        };
    await updateDocument(id, patch);

    const docs = await listDocumentsByProfile(doc.profileId);
    const updated = docs.find((d) => d.id === id);

    log.end({
      status: 200,
      extra: {
        documentId: id,
        outcome: outcome.ok ? "done" : "failed",
        skillsExtracted: outcome.ok ? outcome.result.extractedSkills?.length ?? 0 : 0,
      },
    });

    return NextResponse.json({ document: updated });
  } catch (err) {
    log.error("documentos.retry.exception", { message: (err as Error)?.message });
    log.end({ status: 500 });
    return NextResponse.json(
      { error: "No pudimos reintentar la extracción." },
      { status: 500 },
    );
  }
}
