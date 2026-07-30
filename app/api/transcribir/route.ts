import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Si Gemini no responde en este tiempo, cortamos y devolvemos error en vez
 * de dejar el "Transcribiendo…" colgado. */
const TRANSCRIBE_TIMEOUT_MS = 20_000;

const MAX_BASE64_CHARS = 4 * 1024 * 1024; // ~4 MB base64

const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

const TRANSCRIBE_PROMPT =
  "Transcribe este audio a texto en español (Colombia). Devuelve SOLO lo que dijo la persona, sin comillas ni explicaciones. Si no hay voz audible, devuelve cadena vacía.";

function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() || mimeType;
  return base;
}

function isAllowedMime(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  if (ALLOWED_MIME.has(mimeType) || ALLOWED_MIME.has(normalized)) return true;
  return normalized.startsWith("audio/");
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "transcribir");

  try {
    const body = (await req.json()) as {
      audioBase64?: string;
      mimeType?: string;
      lang?: string;
    };

    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";

    if (!audioBase64 || !mimeType) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "audioBase64 y mimeType son requeridos.", code: "fields_required" },
        { status: 400 }
      );
    }

    if (audioBase64.length > MAX_BASE64_CHARS) {
      log.end({ status: 413, extra: { reason: "audio_too_large" } });
      return NextResponse.json(
        { error: "El audio es demasiado largo. Graba una respuesta más corta.", code: "audio_too_large" },
        { status: 413 }
      );
    }

    if (!isAllowedMime(mimeType)) {
      log.end({ status: 400, extra: { reason: "invalid_mime", mimeType } });
      return NextResponse.json(
        { error: "Formato de audio no soportado.", code: "invalid_mime" },
        { status: 400 }
      );
    }

    if (!hasGeminiKey()) {
      log.end({ status: 503, extra: { reason: "no_gemini_key" } });
      return NextResponse.json(
        {
          error: "El dictado por voz no está disponible ahora. Escribe tu respuesta.",
          code: "no_gemini_key",
        },
        { status: 503 }
      );
    }

    const langHint = body.lang?.trim() ? ` Idioma/región: ${body.lang.trim()}.` : "";
    const prompt = `${TRANSCRIBE_PROMPT}${langHint}`;

    const response = await Promise.race([
      gemini().models.generateContent({
        model: GEMINI_LITE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: normalizeMimeType(mimeType), data: audioBase64 } },
              { text: prompt },
            ],
          },
        ],
        config: {
          // La transcripción es texto plano; sin "thinking" responde en
          // segundos en vez de tardar de más. Acotamos también la salida.
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0,
          maxOutputTokens: 1024,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout:transcribir")), TRANSCRIBE_TIMEOUT_MS)
      ),
    ]);

    const raw = (response.text || "").trim();
    const text = raw.replace(/^["']|["']$/g, "").trim();

    log.end({ status: 200, extra: { chars: text.length, mimeType: normalizeMimeType(mimeType) } });
    return NextResponse.json({ text });
  } catch (err) {
    if ((err as Error)?.message === "timeout:transcribir") {
      log.end({ status: 504, extra: { code: "timeout" } });
      return NextResponse.json(
        {
          error: "La transcripción tardó demasiado. Intentá de nuevo o escribí tu respuesta.",
          code: "timeout",
        },
        { status: 504 }
      );
    }
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }

    const shape = classifyProviderError(err);
    log.error("transcribir.exception", { message: (err as Error)?.message });
    log.end({ status: shape.status, extra: { code: shape.code } });
    return errorResponse(shape);
  }
}
