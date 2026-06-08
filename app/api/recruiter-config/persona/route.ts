import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_PERSONALITY,
  isInterviewLanguage,
  isPersonalityPreset,
  PERSONA_DESCRIPTOR_MAX,
  PERSONALITY_PRESETS,
  STYLE_SAMPLE_MAX_CHARS,
  MAX_STYLE_SAMPLES,
  type InterviewLanguage,
  type PersonalityPreset,
} from "@/lib/recruiter-config";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Destila un `personaDescriptor` editable a partir de las muestras de voz de la
 * reclutadora (respuestas del wizard, ejemplos pegados, audios transcritos) +
 * su preset e idioma. El descriptor describe su voz EN SEGUNDA PERSONA para que
 * el entrevistador la imite (tono, calidez, muletillas, qué hace/evita).
 *
 * Es solo ESTILO: el descriptor no introduce hechos ni cambia las reglas duras
 * de la entrevista — se inyecta en buildRecruiterBlock como "voz a imitar".
 *
 * Sin Gemini key → fallback determinista desde el preset (no rompe el wizard).
 */

function buildPresetFallback(
  personality: PersonalityPreset,
  language: InterviewLanguage,
  samples: string[]
): string {
  const presetLine = PERSONALITY_PRESETS[personality]?.promptLine;
  if (language === "en") {
    const base =
      "You speak warmly and closely, like someone who genuinely wants to draw out the person's value. You use everyday, encouraging language and avoid corporate jargon or a robotic tone.";
    const extra = presetLine ? ` ${presetLine}` : "";
    const hint = samples.length
      ? " Mirror the phrasing and warmth shown in the provided examples."
      : "";
    return (base + extra + hint).slice(0, PERSONA_DESCRIPTOR_MAX);
  }
  const base =
    "Hablas de forma cálida y cercana, como alguien que de verdad quiere sacar a la luz el valor de la persona. Usas lenguaje cotidiano y motivador, evitas la jerga corporativa y el tono robótico.";
  const extra = presetLine ? ` ${presetLine}` : "";
  const hint = samples.length
    ? " Imita la forma de expresarse y la calidez de los ejemplos dados."
    : "";
  return (base + extra + hint).slice(0, PERSONA_DESCRIPTOR_MAX);
}

function buildDistillPrompt(
  personality: PersonalityPreset,
  language: InterviewLanguage,
  samples: string[],
  interviewerName?: string,
  focus?: string
): string {
  const langName = language === "en" ? "inglés" : "español neutro latinoamericano";
  const presetLabel = PERSONALITY_PRESETS[personality]?.label ?? "";
  const nameLine = interviewerName
    ? `El entrevistador se llama "${interviewerName}".`
    : "";
  const focusLine = focus ? `Su foco/sector: ${focus}.` : "";
  const samplesBlock = samples.map((s, i) => `[Muestra ${i + 1}] ${s}`).join("\n");

  return `Eres un analista de estilo de comunicación. A partir de las MUESTRAS de cómo habla y da feedback una reclutadora, destila un DESCRIPTOR DE VOZ que un asistente de IA pueda imitar al entrevistar y dar devoluciones.

${nameLine} Preset base de personalidad: "${presetLabel}". ${focusLine}

Reglas del descriptor:
- Escríbelo en SEGUNDA PERSONA ("Hablas...", "Usas...", "Evitas...").
- Captura: tono y calidez, nivel de formalidad, muletillas o expresiones típicas, ritmo, y qué HACE y qué EVITA al comunicarse.
- Es solo ESTILO. NO inventes datos personales, biografía, ni hechos que no estén en las muestras.
- Concreto y accionable, máximo ~140 palabras, en un solo párrafo.
- Idioma del descriptor: ${langName}.

MUESTRAS:
${samplesBlock || "(sin muestras — infiere del preset base, sin inventar hechos)"}

Devuelve SOLO el descriptor, sin encabezados ni comillas.`;
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "recruiter-config.persona");
  try {
    const body = (await req.json()) as {
      styleSamples?: unknown;
      personality?: unknown;
      language?: unknown;
      interviewerName?: unknown;
      focus?: unknown;
    };

    const personality = isPersonalityPreset(body.personality)
      ? body.personality
      : DEFAULT_PERSONALITY;
    const language = isInterviewLanguage(body.language) ? body.language : DEFAULT_LANGUAGE;
    const interviewerName =
      typeof body.interviewerName === "string" ? body.interviewerName.trim().slice(0, 40) : "";
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 200) : "";

    // Aceptamos string[] o StyleSample[] ({text}); normalizamos a textos limpios.
    const rawSamples = Array.isArray(body.styleSamples) ? body.styleSamples : [];
    const samples = rawSamples
      .map((s) => {
        if (typeof s === "string") return s;
        if (s && typeof s === "object" && typeof (s as { text?: unknown }).text === "string") {
          return (s as { text: string }).text;
        }
        return "";
      })
      .map((t) => t.trim().slice(0, STYLE_SAMPLE_MAX_CHARS))
      .filter(Boolean)
      .slice(0, MAX_STYLE_SAMPLES);

    if (!hasGeminiKey()) {
      const personaDescriptor = buildPresetFallback(personality, language, samples);
      log.end({ status: 200, extra: { mode: "fallback_no_key", samples: samples.length } });
      return NextResponse.json({ personaDescriptor, degraded: true, degradedReason: "no_gemini_key" });
    }

    try {
      const prompt = buildDistillPrompt(personality, language, samples, interviewerName, focus);
      const response = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const text = (response.text || "").trim().replace(/^["']|["']$/g, "").trim();
      const personaDescriptor = (text || buildPresetFallback(personality, language, samples)).slice(
        0,
        PERSONA_DESCRIPTOR_MAX
      );
      log.end({ status: 200, extra: { mode: "llm", samples: samples.length, chars: personaDescriptor.length } });
      return NextResponse.json({ personaDescriptor });
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      // Cualquier otro fallo del LLM → fallback determinista (el wizard no muere).
      log.warn("persona.llm_failed_fallback", { message: (err as Error)?.message });
      const personaDescriptor = buildPresetFallback(personality, language, samples);
      log.end({ status: 200, extra: { mode: "fallback_error" } });
      return NextResponse.json({ personaDescriptor, degraded: true, degradedReason: "llm_error" });
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }
    log.error("persona.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos generar tu estilo.", code: "unknown" },
      { status: 500 }
    );
  }
}
