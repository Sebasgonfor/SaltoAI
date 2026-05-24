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

  // 1. Bajamos el archivo desde Cloudinary. Validamos AGRESIVAMENTE:
  //    - HTTP debe ser 200 (no 401/403/404)
  //    - Content-Type debe coincidir con el formato esperado (no HTML/JSON
  //      como cuando Cloudinary devuelve una página de error)
  //    - Tamaño debe ser >0 (no empty body)
  let buf: Buffer;
  let actualContentType: string;
  try {
    const fetched = await fetch(url);
    actualContentType = fetched.headers.get("content-type") ?? "";

    if (!fetched.ok) {
      // 401/403 típicamente significa que Cloudinary tiene "PDF and ZIP
      // delivery" deshabilitado en Settings → Security. Devolvemos la
      // instrucción específica al user.
      if (fetched.status === 401 || fetched.status === 403) {
        return {
          ok: false,
          errorReason:
            "Cloudinary bloqueó el acceso al documento (HTTP " +
            fetched.status +
            "). Esto suele ser porque 'PDF and ZIP files delivery' está DESACTIVADO en tu cuenta de Cloudinary. Andá a Settings → Security en console.cloudinary.com y habilítalo. Después subí el documento de nuevo.",
        };
      }
      return {
        ok: false,
        errorReason: `No pudimos descargar el documento de Cloudinary (HTTP ${fetched.status}). URL: ${url.slice(0, 100)}…`,
      };
    }

    const ab = await fetched.arrayBuffer();
    buf = Buffer.from(ab);

    if (buf.length === 0) {
      return {
        ok: false,
        errorReason: "Cloudinary devolvió un archivo vacío (0 bytes). Resubí el documento.",
      };
    }

    // Detección de respuesta HTML/error encubierta: si pedimos un PDF y
    // Cloudinary nos devuelve text/html, casi seguro es una página de error
    // (paywall, restricción, página de "PDF delivery disabled"). NO lo
    // mandamos a Gemini porque va a interpretar HTML como PDF y fallar.
    const fmt = format.toLowerCase();
    const expectedPrefix = fmt === "pdf" ? "application" : "image";
    if (
      actualContentType &&
      !actualContentType.startsWith(expectedPrefix) &&
      !actualContentType.startsWith("application/octet-stream") // raw uploads pueden venir así
    ) {
      return {
        ok: false,
        errorReason:
          `Cloudinary devolvió Content-Type "${actualContentType}" en vez del esperado (${expectedPrefix}/*). ` +
          (fmt === "pdf"
            ? "Probablemente 'PDF and ZIP files delivery' está DESACTIVADO en tu Cloudinary (Settings → Security). Habilítalo y resubí."
            : "Verificá que la URL del archivo esté disponible públicamente."),
      };
    }
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
    console.warn(
      "[document-extractor] Gemini devolvió response.text vacío. format=" + format +
        " bufSize=" + buf.length +
        " contentType=" + actualContentType,
    );
    return {
      ok: false,
      errorReason:
        "La IA devolvió una respuesta vacía. Si subiste un PDF, asegúrate de que el texto sea seleccionable (no un escaneo / foto). Si es una foto del documento, que esté bien iluminada y sin rotar.",
    };
  }
  const parsed = tryParseJsonTolerant(responseText);
  if (!parsed) {
    console.warn(
      "[document-extractor] No pudimos parsear JSON. Raw (500c):",
      responseText.slice(0, 500),
    );
    return {
      ok: false,
      errorReason:
        `La IA devolvió un texto que no pudimos procesar como JSON. Primeros 200 caracteres: "${responseText.slice(0, 200).replace(/\s+/g, " ").trim()}". Reintentá; si persiste, sube otro archivo.`,
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
