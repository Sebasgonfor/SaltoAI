import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import {
  buildRestInterviewSystemPrompt,
  CLOSING_MESSAGE,
  MAX_USER_TURNS,
  MIN_USER_TURNS,
} from "@/lib/interview-prompt";
import {
  countUserTurns,
  isLastAnswerTooShort,
  isYesNoQuestion,
  lastAgentMessage,
  pickYesNoFollowup,
} from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEMINI_TIMEOUT_MS = 10_000;

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

const FALLBACK_DONE_MESSAGE =
  "Genial, ya tengo evidencia suficiente. Voy a construir tu Perfil de Evidencia ahora.";

const FALLBACK_QUESTIONS = [
  "¿Qué hiciste tú concretamente en esa situación? Cuéntame paso a paso.",
  "¿Cuál fue el resultado? ¿Cómo te diste cuenta de que funcionó?",
  "¿Tuviste que aprender algo nuevo por tu cuenta para resolverlo?",
  "¿Qué harías distinto si te pasara algo parecido en un trabajo formal?",
];

/**
 * Las 8 señales que el panel lateral del chat detecta en vivo.
 * Mantener sincronizado con `SIGNALS` en `app/joven/chat/page.tsx`.
 */
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

const QUESTION_BANK: Record<(typeof TARGET_SIGNALS)[number], string[]> = {
  iniciativa: [
    "Contame una vez que viste algo que estaba mal o faltaba, y decidiste arreglarlo sin que nadie te lo pidiera. ¿Qué fue y cómo arrancaste?",
    "Pensá en algo que empezaste vos solo/a, sin esperar permiso. ¿Qué hiciste primero?",
  ],
  "aprendizaje autónomo": [
    "Contame de algo que aprendiste por tu cuenta — YouTube, tutoriales, prueba y error — para resolver una situación concreta. ¿Cómo fue?",
    "Cuando te topaste con algo que no sabías hacer, ¿cómo te las arreglaste para aprenderlo? Dame un ejemplo puntual.",
  ],
  "resolución de problemas": [
    "Contame un problema feo que se te apareció y nadie sabía cómo resolverlo. ¿Qué hiciste paso a paso?",
    "Pensá en una vez que algo se complicó y tuviste que improvisar una solución. ¿Cómo la pensaste?",
  ],
  "resultados medibles": [
    "Eso que hiciste, ¿en qué cambió la situación? Dame un número, porcentaje o cantidad si lo recordás.",
    "Contame cómo te diste cuenta de que tu trabajo funcionó. ¿Qué cambió concretamente — ventas, clientes, tiempos, errores?",
  ],
  "atención al cliente": [
    "Contame de un cliente difícil o un reclamo que tuviste que resolver. ¿Qué dijo y qué hiciste vos?",
    "Cuando tratabas con gente — clientes, vecinos, familias — contame una situación tensa que manejaste bien. Detalles.",
  ],
  "trabajo en equipo": [
    "Contame un momento donde tuviste que coordinarte con otra persona o un grupo para que algo saliera. ¿Quién hizo qué?",
    "Pensá en una vez que trabajaste junto a alguien — familia, amigos, equipo. ¿Cómo se dividieron las cosas?",
  ],
  "adaptación al cambio": [
    "Contame una vez que tuviste que adaptarte de un día para el otro a algo nuevo — un cambio de plan, un imprevisto. ¿Cómo te ajustaste?",
    "Pensá en una vez que las reglas cambiaron a mitad de camino. ¿Qué hiciste para seguir adelante?",
  ],
  persistencia: [
    "Contame algo que intentaste varias veces antes de que saliera. ¿Cuántos intentos y qué te hizo no rendirte?",
    "Pensá en algo que estuvo a punto de fracasar pero igual lo terminaste. ¿Qué fue y cómo seguiste?",
  ],
};

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

function detectSignals(messages: ChatMessage[]): string[] {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  return TARGET_SIGNALS.filter((s) => SIGNAL_PATTERNS[s].test(text));
}

function alreadyAskedTokens(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "agent")
    .map((m) => m.content.toLowerCase())
    .join(" || ");
}

function pickFallbackQuestion(messages: ChatMessage[]): { question: string; signal: string } {
  const covered = new Set(detectSignals(messages));
  const askedBlob = alreadyAskedTokens(messages);
  const uncovered = TARGET_SIGNALS.filter((s) => !covered.has(s));
  const order = uncovered.length > 0 ? uncovered : [...TARGET_SIGNALS];

  for (const sig of order) {
    for (const q of QUESTION_BANK[sig]) {
      const head = q.toLowerCase().slice(0, 24);
      if (!askedBlob.includes(head)) return { question: q, signal: sig };
    }
  }

  return {
    question:
      "Profundicemos un poco más en eso último: ¿qué hiciste exactamente, paso a paso, y qué cambió?",
    signal: "resolución de problemas",
  };
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

function pickAlternateQuestion(userTurns: number): string {
  const idx = Math.min(Math.max(userTurns - 1, 0), FALLBACK_QUESTIONS.length - 1);
  return FALLBACK_QUESTIONS[idx];
}

function maxTurnsResponse(signalsCovered: string[]) {
  return {
    nextQuestion: CLOSING_MESSAGE,
    done: true as const,
    targetedSignal: null,
    signalsCovered,
  };
}

function smartFallbackResponse(messages: ChatMessage[]) {
  const userTurns = countUserTurns(messages);
  const signalsCovered = detectSignals(messages);

  if (userTurns >= MAX_USER_TURNS || signalsCovered.length >= 4) {
    return {
      nextQuestion: FALLBACK_DONE_MESSAGE,
      done: true,
      targetedSignal: null,
      signalsCovered,
    };
  }

  const { question, signal } = pickFallbackQuestion(messages);
  return {
    nextQuestion: question,
    done: false,
    targetedSignal: signal,
    signalsCovered,
  };
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "entrevista");
  let messagesSnapshot: ChatMessage[] = [];

  try {
    const { messages, firstName } = (await req.json()) as {
      messages: ChatMessage[];
      firstName?: string;
    };
    messagesSnapshot = messages;

    if (!Array.isArray(messages) || messages.length === 0) {
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

    if (userTurns > 0 && isLastAnswerTooShort(messages, 2)) {
      const prevAgent = lastAgentMessage(messages);
      const wasYesNo = isYesNoQuestion(prevAgent);
      log.info("edge.too_short_answer", { userTurns, wasYesNo });
      log.end({ status: 200, extra: { edge: "too_short", done: false, wasYesNo } });
      return NextResponse.json({
        nextQuestion: wasYesNo
          ? pickYesNoFollowup(userTurns)
          : "Eso es muy poquito. Contame con más detalle: ¿qué hiciste vos, qué pasó, en qué cambió la situación?",
        done: false,
        targetedSignal: null,
        signalsCovered: detectSignals(messages),
        edge: wasYesNo ? "yes_no_followup" : "too_short",
      });
    }

    if (!hasGeminiKey()) {
      const resp = smartFallbackResponse(messages);
      log.end({ status: 200, extra: { mode: "fallback", done: resp.done, userTurns } });
      return NextResponse.json(resp);
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const remaining = TARGET_SIGNALS.filter((s) => !heuristicCovered.includes(s));
    const askedSoFar = messages
      .filter((m) => m.role === "agent")
      .map((m) => `- "${m.content}"`)
      .join("\n");

    const nameHint = firstName?.trim()
      ? `\nLa persona se llama ${firstName.trim()}. Puedes tutearla por su nombre de pila de vez en cuando.`
      : "";

    const userPrompt =
      `${SYSTEM_PROMPT}${nameHint}\n\n` +
      `HISTORIAL (turno actual del joven: ${userTurns}/${MAX_USER_TURNS}):\n${transcript}\n\n` +
      `SEÑALES YA DETECTADAS (heurística): ${heuristicCovered.join(", ") || "ninguna"}\n` +
      `SEÑALES PENDIENTES (priorizá una): ${remaining.join(", ") || "ninguna — ya están todas"}\n\n` +
      `PREGUNTAS QUE YA HICISTE (NO las repitas):\n${askedSoFar || "(ninguna)"}\n\n` +
      `Devolvé la SIGUIENTE pregunta o marcá done=true si ya hay 4+ señales cubiertas con detalle.`;

    let response;
    try {
      response = await withTimeout(
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
    } catch (err) {
      if ((err as Error)?.message?.startsWith("timeout:")) {
        log.warn("gemini.timeout", { message: (err as Error).message, userTurns });
        const resp = smartFallbackResponse(messages);
        log.end({ status: 200, extra: { mode: "fallback_timeout", done: resp.done, userTurns } });
        return NextResponse.json({ ...resp, edge: "gemini_timeout" });
      }
      throw err;
    }

    const parsed = JSON.parse(response.text || "{}");
    let done = !!parsed.done;
    let nextQuestion =
      typeof parsed.nextQuestion === "string" && parsed.nextQuestion.trim()
        ? parsed.nextQuestion.trim()
        : pickAlternateQuestion(userTurns);

    if (userTurns < MIN_USER_TURNS) done = false;
    if (userTurns >= MAX_USER_TURNS) {
      done = true;
      nextQuestion = CLOSING_MESSAGE;
    }

    if (!done && isTooSimilarToLastAgent(nextQuestion, messages)) {
      nextQuestion = pickFallbackQuestion(messages).question;
    }

    const out = {
      nextQuestion,
      done,
      targetedSignal: parsed.targetedSignal ?? null,
      signalsCovered: Array.isArray(parsed.signalsCovered)
        ? parsed.signalsCovered
        : heuristicCovered,
    };

    log.end({
      status: 200,
      extra: {
        mode: "llm",
        done: out.done,
        userTurns,
        targetedSignal: out.targetedSignal,
        signalsCoveredCount: out.signalsCovered.length,
      },
    });
    return NextResponse.json(out);
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

    log.error("entrevista.exception", { message: (err as Error)?.message });
    log.end({ status: 200, extra: { mode: "degraded" } });
    return NextResponse.json(smartFallbackResponse(messagesSnapshot));
  }
}
