import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
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
// Subimos el timeout de la lambda en Vercel. Hobby permite hasta 60s; con 30
// cubrimos cold-starts de Gemini sin pegarle al techo del plan.
export const maxDuration = 30;

/**
 * Timeout duro del call a Gemini. Con flash-lite + thinking off una respuesta
 * normal son 1-3s; 10s es margen amplio. Si se excede, caemos al banco de
 * preguntas para no hacer esperar al founder.
 */
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
    "Olvídate del título del puesto un segundo. ¿Qué es lo que esta persona haría en un día normal? ¿Y en una semana cargada?",
  ],
  ritmo_contexto: [
    "Descríbeme el ritmo del día a día: cómo se siente, dónde se trabaja (local, oficina, remoto) y en qué horario.",
    "Cuéntame el contexto operativo: cuán caótico u ordenado es, qué procesos hay escritos y qué se resuelve sobre la marcha. ¿Dónde y cuándo trabajaría?",
  ],
  restricciones_duras: [
    "Dime los requisitos duros y no-negociables: ubicación, idioma, herramienta concreta, jornada, edad mínima legal. Listalos.",
    "Cuéntame qué no-negociables tiene el rol — ubicación, horario, idioma o herramientas específicas sin las cuales no podría empezar.",
  ],
  fallos_previos: [
    "Cuéntame la última vez que contrataron para algo parecido: qué les costó, qué tipo de persona no funcionó y por qué.",
    "Si ya intentaron contratar para este rol u otro parecido, cuéntame qué falló. Esa señal nos sirve más que la lista de skills.",
  ],
  dealbreakers: [
    "Dime qué rasgo o actitud sería un deal-breaker para ti, y qué cosas son “nice-to-have” pero no esenciales.",
    "Si tuvieras que elegir entre dos candidatos parecidos, cuéntame qué rasgo te haría decir “este sí” y cuál “este no”. Diferencia esencial de deseable.",
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
- NO repitas ángulos. Si un slot ya quedó cubierto, pasa al siguiente — prefiere slots aún no cubiertos.
- Si una respuesta es vaga (sin datos concretos), profundiza UNA VEZ y después salta al siguiente slot.
- Haz puente narrativo con lo que el founder acaba de decir, no salto brusco.
- No inventes contexto. No proyectes. Si el founder no menciona algo, no lo agregues a tu siguiente pregunta como si lo hubiera dicho.

ESTILO:
- Español natural neutro latinoamericano, cercano, no corporativo.
- UNA pregunta a la vez, corta y específica (máx 2 oraciones).
- Tuteo neutro (tú), consistente. PROHIBIDO voseo argentino ("tú", "tienes", "cuéntame", "fíjate") — usa siempre español neutro latinoamericano.

PROHIBIDO PREGUNTAS SÍ/NO:
- Nunca empieces con "¿Hubo…?", "¿Alguna vez…?", "¿Tuviste…?", "¿Sabes…?", "¿Han contratado…?", "¿Hay…?".
- Esas preguntas se contestan con "sí" o "no" y matan la entrevista.
- Toda pregunta debe empezar con QUÉ, CÓMO, CUÁNDO, CUÁNTOS, CUÁL o un imperativo tipo "Cuéntame…", "Piensa en…", "Dame un ejemplo de…".
- Si quieres explorar si algo ocurrió, pide directamente el ejemplo: "Cuéntame la última vez que contrataron para algo parecido y qué falló" en vez de "¿Contrataron antes?".

CIERRE (done=true):
- Marca done=true cuando tengas AL MENOS 5 de los 6 slots cubiertos con detalle concreto.
- Nunca marques done=true antes del turno 4 del founder.
- Después del turno 7, marca done=true sí o sí (cap).
- Cuando done=true, en nextQuestion devuelve un cierre breve: "Listo, con esto puedo armar la búsqueda. Voy a estructurar tu necesidad y traer 3 candidatos."

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
      "Profundicemos un poco más: cuéntame con un ejemplo concreto cómo se ve un día típico para esta persona.",
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
      const prevAgent = lastAgentMessage(messages);
      const wasYesNo = isYesNoQuestion(prevAgent);
      log.info("edge.too_short_answer", { userTurns, wasYesNo });
      log.end({ status: 200, extra: { edge: "too_short", done: false, wasYesNo } });
      return NextResponse.json({
        nextQuestion: wasYesNo
          ? pickYesNoFollowup(userTurns)
          : "Eso es muy poquito para trabajar. Cuéntame con más detalle, dame un ejemplo concreto.",
        done: false,
        targetedSlot: null,
        slotsCovered: detectSlots(messages),
        edge: wasYesNo ? "yes_no_followup" : "too_short",
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
      `SLOTS PENDIENTES (prioriza uno de estos): ${remaining.join(", ") || "ninguno — ya están todos"}\n\n` +
      `PREGUNTAS QUE YA HICISTE (NO las repitas, ni reformuladas):\n${askedSoFar || "(ninguna)"}\n\n` +
      `Devuelve la SIGUIENTE pregunta (única, dirigida a un slot pendiente, conectada a lo que el founder dijo), o marca done=true si ya hay 5+ slots cubiertos con detalle.`;

    let response;
    try {
      response = await withTimeout(
        gemini().models.generateContent({
          // Lite es ~3-4x más rápido que flash para Q&A turn-by-turn y la
          // tarea (elegir slot pendiente + redactar una pregunta) no necesita
          // razonamiento profundo. thinkingBudget=0 desactiva el modo "thinking"
          // que viene on por default en la familia 2.5 y agrega varios segundos.
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
      // Si Gemini se cuelga (cold start, sobrecarga), no dejamos colgar al
      // founder: respondemos con el banco determinístico y seguimos.
      if ((err as Error)?.message?.startsWith("timeout:")) {
        log.warn("gemini.timeout", { message: (err as Error).message, userTurns });
        const resp = fallbackResponse(messages);
        log.end({ status: 200, extra: { mode: "fallback_timeout", done: resp.done, userTurns } });
        return NextResponse.json({ ...resp, edge: "gemini_timeout" });
      }
      throw err;
    }

    const parsed = JSON.parse(response.text || "{}");
    let done = !!parsed.done;
    if (userTurns < MIN_USER_TURNS) done = false;
    if (userTurns >= MAX_USER_TURNS) done = true;

    const out = {
      nextQuestion:
        parsed.nextQuestion ||
        "Cuéntame un poco más, ¿puedes darme un ejemplo concreto?",
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
      nextQuestion: "Cuéntame más sobre eso, ¿puedes darme un ejemplo concreto?",
      done: false,
      targetedSlot: null,
      slotsCovered: [],
    });
  }
}
