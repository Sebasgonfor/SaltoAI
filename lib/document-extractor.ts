/**
 * Extractor de habilidades desde documentos (PDFs, imágenes).
 *
 * Usa Gemini multimodal — modelo FLASH completo (NO lite). El lite no procesa
 * bien PDFs; consistentemente devolvía respuestas vacías que rompían el JSON.
 * El thinkingBudget se deja en default (no se desactiva) porque el modelo
 * necesita "leer" el documento antes de extraer las skills.
 *
 * Lógica anti-alucinación: cada skill extraída DEBE traer:
 *   - texto del documento (`evidence`)
 *   - confidence >= 60 (la IA debe estar segura)
 * Cualquier skill que falle alguno de los dos se descarta. Esto es lo que
 * convierte el ICS en "evidencia citada" en vez de "auto-reporte".
 */
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "./gemini";
import type { DocumentKind, DocumentSkill } from "./types";

export const EXTRACT_DOCUMENT_PROMPT = `Eres el extractor de habilidades de documentos de SaltoAI.

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

const EXTRACT_DOCUMENT_SCHEMA = {
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

export interface ExtractionResult {
  kind?: DocumentKind;
  institution?: string;
  programTitle?: string;
  issuedAt?: string;
  extractedSkills?: DocumentSkill[];
  validable?: boolean;
}

/**
 * Resultado tipado de la extracción. `ok=false` lleva un `errorReason`
 * legible para el usuario (no un stack trace).
 */
export type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; errorReason: string };

/** Limpia respuestas que vienen con ```json fences (Gemini a veces lo hace). */
function tryParseJsonTolerant(text: string): ExtractionResult | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as ExtractionResult;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as ExtractionResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getMimeType(format: string): string {
  const fmt = format.toLowerCase();
  if (fmt === "pdf") return "application/pdf";
  if (fmt === "jpg") return "image/jpeg";
  return `image/${fmt}`;
}

/**
 * Extrae skills de un documento alojado en una URL pública (típicamente
 * Cloudinary). Devuelve un `ExtractionOutcome` tipado — el caller decide
 * qué hacer (persistir, retry, mostrar error).
 */
export async function extractDocumentSkills(
  url: string,
  format: string,
): Promise<ExtractionOutcome> {
  if (!hasGeminiKey()) {
    return {
      ok: false,
      errorReason: "Gemini no está configurado en el servidor (falta GEMINI_API_KEY).",
    };
  }

  // 1. Bajamos el archivo. Si Cloudinary falla, no tiene sentido seguir.
  let buf: Buffer;
  try {
    const fetched = await fetch(url);
    if (!fetched.ok) {
      return {
        ok: false,
        errorReason: `No pudimos descargar el documento (HTTP ${fetched.status}).`,
      };
    }
    buf = Buffer.from(await fetched.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      errorReason: `Error de red al descargar el documento: ${(e as Error).message}`,
    };
  }

  // 2. Llamada a Gemini con el modelo flash completo + thinking en default.
  let responseText: string;
  try {
    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: EXTRACT_DOCUMENT_PROMPT },
            { inlineData: { mimeType: getMimeType(format), data: buf.toString("base64") } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACT_DOCUMENT_SCHEMA,
      },
    });
    responseText = response.text || "";
  } catch (e) {
    const msg = (e as Error).message || "";
    console.error("[document-extractor] Gemini error:", msg);
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) {
      return {
        ok: false,
        errorReason: "Estamos sobre el límite de la API de IA por minuto. Reintenta en 1 minuto.",
      };
    }
    if (/SAFETY|blocked|HARM/i.test(msg)) {
      return {
        ok: false,
        errorReason: "El contenido del documento fue bloqueado por filtros de seguridad. Intenta con otra versión.",
      };
    }
    if (/timeout/i.test(msg)) {
      return {
        ok: false,
        errorReason: "La IA tardó demasiado leyendo el documento. Reintenta en unos segundos.",
      };
    }
    return {
      ok: false,
      errorReason: `La IA falló al procesar el documento (${msg.slice(0, 120)}).`,
    };
  }

  // 3. Parse tolerante.
  if (!responseText.trim()) {
    return {
      ok: false,
      errorReason:
        "La IA devolvió una respuesta vacía. El documento puede ser ilegible (escaneado de baja calidad, foto borrosa, etc).",
    };
  }
  const parsed = tryParseJsonTolerant(responseText);
  if (!parsed) {
    console.warn("[document-extractor] No pudimos parsear JSON. Raw:", responseText.slice(0, 500));
    return {
      ok: false,
      errorReason:
        "La IA devolvió una respuesta que no pudimos procesar. Probablemente el documento no es legible.",
    };
  }

  if (parsed.validable === false) {
    return {
      ok: false,
      errorReason:
        "El documento no es legible o no tiene información suficiente. Verifica que sea un certificado/diploma/constancia y que el texto sea claro.",
    };
  }

  // 4. Filtros anti-alucinación: confidence >= 60 + evidence requerida.
  const skills = (parsed.extractedSkills ?? []).filter(
    (s) =>
      s && s.skill && s.evidence && typeof s.confidence === "number" && s.confidence >= 60,
  );

  return {
    ok: true,
    result: { ...parsed, extractedSkills: skills },
  };
}
