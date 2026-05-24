import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import {
  buildOpeningQuestionPrompt,
  buildRestInterviewSystemPrompt,
  buildShortAnswerFollowupPrompt,
  buildSimilarQuestionRetryNote,
  CLOSING_MESSAGE,
  MAX_USER_TURNS,
  MIN_USER_TURNS,
  pickFallbackOpening,
  pickFallbackQuestion,
} from "@/lib/interview-prompt";
import {
  countUserTurns,
  isLastAnswerTooShort,
  isYesNoQuestion,
  lastAgentMessage,
  validateChatMessage,
  CHAT_MESSAGE_MAX_CHARS,
} from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEMINI_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const SYSTEM_PROMPT = buildRestInterviewSystemPrompt();

const schema = {
  type: Type.OBJECT,
  properties: {
    nextQuestion: { type: Type.STRING },
    done: { type: Type.BOOLEAN },
    targetedSignal: { type: Type.STRING },
    signalsCovered: { type: Type.ARRAY, items: { type: Type.STRING } },
    reasoning: { type: Type.STRING },
  },
  required: ["nextQuestion", "done"],
};

const TARGET_SIGNALS = [
  "iniciativa",
  "aprendizaje autónomo",
  "resolución de problemas",
  "resultados medibles",
  "atención al cliente",
  "trabajo en equipo",
  "adaptación al cambio",
  "persistencia",
] as const;

const SIGNAL_PATTERNS: Record<(typeof TARGET_SIGNALS)[number], RegExp> = {
  iniciativa: /(yo (mismo|sola|solo)|decid[íi]|propuse|me puse|empec[ée]|arranqu[ée])/i,
  "aprendizaje autónomo": /(aprend[ií]|tutoriales?|youtube|sol[ao]|por mi cuenta|nadie me enseñó)/i,
  "resolución de problemas":
    /(resolv[ií]|solucion[éae]|arregl[ée]|encontr[éa] la forma|me las arregl[ée])/i,
  "resultados medibles": /(\d+\s*%|ventas?|clientes?|seguidores?|aument[ée]|crec[íi]|triplic[óo]|dupliqu[ée])/i,
  "atención al cliente": /(client[ea]s?|reclam[oa]s?|atend[íi]|respond[íi])/i,
  "trabajo en equipo": /(equipo|colabor[ée]|junto a|compañer[oa]s?|coordin[éa])/i,
  "adaptación al cambio": /(cambio|adaptarme|me ajust[ée]|nuevo|de repente|sin previo)/i,
  persistencia: /(insist[íi]|segu[íi]|no me rend[íi]|volv[íi] a intentar|termin[ée])/i,
};

interface InterviewTurnResult {
  nextQuestion: string;
  done: boolean;
  targetedSignal: string | null;
  signalsCovered: string[];
}

function detectSignals(messages: ChatMessage[]): string[] {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  return TARGET_SIGNALS.filter((s) => SIGNAL_PATTERNS[s].test(text));
}

function lastAgentQuestion(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "agent") return messages[i].content.trim().toLowerCase();
  }
  return "";
}

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[¿?¡!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTooSimilarToLastAgent(nextQuestion: string, messages: ChatMessage[]): boolean {
  const prev = lastAgentQuestion(messages);
  if (!prev) return false;
  const a = normalizeQuestion(prev);
  const b = normalizeQuestion(nextQuestion);
  if (a === b) return true;
  if (a.length > 20 && b.length > 20 && (a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40)))) {
    return true;
  }
  return false;
}

function maxTurnsResponse(signalsCovered: string[]): InterviewTurnResult {
  return {
    nextQuestion: CLOSING_MESSAGE,
    done: true,
    targetedSignal: null,
    signalsCovered,
  };
}

async function generateInterviewTurnOnce(userPrompt: string): Promise<InterviewTurnResult> {
  const response = await withTimeout(
    gemini().models.generateContent({
      model: GEMINI_LITE_MODEL,
      contents: userPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    GEMINI_TIMEOUT_MS,
    "gemini.generateContent"
  );

  const parsed = JSON.parse(response.text || "{}");
  const nextQuestion =
    typeof parsed.nextQuestion === "string" && parsed.nextQuestion.trim()
      ? parsed.nextQuestion.trim()
      : "";

  if (!nextQuestion) {
    throw new Error("empty_next_question");
  }

  return {
    nextQuestion,
    done: !!parsed.done,
    targetedSignal:
      typeof parsed.targetedSignal === "string" ? parsed.targetedSignal : null,
    signalsCovered: Array.isArray(parsed.signalsCovered) ? parsed.signalsCovered : [],
  };
}

/**
 * Wrapper con 1 reintento ante errores transitorios. Si el primer intento
 * falla por timeout o por respuesta vacía, esperamos 400ms y reintentamos
 * una sola vez. Los errores de rate limit (429) NO se reintentan — los
 * propaga el caller, que ya los traduce a 429 con Retry-After.
 *
 * Si los 2 intentos fallan, propaga el último error y el caller cae al
 * banco de respaldo determinístico.
 */
async function generateInterviewTurn(userPrompt: string): Promise<InterviewTurnResult> {
  try {
    return await generateInterviewTurnOnce(userPrompt);
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    const isTransient =
      msg.startsWith("timeout:") || msg === "empty_next_question" || /5\d\d/.test(msg);
    if (!isTransient || isRateLimitError(err)) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 400));
    return await generateInterviewTurnOnce(userPrompt);
  }
}

async function generateWithRetry(
  basePrompt: string,
  messages: ChatMessage[],
  userTurns: number,
  heuristicCovered: string[]
): Promise<InterviewTurnResult> {
  let result = await generateInterviewTurn(basePrompt);

  let done = result.done;
  if (userTurns < MIN_USER_TURNS) done = false;
  if (userTurns >= MAX_USER_TURNS) {
    return maxTurnsResponse(heuristicCovered);
  }

  if (!done && isTooSimilarToLastAgent(result.nextQuestion, messages)) {
    const retryPrompt = basePrompt + buildSimilarQuestionRetryNote(result.nextQuestion);
    result = await generateInterviewTurn(retryPrompt);
    done = result.done;
    if (userTurns < MIN_USER_TURNS) done = false;
  }

  if (userTurns >= MAX_USER_TURNS) {
    return maxTurnsResponse(heuristicCovered);
  }

  return { ...result, done };
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "entrevista");
  let messagesSnapshot: ChatMessage[] = [];

  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      firstName?: string;
      age?: number;
      opening?: boolean;
    };

    const opening = body.opening === true;
    const firstName = typeof body.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";
    const age = typeof body.age === "number" ? body.age : undefined;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    messagesSnapshot = messages;

    // Validar que los mensajes del usuario no superen el límite de caracteres
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string') {
        const err = validateChatMessage(m.content);
        if (err) {
          log.end({ status: 400, extra: { reason: 'message_too_long' } });
          return NextResponse.json({ error: err, code: 'message_too_long', done: false }, { status: 400 });
        }
      }
    }

    if (opening) {
      // Sin clave de Gemini igualmente abrimos con el banco — el joven
      // empieza la entrevista; el cliente decide si quiere mostrar un aviso.
      if (!hasGeminiKey()) {
        const nextQuestion = pickFallbackOpening(firstName || undefined);
        log.end({ status: 200, extra: { mode: "opening_fallback", reason: "no_gemini_key" } });
        return NextResponse.json({
          nextQuestion,
          done: false,
          opening: true,
          targetedSignal: null,
          signalsCovered: [],
          degraded: true,
          degradedReason: "no_gemini_key",
        });
      }

      const userPrompt = `${SYSTEM_PROMPT}\n\n${buildOpeningQuestionPrompt(firstName || undefined, age)}`;
      try {
        const result = await generateInterviewTurn(userPrompt);
        log.end({ status: 200, extra: { mode: "opening", done: false } });
        return NextResponse.json({
          ...result,
          done: false,
          opening: true,
          signalsCovered: [],
        });
      } catch (err) {
        // Rate limit: lo dejamos burbujear para que el catch externo devuelva
        // un 429 honesto con Retry-After — el opening sí muestra "estamos a
        // tope, espera X segundos" porque no tiene historial sobre el cual
        // construir un fallback contextual.
        if (isRateLimitError(err)) throw err;

        // Cualquier otro fallo (timeout, vacío, 5xx): abrimos con banco.
        const reason = (err as Error)?.message?.startsWith("timeout:")
          ? "opening_timeout"
          : "opening_llm_error";
        log.warn("opening.fallback", { reason, message: (err as Error)?.message });
        const nextQuestion = pickFallbackOpening(firstName || undefined);
        log.end({ status: 200, extra: { mode: "opening_fallback", reason } });
        return NextResponse.json({
          nextQuestion,
          done: false,
          opening: true,
          targetedSignal: null,
          signalsCovered: [],
          degraded: true,
          degradedReason: reason,
        });
      }
    }

    if (messages.length === 0) {
      log.end({ status: 400, extra: { reason: "messages_required" } });
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const userTurns = countUserTurns(messages);
    const heuristicCovered = detectSignals(messages);

    if (userTurns >= MAX_USER_TURNS) {
      const resp = maxTurnsResponse(heuristicCovered);
      log.end({ status: 200, extra: { mode: "hard_cap", done: true, userTurns } });
      return NextResponse.json(resp);
    }

    // Helper: respuesta de banco para mid-conversación. Usa señales detectadas
    // por heurística + preguntas ya hechas para no repetir.
    const askedQuestions = messages
      .filter((m) => m.role === "agent")
      .map((m) => m.content);
    const fallbackTurn = (reason: string) => {
      const { question, signal, done } = pickFallbackQuestion(
        heuristicCovered,
        askedQuestions
      );
      // Respetar caps de turnos al construir el fallback.
      const finalDone = userTurns >= MAX_USER_TURNS || done;
      return NextResponse.json({
        nextQuestion: finalDone ? CLOSING_MESSAGE : question,
        done: finalDone,
        targetedSignal: finalDone ? null : signal,
        signalsCovered: heuristicCovered,
        degraded: true,
        degradedReason: reason,
      });
    };

    if (!hasGeminiKey()) {
      log.end({ status: 200, extra: { mode: "fallback_no_key", userTurns } });
      return fallbackTurn("no_gemini_key");
    }

    if (userTurns > 0 && isLastAnswerTooShort(messages, 2)) {
      const prevAgent = lastAgentMessage(messages);
      const wasYesNo = isYesNoQuestion(prevAgent);
      const lastUser =
        [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      log.info("edge.too_short_answer", { userTurns, wasYesNo });

      const userPrompt =
        `${SYSTEM_PROMPT}\n\n` +
        buildShortAnswerFollowupPrompt(prevAgent, lastUser, wasYesNo);

      try {
        const result = await generateWithRetry(
          userPrompt,
          messages,
          userTurns,
          heuristicCovered
        );
        log.end({ status: 200, extra: { edge: wasYesNo ? "yes_no_followup" : "too_short", mode: "llm" } });
        return NextResponse.json({
          ...result,
          done: false,
          signalsCovered: detectSignals(messages),
          edge: wasYesNo ? "yes_no_followup" : "too_short",
        });
      } catch (err) {
        if (isRateLimitError(err)) throw err;
        const reason = (err as Error)?.message?.startsWith("timeout:")
          ? "too_short_timeout"
          : "too_short_llm_error";
        log.warn("entrevista.fallback", { edge: "too_short", reason, userTurns });
        log.end({ status: 200, extra: { edge: "too_short_fallback", reason } });
        return fallbackTurn(reason);
      }
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const remaining = TARGET_SIGNALS.filter((s) => !heuristicCovered.includes(s));
    const askedSoFar = messages
      .filter((m) => m.role === "agent")
      .map((m) => `- "${m.content}"`)
      .join("\n");

    const nameHint = firstName
      ? `\nLa persona se llama ${firstName}. Puedes tutearla por su nombre de pila de vez en cuando.`
      : "";

    const userPrompt =
      `${SYSTEM_PROMPT}${nameHint}\n\n` +
      `HISTORIAL (turno actual del joven: ${userTurns}/${MAX_USER_TURNS}):\n${transcript}\n\n` +
      `SEÑALES YA DETECTADAS (heurística): ${heuristicCovered.join(", ") || "ninguna"}\n` +
      `SEÑALES PENDIENTES (prioriza una): ${remaining.join(", ") || "ninguna — ya están todas"}\n\n` +
      `PREGUNTAS QUE YA HICISTE (NO las repitas ni parafrasees):\n${askedSoFar || "(ninguna)"}\n\n` +
      `Inventa la SIGUIENTE pregunta original conectada a lo que acaba de contar, o marca done=true si ya hay 4+ señales cubiertas con detalle.`;

    try {
      const out = await generateWithRetry(userPrompt, messages, userTurns, heuristicCovered);
      log.end({
        status: 200,
        extra: {
          mode: "llm",
          done: out.done,
          userTurns,
          targetedSignal: out.targetedSignal,
          signalsCoveredCount: out.signalsCovered.length || heuristicCovered.length,
        },
      });
      return NextResponse.json({
        ...out,
        signalsCovered:
          out.signalsCovered.length > 0 ? out.signalsCovered : heuristicCovered,
      });
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      const reason = (err as Error)?.message?.startsWith("timeout:")
        ? "turn_timeout"
        : "turn_llm_error";
      log.warn("entrevista.fallback", { reason, message: (err as Error)?.message, userTurns });
      log.end({ status: 200, extra: { mode: "fallback", reason, userTurns } });
      return fallbackTurn(reason);
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape, {
        nextQuestion: shape.error,
        done: false,
        targetedSignal: null,
        signalsCovered: detectSignals(messagesSnapshot),
      });
    }

    // Catch-all final: cualquier excepción no clasificada cae al banco
    // determinístico. La entrevista NUNCA debe morir delante del joven —
    // solo dejamos surgir errores de rate limit (que sí necesitan Retry-After).
    log.error("entrevista.exception", { message: (err as Error)?.message });
    const covered = detectSignals(messagesSnapshot);
    const asked = messagesSnapshot
      .filter((m) => m.role === "agent")
      .map((m) => m.content);
    const userTurns = countUserTurns(messagesSnapshot);
    const { question, signal, done } = pickFallbackQuestion(covered, asked);
    const finalDone = userTurns >= MAX_USER_TURNS || done;
    log.end({ status: 200, extra: { mode: "exception_fallback", userTurns } });
    return NextResponse.json({
      nextQuestion: finalDone ? CLOSING_MESSAGE : question,
      done: finalDone,
      targetedSignal: finalDone ? null : signal,
      signalsCovered: covered,
      degraded: true,
      degradedReason: "exception",
    });
  }
}
