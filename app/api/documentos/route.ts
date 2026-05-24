import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import {
  createDocument,
  getProfile,
  listDocumentsByProfile,
  updateDocument,
} from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { DocumentKind, DocumentSkill, ProfileDocument } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Persistencia de documentos en Firestore (POST) y listado (GET).
 *
 * POST: el cliente llama a este endpoint DESPUÉS de subir a Cloudinary con
 * el signed URL. Le pasamos la metadata que Cloudinary devolvió. Acá:
 *   1. Persistimos el ProfileDocument en Firestore (`extractionStatus: pending`)
 *   2. Disparamos la extracción de skills con Gemini multimodal (no bloqueante,
 *      pero tampoco fire-and-forget — esperamos para devolver el doc completo).
 *   3. Si la extracción falla, marcamos `extractionStatus: failed` y dejamos
 *      el doc igual visible — el joven puede re-disparar la extracción.
 */

const EXTRACT_PROMPT = `Eres el extractor de habilidades de documentos de SaltoAI.

Recibes un documento (PDF, imagen) de un joven candidato. Puede ser:
  - Un certificado de curso (Platzi, Coursera, SENA, edX, etc.)
  - Un diploma de bachillerato o título universitario
  - Una constancia laboral
  - Un CV físico viejo
  - Otro tipo de documento

Tu trabajo:
1. Identificar el TIPO de documento.
2. Extraer institución emisora, título del programa/grado, fecha (si está).
3. Inferir HABILIDADES con CITA TEXTUAL del documento. SIN CITA, NO LA AGREGAS.
   Ej: "Curso: Marketing Digital con énfasis en SEO" → skill="SEO", evidence="énfasis en SEO".
4. Para cada skill devolvé una confidence 0-100 (cuán segura estás).

CRÍTICO — ANTI-ALUCINACIÓN:
- NO inventes habilidades que no estén respaldadas por texto literal del documento.
- Si el documento no es claro o no podés leerlo, devolvé extractedSkills vacío y validable=false.
- Si la habilidad es muy genérica (ej. "saber leer"), NO la incluyas.

Devuelve JSON con:
{
  "kind": "certificado_curso" | "diploma" | "titulo_universitario" | "constancia_laboral" | "cv_fisico" | "otro",
  "institution": "nombre de la institución emisora o null",
  "programTitle": "título del programa/curso/grado o null",
  "issuedAt": "YYYY-MM o null si no se ve",
  "extractedSkills": [{ "skill": "...", "evidence": "cita del documento", "confidence": 0-100 }],
  "validable": boolean (¿el documento es legible y tiene info suficiente?)
}

Idioma de salida: español neutro latinoamericano.`;

const extractSchema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING },
    institution: { type: Type.STRING },
    programTitle: { type: Type.STRING },
    issuedAt: { type: Type.STRING },
    extractedSkills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          evidence: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ["skill", "evidence", "confidence"],
      },
    },
    validable: { type: Type.BOOLEAN },
  },
  required: ["kind", "extractedSkills", "validable"],
};

interface ExtractionResult {
  kind?: DocumentKind;
  institution?: string;
  programTitle?: string;
  issuedAt?: string;
  extractedSkills?: DocumentSkill[];
  validable?: boolean;
}

async function extractWithGemini(
  url: string,
  format: string,
): Promise<ExtractionResult | null> {
  // Solo PDFs y imágenes — Gemini multimodal acepta ambos como inlineData con
  // mimeType, o como fileUri si lo subimos al File API. Para evitar otro paso,
  // descargamos el bytes y los pasamos inline si pesa <20MB (Cloudinary nos
  // garantiza ≤10MB por nuestro límite client-side).
  const mimeType = format === "pdf" ? "application/pdf" : `image/${format}`;
  try {
    const fetched = await fetch(url);
    if (!fetched.ok) {
      throw new Error(`fetch failed: ${fetched.status}`);
    }
    const buf = Buffer.from(await fetched.arrayBuffer());
    const base64 = buf.toString("base64");

    const response = await gemini().models.generateContent({
      model: GEMINI_LITE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: EXTRACT_PROMPT },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: extractSchema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = JSON.parse(response.text || "{}") as ExtractionResult;

    // Filtramos skills con confidence < 60 y sin evidence (anti-alucinación).
    const skills = (parsed.extractedSkills ?? []).filter(
      (s) => s && s.skill && s.evidence && typeof s.confidence === "number" && s.confidence >= 60,
    );

    return {
      ...parsed,
      extractedSkills: skills,
    };
  } catch (e) {
    console.warn("[documentos] extractWithGemini failed:", (e as Error).message);
    return null;
  }
}

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

    // 2. Extracción (si hay key). NO async-fire-and-forget — esperamos para
    // devolver el doc enriquecido al cliente. Limit superior: ~10s típicos.
    let extracted: ExtractionResult | null = null;
    if (hasGeminiKey()) {
      extracted = await extractWithGemini(body.url, body.format.toLowerCase());
      const patch: Partial<ProfileDocument> = extracted
        ? {
            extractionStatus: extracted.validable !== false ? "done" : "failed",
            kind: extracted.kind,
            institution: extracted.institution,
            programTitle: extracted.programTitle,
            issuedAt: extracted.issuedAt,
            extractedSkills: extracted.extractedSkills,
            ...(extracted.validable === false && {
              extractionError: "Documento ilegible o sin info verificable.",
            }),
          }
        : {
            extractionStatus: "failed",
            extractionError: "La IA no pudo leer el documento. Reintenta o sube otra versión.",
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
