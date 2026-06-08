import { NextRequest, NextResponse } from "next/server";
import { Modality } from "@google/genai";
import { geminiAlpha, GEMINI_LIVE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import {
  buildLiveSystemInstruction,
  buildLiveSystemInstructionEmpresa,
} from "@/lib/interview-prompt";
import { getRecruiterConfigBySlug } from "@/lib/db";
import { normalizeSlug, toPromptConfig, type PromptConfig } from "@/lib/recruiter-config";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const log = startLog(req, "live/token");

  try {
    const body = (await req.json()) as {
      firstName?: string;
      mode?: string;
      companyName?: string;
      recruiterSlug?: string;
    };
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const mode = body.mode === "empresa" ? "empresa" : "joven";
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";

    // Personalización por reclutadora (solo modo joven). Slug ausente/no
    // encontrado → cfg undefined → voz genérica actual (cero regresión).
    const recruiterSlug =
      mode === "joven" && typeof body.recruiterSlug === "string"
        ? normalizeSlug(body.recruiterSlug)
        : "";
    let promptCfg: PromptConfig | undefined;
    if (recruiterSlug) {
      const rc = await getRecruiterConfigBySlug(recruiterSlug);
      if (rc) promptCfg = toPromptConfig(rc);
      else log.info("recruiter_config_missing", { recruiterSlug });
    }

    if (!hasGeminiKey()) {
      log.end({ status: 503, extra: { reason: "no_gemini_key" } });
      return NextResponse.json(
        {
          error: "El modo voz no está disponible ahora. Usa modo texto o intenta más tarde.",
          code: "no_gemini_key",
        },
        { status: 503 }
      );
    }

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const token = await geminiAlpha().authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model: GEMINI_LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction:
              mode === "empresa"
                ? buildLiveSystemInstructionEmpresa(companyName || undefined)
                : buildLiveSystemInstruction(firstName || undefined, promptCfg),
            speechConfig: {
              // Native audio Live model only accepts BCP-47 codes it supports (es-CO closes the socket).
              languageCode: "es-US",
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      },
    });

    if (!token.name) {
      log.end({ status: 500, extra: { reason: "no_token_name" } });
      return NextResponse.json(
        { error: "No pudimos iniciar el modo voz.", code: "token_failed" },
        { status: 500 }
      );
    }

    log.end({ status: 200, extra: { model: GEMINI_LIVE_MODEL } });
    return NextResponse.json({
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      apiVersion: "v1alpha",
    });
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }

    const shape = classifyProviderError(err);
    log.error("live.token.exception", { message: (err as Error)?.message });
    log.end({ status: shape.status, extra: { code: shape.code } });
    return errorResponse(shape);
  }
}
