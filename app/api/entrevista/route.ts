import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { countUserTurns, isLastAnswerTooShort } from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MIN_USER_TURNS = 3;
const MAX_USER_TURNS = 5;

/**
 * Las 8 señales que el panel lateral del chat detecta en vivo.
 * Mantener este array sincronizado con `SIGNALS` en
 * `app/joven/chat/page.tsx` — el agente apunta a cubrirlas todas.
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

/**
 * Banco de aperturas por señal — el agente elige una variante distinta a
 * las preguntas ya hechas. Sirve al fallback (sin Gemini) y como ancla del
 * prompt cuando el modelo "se queda" en una señal sola.
 */
const QUESTION_BANK: Record<(typeof TARGET_SIGNALS)[number], string[]> = {
  iniciativa: [
    "¿Hubo alguna vez algo que viste que estaba mal o que faltaba y decidiste arreglarlo sin que te lo pidieran? Contame.",
    "Pensá en algo que empezaste vos solo/a, sin esperar permiso. ¿Qué fue y cómo arrancaste?",
  ],
  "aprendizaje autónomo": [
    "¿Aprendiste algo por tu cuenta — YouTube, tutoriales, prueba y error — para resolver una situación concreta? Contame cómo fue.",
    "Cuando te topaste con algo que no sabías hacer, ¿cómo te las arreglaste para aprenderlo? Dame un ejemplo puntual.",
  ],
  "resolución de problemas": [
    "Contame un problema feo que se te apareció y nadie sabía cómo resolverlo. ¿Qué hiciste paso a paso?",
    "¿Alguna vez algo se complicó y tuviste que improvisar una solución? ¿Cómo la pensaste?",
  ],
  "resultados medibles": [
    "Eso que hiciste, ¿en qué cambió la situación? ¿Hay algún número, porcentaje o cantidad que recuerdes?",
    "¿Cómo te diste cuenta de que tu trabajo funcionó? ¿Qué cambió concretamente — ventas, clientes, tiempos, errores?",
  ],
  "atención al cliente": [
    "Contame de un cliente difícil o un reclamo que tuviste que resolver. ¿Qué dijo? ¿Qué hiciste vos?",
    "Cuando tratabas con gente — clientes, vecinos, familias — ¿alguna situación tensa que manejaste bien? Detalles.",
  ],
  "trabajo en equipo": [
    "¿Hubo algún momento donde tuviste que coordinarte con otra persona o un grupo para que algo saliera? ¿Quién hizo qué?",
    "Contame de una vez que trabajaste junto a alguien — familia, amigos, equipo. ¿Cómo se dividieron las cosas?",
  ],
  "adaptación al cambio": [
    "¿Te tocó adaptarte de un día para el otro a algo nuevo — un cambio de plan, un imprevisto? Contame cómo te ajustaste.",
    "Pensá en una vez que las reglas cambiaron a mitad de camino. ¿Qué hiciste para seguir adelante?",
  ],
  persistencia: [
    "¿Hubo algo que intentaste varias veces antes de que saliera? Contame cuántos intentos y qué te hizo no rendirte.",
    "Algo que estuvo a punto de fracasar pero igual lo terminaste — ¿qué fue y cómo seguiste?",
  ],
};

const FALLBACK_DONE_MESSAGE =
  "Genial, ya tengo evidencia suficiente. Voy a construir tu Perfil de Evidencia ahora.";

const SYSTEM_PROMPT = `Eres el entrevistador de Salto, una plataforma de matching laboral por potencial para LATAM.
Tu trabajo NO es evaluar ni validar. Tu trabajo es EXTRAER EVIDENCIA LABORAL de la historia de vida de un joven que busca su primer empleo formal.

OBJETIVO DE COBERTURA (clave):
A lo largo de la entrevista (3-5 turnos del joven), tu set de preguntas debe APUNTAR a cubrir, de forma diversa, las 8 señales que Salto detecta:
1. Iniciativa — algo que arrancó sin que se lo pidieran.
2. Aprendizaje autónomo — aprendió algo solo/a (tutoriales, prueba-error).
3. Resolución de problemas — destrabó algo improvisando.
4. Resultados medibles — números, %, ventas, clientes, tiempos.
5. Atención al cliente / personas — manejo de reclamos, gente difícil.
6. Trabajo en equipo — coordinó con otros.
7. Adaptación al cambio — se ajustó a un imprevisto / cambio de reglas.
8. Persistencia — siguió intentando después de un fallo.

REGLAS DE COBERTURA:
- NO repitas el ángulo de una pregunta anterior. Si ya preguntaste por "iniciativa", la siguiente debe atacar OTRA señal — sobre todo las que aún NO aparecieron en la conversación.
- En cada turno, mirá explícitamente qué señales YA salieron en lo que dijo el joven, y elegí preguntar por una señal AÚN NO CUBIERTA, idealmente conectada a lo que el joven acaba de mencionar (puente narrativo, no salto brusco).
- Si una respuesta del joven cubre dos señales a la vez, perfecto: la siguiente pregunta apunta a una tercera señal.
- Profundizá UNA VEZ en la señal recién mencionada si vino vaga (sin números, sin acciones concretas) — después saltá a otra señal.

ESTILO:
- Español natural rioplatense/colombiano, cercano, no corporativo.
- UNA pregunta a la vez. Corta y específica (máx 2 oraciones).
- Cavá en CUÁNDO, QUÉ hizo concretamente, CÓMO, QUÉ RESULTADO.
- NO inventes contexto. NO supongas. Si la respuesta es vaga, pedí concreción ANTES de cambiar de señal.

CIERRE (done=true):
- Marcá done=true cuando tengas AL MENOS 4 señales distintas cubiertas con detalle (acción + resultado o detalle concreto).
- Nunca marques done=true antes del turno 3 del usuario.
- Después del turno 5, marcá done=true sí o sí (cap).

Devuelve JSON con:
{
  "nextQuestion": "tu pregunta — UNA, conectada y dirigida a una señal aún no cubierta o poco profunda",
  "done": boolean,
  "targetedSignal": "una de: iniciativa | aprendizaje autónomo | resolución de problemas | resultados medibles | atención al cliente | trabajo en equipo | adaptación al cambio | persistencia",
  "signalsCovered": ["lista de señales YA cubiertas con evidencia concreta en la conversación"],
  "reasoning": "una frase interna: por qué elegiste esta señal y no otra"
}`;

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

/**
 * Heurística simple para detectar qué señales ya salieron en la conversación,
 * espejo de las regex del panel lateral del chat. Sirve al fallback y le da
 * al LLM un "prior" en el prompt — no decide el `done`, solo informa.
 */
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

/**
 * Selecciona una pregunta del banco apuntando a una señal aún no cubierta,
 * y evita repetir preguntas ya hechas por el agente.
 */
function pickFallbackQuestion(messages: ChatMessage[]): {
  question: string;
  signal: string;
} {
  const covered = new Set(detectSignals(messages));
  const askedBlob = alreadyAskedTokens(messages);
  const uncovered = TARGET_SIGNALS.filter((s) => !covered.has(s));
  const order = uncovered.length > 0 ? uncovered : [...TARGET_SIGNALS];

  for (const sig of order) {
    for (const q of QUESTION_BANK[sig]) {
      // Evitamos repetir preguntas literales o casi literales.
      const head = q.toLowerCase().slice(0, 24);
      if (!askedBlob.includes(head)) return { question: q, signal: sig };
    }
  }
  // Último recurso: profundizar genéricamente sin repetir el opener.
  return {
    question: "Profundicemos un poco más en eso último: ¿qué hiciste exactamente, paso a paso, y qué cambió?",
    signal: "resolución de problemas",
  };
}

function fallbackResponse(messages: ChatMessage[]) {
  const userTurns = countUserTurns(messages);
  if (userTurns >= MAX_USER_TURNS) {
    return {
      nextQuestion: FALLBACK_DONE_MESSAGE,
      done: true,
      targetedSignal: null,
      signalsCovered: detectSignals(messages),
    };
  }
  const { question, signal } = pickFallbackQuestion(messages);
  return {
    nextQuestion: question,
    done: false,
    targetedSignal: signal,
    signalsCovered: detectSignals(messages),
  };
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "entrevista");
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      log.end({ status: 400, extra: { reason: "messages_required" } });
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const userTurns = countUserTurns(messages);

    // Edge case: el joven mandó 1 palabra como respuesta (no es bug, es UX).
    // No pasamos esto al LLM — pedimos concreción nosotros para no quemar cuota.
    if (userTurns > 0 && isLastAnswerTooShort(messages, 2)) {
      log.info("edge.too_short_answer", { userTurns });
      log.end({ status: 200, extra: { edge: "too_short", done: false } });
      return NextResponse.json({
        nextQuestion:
          "Eso es muy poquito. Contame con más detalle: ¿qué hiciste vos, qué pasó, en qué cambió la situación?",
        done: false,
        targetedSignal: null,
        signalsCovered: detectSignals(messages),
        edge: "too_short",
      });
    }

    if (!hasGeminiKey()) {
      const resp = fallbackResponse(messages);
      log.end({ status: 200, extra: { mode: "fallback", done: resp.done, userTurns } });
      return NextResponse.json(resp);
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const heuristicCovered = detectSignals(messages);
    const remaining = TARGET_SIGNALS.filter((s) => !heuristicCovered.includes(s));
    const askedSoFar = messages
      .filter((m) => m.role === "agent")
      .map((m) => `- "${m.content}"`)
      .join("\n");

    const userPrompt =
      `${SYSTEM_PROMPT}\n\n` +
      `HISTORIAL (turno actual del joven: ${userTurns}/${MAX_USER_TURNS}):\n${transcript}\n\n` +
      `SEÑALES YA DETECTADAS POR HEURÍSTICA (informativo, no vinculante): ${heuristicCovered.join(", ") || "ninguna"}\n` +
      `SEÑALES PENDIENTES (priorizá una de estas): ${remaining.join(", ") || "ninguna — ya están todas"}\n\n` +
      `PREGUNTAS QUE YA HICISTE (NO las repitas, ni reformuladas):\n${askedSoFar || "(ninguna)"}\n\n` +
      `Devolvé la SIGUIENTE pregunta (única, dirigida a una señal pendiente, conectada a lo que el joven dijo), o marcá done=true si ya hay 4+ señales cubiertas con detalle.`;

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
        "Contame un poco más, ¿qué hiciste exactamente y qué cambió después?",
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
    // 429: el free tier de Gemini son 5 req/min. Mensaje honesto al joven.
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape, {
        // Damos una pregunta de fallback igual: la entrevista no se rompe.
        nextQuestion: shape.error,
        done: false,
        targetedSignal: null,
        signalsCovered: [],
      });
    }
    log.error("entrevista.exception", { message: (err as Error)?.message });
    log.end({ status: 200, extra: { mode: "degraded" } });
    // Degradación elegante: seguimos la entrevista con el fallback (PRD §8.5).
    return NextResponse.json({
      nextQuestion: "Cuéntame más sobre eso, ¿qué hiciste exactamente?",
      done: false,
      targetedSignal: null,
      signalsCovered: [],
    });
  }
}
