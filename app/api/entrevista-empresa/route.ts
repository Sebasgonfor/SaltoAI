import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { countUserTurns, isLastAnswerTooShort } from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MIN_USER_TURNS = 4;
const MAX_USER_TURNS = 7;

/**
 * Slots de cobertura del agente para EMPRESA. El objetivo es producir un
 * `rawDescription` rico que el endpoint /api/necesidad pueda estructurar
 * sin inventar. Mantener sincronizado con el panel del chat.
 */
const TARGET_SLOTS = [
  "equipo",
  "actividad_semanal",
  "ritmo_contexto",
  "restricciones_duras",
  "fallos_previos",
  "dealbreakers",
] as const;

const QUESTION_BANK: Record<(typeof TARGET_SLOTS)[number], string[]> = {
  equipo: [
    "Cuéntame primero quiénes son ustedes: ¿cuántas personas hay hoy en el equipo, qué hace cada una, y en qué etapa está la empresa?",
    "Antes de hablar del rol — ¿cómo está armado el equipo hoy? ¿Cuántos son, qué hacen y desde cuándo están operando?",
  ],
  actividad_semanal: [
    "Si esta persona ya estuviera trabajando con ustedes la próxima semana, ¿qué cosas concretas haría de lunes a viernes? No me des un cargo, dame las tareas reales.",
    "Olvidate del título del puesto un segundo. ¿Qué es lo que esta persona haría en un día normal? ¿Y en una semana cargada?",
  ],
  ritmo_contexto: [
    "¿Cómo es el ritmo del día a día? ¿Hay picos, presión, multitarea, o es más estable? ¿Es presencial, remoto, híbrido, y en qué horario?",
    "Contame del contexto operativo: ¿es caótico, ordenado, hay procesos escritos o se va resolviendo sobre la marcha? ¿Dónde y cuándo trabajaría?",
  ],
  restricciones_duras: [
    "¿Hay algún requisito duro que sí o sí necesita la persona? Por ejemplo ubicación específica, idioma, alguna herramienta concreta, jornada completa, edad mínima legal.",
    "¿Cuáles son los no-negociables del rol? Pensá en ubicación, horario, idioma, o herramientas específicas sin las cuales no podría empezar.",
  ],
  fallos_previos: [
    "¿Han contratado para algo parecido antes? Si fue así, ¿qué les costó, qué tipo de persona no funcionó y por qué?",
    "Si ya intentaron contratar para este rol u otro parecido, contame qué falló. Esa señal nos sirve más que la lista de skills.",
  ],
  dealbreakers: [
    "Pensando en candidatos: ¿qué rasgo o actitud sería un deal-breaker para vos? ¿Y qué cosas son “nice-to-have” pero no esenciales?",
    "Si tuvieras que elegir entre dos candidatos parecidos, ¿qué rasgo te haría decir “este sí” o “este no”? Diferenciá lo esencial de lo deseable.",
  ],
};

const SLOT_PATTERNS: Record<(typeof TARGET_SLOTS)[number], RegExp> = {
  equipo: /(\d+\s*persona|somos\s*\d+|equipo (de|chico|peque)|fundador|cofounder|socio)/i,
  actividad_semanal:
    /(atender|vender|contestar|publicar|editar|cobrar|inventario|caja|reels?|tiktok|instagram|whatsapp|client[ea]s?|pedidos?|entregas?|reuniones?|coordin)/i,
  ritmo_contexto:
    /(r[áa]pido|caos|presi[óo]n|estres|multitarea|cambio|picos?|presencial|remoto|h[íi]brido|horario|turnos?|jornada|barrio|local|oficina|ciudad)/i,
  restricciones_duras:
    /(requisito|obligatorio|s[íi] o s[íi]|no-?negociable|jornada completa|tiempo completo|ingl[ée]s|espa[ñn]ol|excel|portugu[ée]s|licencia|mayor de|m[íi]nimo \d+)/i,
  fallos_previos:
    /(contratamos|antes|anterior|nos fall[óo]|no funcion[óo]|se fue|renunci[óo]|no aguant[óo]|costo|cost[óo]|intentamos)/i,
  dealbreakers:
    /(deal-?breaker|no-?negociable|esencial|imprescindible|deseable|nice|prefer|valoramos|importante que)/i,
};

const SYSTEM_PROMPT = `Eres el entrevistador de empresas de Salto, plataforma de matching laboral por potencial para LATAM.
Tu trabajo NO es vender ni motivar al founder. Tu trabajo es EXTRAER CONTEXTO REAL para que el motor de matching pueda buscar candidatos sin inventar señales.

OBJETIVO DE COBERTURA (clave):
A lo largo de 4-7 turnos, tus preguntas deben cubrir estos 6 slots:
1. equipo — cuántos son, qué hacen, etapa de la empresa.
2. actividad_semanal — qué hace la persona en una semana real (tareas, no cargo).
3. ritmo_contexto — caos vs orden, picos, presencial/remoto, horario, ubicación.
4. restricciones_duras — ubicación, idioma, herramientas, jornada, edad mínima legal.
5. fallos_previos — qué les ha costado en contrataciones anteriores y por qué.
6. dealbreakers — qué rasgos son esenciales vs nice-to-have.

REGLAS DE COBERTURA:
- NO repitas ángulos. Si un slot ya quedó cubierto, pasá al siguiente — preferí slots aún no cubiertos.
- Si una respuesta es vaga (sin datos concretos), profundizá UNA VEZ y después saltá al siguiente slot.
- Hacé puente narrativo con lo que el founder acaba de decir, no salto brusco.
- No inventes contexto. No proyectes. Si el founder no menciona algo, no lo agregues a tu siguiente pregunta como si lo hubiera dicho.

ESTILO:
- Español natural rioplatense/colombiano, cercano, no corporativo.
- UNA pregunta a la vez, corta y específica (máx 2 oraciones).
- Tuteo o "vos", consistente.

CIERRE (done=true):
- Marcá done=true cuando tengas AL MENOS 5 de los 6 slots cubiertos con detalle concreto.
- Nunca marques done=true antes del turno 4 del founder.
- Después del turno 7, marcá done=true sí o sí (cap).
- Cuando done=true, en nextQuestion devolvé un cierre breve: "Listo, con esto puedo armar la búsqueda. Voy a estructurar tu necesidad y traer 3 candidatos."

Devuelve JSON con:
{
  "nextQuestion": "tu pregunta — UNA, conectada y dirigida a un slot aún no cubierto",
  "done": boolean,
  "targetedSlot": "uno de: equipo | actividad_semanal | ritmo_contexto | restricciones_duras | fallos_previos | dealbreakers",
  "slotsCovered": ["lista de slots YA cubiertos con detalle concreto"],
  "reasoning": "una frase interna: por qué elegiste este slot"
}`;

const schema = {
  type: Type.OBJECT,
  properties: {
    nextQuestion: { type: Type.STRING },
    done: { type: Type.BOOLEAN },
    targetedSlot: { type: Type.STRING },
    slotsCovered: { type: Type.ARRAY, items: { type: Type.STRING } },
    reasoning: { type: Type.STRING },
  },
  required: ["nextQuestion", "done"],
};

function detectSlots(messages: ChatMessage[]): string[] {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  return TARGET_SLOTS.filter((s) => SLOT_PATTERNS[s].test(text));
}

function alreadyAskedTokens(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "agent")
    .map((m) => m.content.toLowerCase())
    .join(" || ");
}

function pickFallbackQuestion(messages: ChatMessage[]): {
  question: string;
  slot: string;
} {
  const covered = new Set(detectSlots(messages));
  const askedBlob = alreadyAskedTokens(messages);
  const uncovered = TARGET_SLOTS.filter((s) => !covered.has(s));
  const order = uncovered.length > 0 ? uncovered : [...TARGET_SLOTS];

  for (const slot of order) {
    for (const q of QUESTION_BANK[slot]) {
      const head = q.toLowerCase().slice(0, 24);
      if (!askedBlob.includes(head)) return { question: q, slot };
    }
  }
  return {
    question:
      "Profundicemos un poco más: contame con un ejemplo concreto cómo se ve un día típico para esta persona.",
    slot: "actividad_semanal",
  };
}

function fallbackResponse(messages: ChatMessage[]) {
  const userTurns = countUserTurns(messages);
  if (userTurns >= MAX_USER_TURNS) {
    return {
      nextQuestion:
        "Listo, con esto puedo armar la búsqueda. Voy a estructurar tu necesidad y traer candidatos.",
      done: true,
      targetedSlot: null,
      slotsCovered: detectSlots(messages),
    };
  }
  const { question, slot } = pickFallbackQuestion(messages);
  return {
    nextQuestion: question,
    done: false,
    targetedSlot: slot,
    slotsCovered: detectSlots(messages),
  };
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "entrevista-empresa");
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      log.end({ status: 400, extra: { reason: "messages_required" } });
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const userTurns = countUserTurns(messages);

    if (userTurns > 0 && isLastAnswerTooShort(messages, 3)) {
      log.info("edge.too_short_answer", { userTurns });
      log.end({ status: 200, extra: { edge: "too_short", done: false } });
      return NextResponse.json({
        nextQuestion:
          "Eso es muy poquito para trabajar. Contame con más detalle — ¿podés darme un ejemplo concreto?",
        done: false,
        targetedSlot: null,
        slotsCovered: detectSlots(messages),
        edge: "too_short",
      });
    }

    if (!hasGeminiKey()) {
      const resp = fallbackResponse(messages);
      log.end({ status: 200, extra: { mode: "fallback", done: resp.done, userTurns } });
      return NextResponse.json(resp);
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "FOUNDER" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const heuristicCovered = detectSlots(messages);
    const remaining = TARGET_SLOTS.filter((s) => !heuristicCovered.includes(s));
    const askedSoFar = messages
      .filter((m) => m.role === "agent")
      .map((m) => `- "${m.content}"`)
      .join("\n");

    const userPrompt =
      `${SYSTEM_PROMPT}\n\n` +
      `HISTORIAL (turno actual del founder: ${userTurns}/${MAX_USER_TURNS}):\n${transcript}\n\n` +
      `SLOTS YA DETECTADOS POR HEURÍSTICA (informativo, no vinculante): ${heuristicCovered.join(", ") || "ninguno"}\n` +
      `SLOTS PENDIENTES (priorizá uno de estos): ${remaining.join(", ") || "ninguno — ya están todos"}\n\n` +
      `PREGUNTAS QUE YA HICISTE (NO las repitas, ni reformuladas):\n${askedSoFar || "(ninguna)"}\n\n` +
      `Devolvé la SIGUIENTE pregunta (única, dirigida a un slot pendiente, conectada a lo que el founder dijo), o marcá done=true si ya hay 5+ slots cubiertos con detalle.`;

    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    let done = !!parsed.done;
    if (userTurns < MIN_USER_TURNS) done = false;
    if (userTurns >= MAX_USER_TURNS) done = true;

    const out = {
      nextQuestion:
        parsed.nextQuestion ||
        "Contame un poco más, ¿podés darme un ejemplo concreto?",
      done,
      targetedSlot: parsed.targetedSlot ?? null,
      slotsCovered: Array.isArray(parsed.slotsCovered)
        ? parsed.slotsCovered
        : heuristicCovered,
    };

    log.end({
      status: 200,
      extra: {
        mode: "llm",
        done: out.done,
        userTurns,
        targetedSlot: out.targetedSlot,
        slotsCoveredCount: out.slotsCovered.length,
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
        targetedSlot: null,
        slotsCovered: [],
      });
    }
    log.error("entrevista-empresa.exception", { message: (err as Error)?.message });
    log.end({ status: 200, extra: { mode: "degraded" } });
    return NextResponse.json({
      nextQuestion: "Cuéntame más sobre eso, ¿podés darme un ejemplo concreto?",
      done: false,
      targetedSlot: null,
      slotsCovered: [],
    });
  }
}
