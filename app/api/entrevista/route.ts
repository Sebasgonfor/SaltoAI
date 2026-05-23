import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MIN_USER_TURNS = 3;
const MAX_USER_TURNS = 5;

const FALLBACK_QUESTIONS = [
  "Cuéntame más sobre eso. ¿Qué hiciste exactamente, paso a paso?",
  "¿Cuál fue el resultado concreto? ¿Cómo te diste cuenta de que funcionó?",
  "¿Hubo algún momento difícil donde tuviste que aprender algo nuevo solo? Cuéntame.",
  "¿Qué crees que aprendiste de esa experiencia que podrías aplicar en un trabajo formal?",
];

const SYSTEM_PROMPT = `Eres un entrevistador de Salto, una plataforma de matching laboral por potencial.
Tu trabajo NO es evaluar ni validar. Tu trabajo es EXTRAER EVIDENCIA LABORAL de la historia de vida de un joven que busca su primer empleo formal.

Reglas:
- Habla en español rioplatense/colombiano natural, cercano, no corporativo.
- Haz UNA pregunta a la vez. Corta y específica.
- Cava en CUÁNDO, QUÉ hizo concretamente, CÓMO, y QUÉ RESULTADO.
- Profundiza en lo que el joven YA mencionó: no cambies de tema sin agotar lo anterior.
- Busca evidencia de: iniciativa, resolución de problemas, aprendizaje autónomo, manejo de personas/clientes, persistencia, adaptación.
- NO inventes contexto. NO hagas suposiciones. Si la respuesta es vaga, pide concreción.
- Cuando ya tengas al menos 3 señales concretas con detalle (acciones + resultados), marca done=true.
- Nunca marques done=true antes del turno 3 del usuario.

Devuelve JSON con: { "nextQuestion": "...", "done": boolean, "reasoning": "por qué done o no done (1 frase, interna)" }`;

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

function fallbackResponse(messages: ChatMessage[]) {
  const userTurns = countUserTurns(messages);
  if (userTurns >= MAX_USER_TURNS) {
    return {
      nextQuestion:
        "Genial, tengo lo que necesitaba. Voy a construir tu Perfil de Evidencia ahora.",
      done: true,
    };
  }
  const q = FALLBACK_QUESTIONS[Math.min(userTurns - 1, FALLBACK_QUESTIONS.length - 1)];
  return { nextQuestion: q, done: false };
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const userTurns = countUserTurns(messages);

    if (!hasGeminiKey()) {
      return NextResponse.json(fallbackResponse(messages));
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: `${SYSTEM_PROMPT}\n\nHistorial hasta ahora (turno actual del joven: ${userTurns}):\n${transcript}\n\nDevuelve la siguiente pregunta o marca done si ya tienes evidencia suficiente.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    let done = !!parsed.done;
    if (userTurns < MIN_USER_TURNS) done = false;
    if (userTurns >= MAX_USER_TURNS) done = true;

    return NextResponse.json({
      nextQuestion:
        parsed.nextQuestion ||
        "Cuéntame un poco más, ¿qué hiciste exactamente y cómo te resultó?",
      done,
    });
  } catch (err) {
    console.error("entrevista error:", err);
    return NextResponse.json(
      { nextQuestion: "Cuéntame más sobre eso, ¿qué hiciste exactamente?", done: false },
      { status: 200 }
    );
  }
}
