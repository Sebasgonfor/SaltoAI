import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MIN_USER_TURNS = 3;
const MAX_USER_TURNS = 5;

const CLOSING_MESSAGE =
  "Genial, tengo lo que necesitaba. Voy a construir tu Perfil de Evidencia ahora.";

const FALLBACK_QUESTIONS = [
  "¿Qué hiciste tú concretamente en esa situación? Cuéntame paso a paso.",
  "¿Cuál fue el resultado? ¿Cómo te diste cuenta de que funcionó?",
  "¿Tuviste que aprender algo nuevo por tu cuenta para resolverlo?",
  "¿Qué harías distinto si te pasara algo parecido en un trabajo formal?",
];

const SYSTEM_PROMPT = `Eres un entrevistador de Salto, una plataforma de matching laboral por potencial.
Tu trabajo NO es evaluar ni validar. Tu trabajo es EXTRAER EVIDENCIA LABORAL de la historia de vida de un joven que busca su primer empleo formal.

Presupuesto de turnos (del joven):
- Mínimo ${MIN_USER_TURNS} respuestas del joven antes de poder cerrar.
- Máximo ${MAX_USER_TURNS} respuestas del joven: en el turno ${MAX_USER_TURNS} SIEMPRE devuelves done=true y un mensaje de cierre amable (no hagas otra pregunta).

Reglas de conversación:
- Habla en español colombiano natural, cercano, no corporativo.
- Haz UNA pregunta a la vez. Corta y específica.
- Cava en CUÁNDO, QUÉ hizo concretamente, CÓMO, y QUÉ RESULTADO.
- Profundiza en lo que el joven YA mencionó antes de cambiar de tema.
- Busca evidencia de: iniciativa, resolución de problemas, aprendizaje autónomo, manejo de personas/clientes, persistencia, adaptación.
- NO inventes contexto. NO hagas suposiciones.

Anti-bucle (CRÍTICO):
- NUNCA repitas la misma pregunta ni frases casi idénticas del historial. Lee el AGENTE anterior y formula algo distinto.
- Si el joven responde vago, evasivo o muy corto (menos de ~15 palabras útiles): (1) pide UN ejemplo concreto con otra redacción, o (2) si ya pediste concreción 2 veces, cambia a otro ángulo (resultado, aprendizaje, otra experiencia), o (3) si vas en turno >= 4, cierra con done=true usando lo que sí dijo.
- Si el joven no coopera pero mencionó alguna actividad, extrae lo posible y en turno >= 4 puedes cerrar con done=true (mejor perfil parcial que bucle infinito).

Cuándo marcar done=true:
- Tienes al menos 2-3 señales con acciones y resultados (aunque sean modestas), O
- Llegaste al turno ${MAX_USER_TURNS} del joven, O
- El joven ya dio suficiente para un perfil honesto aunque sea breve.

Cuando done=true, nextQuestion debe ser un mensaje de cierre (sin signo de interrogación al final), por ejemplo: "${CLOSING_MESSAGE}"

Devuelve JSON: { "nextQuestion": "...", "done": boolean, "reasoning": "1 frase interna" }`;

const schema = {
  type: Type.OBJECT,
  properties: {
    nextQuestion: { type: Type.STRING },
    done: { type: Type.BOOLEAN },
    reasoning: { type: Type.STRING },
  },
  required: ["nextQuestion", "done"],
};

function countUserTurns(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
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

function maxTurnsResponse(): { nextQuestion: string; done: true } {
  return { nextQuestion: CLOSING_MESSAGE, done: true };
}

function fallbackResponse(messages: ChatMessage[]): { nextQuestion: string; done: boolean } {
  const userTurns = countUserTurns(messages);
  if (userTurns >= MAX_USER_TURNS) {
    return maxTurnsResponse();
  }
  const q = pickAlternateQuestion(userTurns);
  return { nextQuestion: q, done: false };
}

export async function POST(req: NextRequest) {
  let messagesSnapshot: ChatMessage[] = [];
  try {
    const { messages, firstName } = (await req.json()) as {
      messages: ChatMessage[];
      firstName?: string;
    };
    messagesSnapshot = messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const userTurns = countUserTurns(messages);

    if (userTurns >= MAX_USER_TURNS) {
      return NextResponse.json(maxTurnsResponse());
    }

    if (!hasGeminiKey()) {
      return NextResponse.json(fallbackResponse(messages));
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const nameHint = firstName?.trim()
      ? `\nLa persona se llama ${firstName.trim()}. Puedes tutearla por su nombre de pila de vez en cuando, sin ser repetitivo.`
      : "";

    const turnHint = `\nTurno actual del joven: ${userTurns} de ${MAX_USER_TURNS}. Quedan ${MAX_USER_TURNS - userTurns} turnos antes del cierre obligatorio.`;

    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: `${SYSTEM_PROMPT}${nameHint}${turnHint}\n\nHistorial:\n${transcript}\n\nDevuelve la siguiente pregunta o marca done si corresponde.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

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
      nextQuestion = pickAlternateQuestion(userTurns + 1);
    }

    return NextResponse.json({ nextQuestion, done });
  } catch (err) {
    console.error("entrevista error:", err);
    return NextResponse.json(fallbackResponse(messagesSnapshot));
  }
}
