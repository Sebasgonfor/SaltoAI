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
  validateChatMessage,
} from "@/lib/input-validation";
import { MIN_USER_TURNS, MAX_USER_TURNS } from "@/lib/interview-prompt";
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

// MIN_USER_TURNS y MAX_USER_TURNS importados de lib/interview-prompt

/**
 * Slots de cobertura para empresa (v2 — rediseño post-audit).
 *
 * Cambios vs. v1:
 *   - "vacante" (NUEVO, primer slot) — la pregunta más importante: ¿qué rol
 *     específico estás contratando? Antes el agente nunca la hacía y el
 *     founder podía hablar 5 turnos de su equipo sin nombrar el rol vacante.
 *   - "actividad_semanal" → "tareas_del_rol" — el LLM lo leía como "qué hace
 *     el equipo actual"; renombrado y reforzado en el prompt para que sea
 *     inequívoco "qué haría LA PERSONA NUEVA".
 *   - "equipo" → "contexto_equipo" — incluye ritmo/ubicación/modalidad
 *     fusionados (antes había un slot separado "ritmo_contexto" que se
 *     solapaba con "equipo"). Una sola pregunta más rica.
 *   - "restricciones_duras" + "dealbreakers" fusionados en "no_negociables"
 *     — el founder no distingue entre los dos conceptos en la práctica.
 *   - "fallos_previos" → "experiencia_previa" (OPCIONAL) — si el founder
 *     dice "es la primera vez que contratamos", el agente lo skipea sin
 *     forzar. El prompt lo marca como opcional explícitamente.
 *
 * Resultado: 5 slots (4 obligatorios + 1 opcional), MAX_USER_TURNS bajado
 * de 7 a 6 porque la entrevista es más eficiente.
 */
const TARGET_SLOTS = [
  "vacante",
  "tareas_del_rol",
  "contexto_equipo",
  "no_negociables",
  "experiencia_previa",
] as const;

const QUESTION_BANK: Record<(typeof TARGET_SLOTS)[number], string[]> = {
  vacante: [
    "Empecemos por lo más importante: ¿qué rol específico estás buscando cubrir, cuántas vacantes son, y por qué este rol justo ahora?",
    "Dime de entrada qué rol vas a contratar — el cargo concreto, cuántas plazas, y qué disparó la necesidad ahora.",
  ],
  tareas_del_rol: [
    "Concretemos el día a día de la PERSONA NUEVA (no del equipo actual): ¿qué tareas reales haría de lunes a viernes en su primera semana?",
    "Si esta persona nueva ya estuviera trabajando contigo la próxima semana, ¿qué cosas concretas haría? Dame las tareas reales, no el cargo.",
  ],
  contexto_equipo: [
    "Cuéntame el contexto: ¿cuántas personas son hoy, en qué etapa está la empresa, dónde trabaja la persona (presencial/remoto), y cómo es el ritmo (caótico, ordenado, picos)?",
    "Para entender el entorno: tamaño actual del equipo, etapa de la empresa, ubicación de trabajo y ritmo del día a día (caos vs orden, picos, horario).",
  ],
  no_negociables: [
    "¿Cuáles son los no-negociables del rol? Pensa en ubicación, idioma, herramienta concreta, jornada, edad mínima legal, o cualquier rasgo SIN el cual no podrías contratar a la persona.",
    "Dime los deal-breakers de este rol: lo que sí o sí necesita la persona (sea técnico o conductual) — sin lo cual descartas el candidato aunque todo lo demás encaje.",
  ],
  experiencia_previa: [
    "Si ya intentaste contratar para algo parecido antes, cuéntame qué falló y qué tipo de persona no funcionó. Si es la primera vez, dímelo directamente y pasamos al cierre.",
    "Cuéntame de contrataciones previas para roles similares: qué costó, qué tipo de persona no funcionó. Si nunca contrataste antes, dilo y avanzamos.",
  ],
};

const SLOT_PATTERNS: Record<(typeof TARGET_SLOTS)[number], RegExp> = {
  // vacante: matchea cuando el founder declara el rol concreto que va a
  // contratar. Cubrimos:
  //  - verbos en cualquier persona/forma: buscamos, busco, buscando, busca
  //  - "necesitamos/necesito", "queremos", "estamos contratando"
  //  - patrones "alguien de/que/para", "una persona de/que/para"
  //  - cargos típicos LATAM (dev, vendedor, cajero, community, marketplace, etc)
  //  - menciones del POR QUÉ ("porque no tenemos ventas", "para crecer")
  vacante:
    /(busc[oa]mos|busc[oa]ndo|busco|necesit[oa]mos|necesito|queremos|el rol es|el puesto|vacante|abrimos posición|alguien (de|que|para)|una persona (de|que|para)|estamos contratando|persona para|profesional para|junior|senior|trainee|dev|desarrollador|programad|community|content|marketing|marketplace|e-?commerce|vendedor|cajero|atenci[óo]n|administrad|operario|asistente|secretari|repartidor|disenad|qa\b|product manager|pm\b|porque no (tenemos|hay)|para (crecer|vender|aumentar))/i,
  // tareas_del_rol: actividades concretas que hace la persona, no cargos.
  tareas_del_rol:
    /(atender|vender|contestar|publicar|editar|cobrar|inventario|caja|reels?|tiktok|instagram|whatsapp|client[ea]s?|pedidos?|entregas?|reuniones?|coordin|escribir|disenar|cocinar|despachar|empacar|hacer rutas|llevar contabilidad|gestion|reportes?|ventas|cierre|prospect)/i,
  // contexto_equipo: tamaño + etapa + ritmo + ubicación + modalidad, todo junto.
  // Regex amplio porque cualquiera de esas dimensiones cuenta como "cubierto".
  contexto_equipo:
    /(\d+\s*(persona|activ[oa]s?|integrantes?|emplead|colaborad)|somos\s*\d+|equipo|fundador|cofounder|socio|empresa|emprendimiento|startup|r[áa]pido|caos|presi[óo]n|estres|multitarea|presencial|remoto|h[íi]brido|horario|turnos?|jornada|barrio|local|oficina|ciudad|barranquilla|bogot[áa]|medell[ií]n|cali)/i,
  // no_negociables: restricciones duras + deal-breakers en una sola red.
  no_negociables:
    /(requisito|obligatorio|s[íi] o s[íi]|no-?negociable|jornada completa|tiempo completo|ingl[ée]s|espa[ñn]ol|excel|portugu[ée]s|licencia|mayor de|m[íi]nimo \d+|deal-?breaker|esencial|imprescindible|prefer|valoramos|importante que|sin lo cual|descartam|descart[éa]|no aplica|no funcion[óo])/i,
  // experiencia_previa: el founder cuenta de contrataciones pasadas O declara
  // explícitamente que es la primera vez (eso TAMBIÉN cuenta como cubierto).
  experiencia_previa:
    /(contratamos|antes|anterior|nos fall[óo]|se fue|renunci[óo]|no aguant[óo]|primera vez|nunca (he|hemos) contratado|este es el primer|jam[áa]s contratamos|intentamos antes|el anterior|la anterior|el [úu]ltimo|la [úu]ltima)/i,
};

const SYSTEM_PROMPT = `Eres el entrevistador de empresas de SaltoAI, plataforma de matching laboral por potencial para LATAM.
Tu trabajo NO es vender ni motivar al founder. Tu trabajo es EXTRAER CONTEXTO REAL para que el motor de matching pueda buscar candidatos sin inventar señales.

OBJETIVO DE COBERTURA (5 slots, en este orden de prioridad):

1. vacante (OBLIGATORIO, primero) — qué rol específico está contratando, cuántas vacantes, por qué este rol ahora. SIN ESTO la entrevista no sirve: todo lo demás depende de qué rol estamos buscando. Si el founder describe a su equipo sin nombrar el rol vacante, redirígelo a esta pregunta.

2. tareas_del_rol (OBLIGATORIO) — qué haría la PERSONA NUEVA en su semana de trabajo (lunes a viernes). CRÍTICO: no es qué hace el equipo actual, es qué haría el candidato a contratar. Si el founder se desvía a describir al equipo existente, redirígelo: "ok, eso es del equipo actual — ¿y la persona nueva, qué haría?".

3. contexto_equipo (OBLIGATORIO) — tamaño del equipo, etapa de la empresa, modalidad (presencial/remoto/híbrido), ubicación, ritmo (caótico/ordenado/picos). Una pregunta abierta puede cubrir varias dimensiones a la vez.

4. no_negociables (OBLIGATORIO) — restricciones duras + deal-breakers fusionados. Ubicación obligada, idioma, herramienta concreta, jornada, edad mínima legal, o rasgo conductual sin el cual descarta. NO desagregar en sub-preguntas — una sola pregunta abierta.

5. experiencia_previa (OPCIONAL) — qué ha fallado en contrataciones anteriores. Si el founder declara que es la primera vez que contratan, eso CUENTA como slot cubierto y NO insistas. Pasa al cierre.

REGLAS DE COBERTURA:
- Sigue el ORDEN: vacante primero, tareas_del_rol después. Si el founder responde algo distinto al slot que preguntaste, agradece lo dicho y redirige amablemente al slot pendiente.
- ANTI-REDUNDANCIA CRÍTICA: si el founder YA contestó conceptualmente un slot (aunque no diste todos los detalles que pediste), MÁRCALO COMO CUBIERTO y avanza. NUNCA re-preguntes un slot completo "porque faltaban detalles" — eso enfurece al founder. Si necesitas un dato puntual, pídelo SOLO ESE DATO con UNA frase corta y específica (ej. "¿1 vacante o varias?"), no re-formules toda la pregunta del slot.
- Antes de hacer cada pregunta, mira el historial: si alguna respuesta del founder YA respondió ese slot (incluso de forma corta), márcalo cubierto y SALTA al siguiente.
- Si una respuesta es vaga (sin datos concretos), profundiza UNA VEZ con un follow-up corto, después pasa al siguiente slot — no te trabes ni machacques.
- Haz puente narrativo con lo que el founder acaba de decir, no salto brusco.
- No inventes contexto. Si el founder no menciona algo, no lo agregues a tu siguiente pregunta como si lo hubiera dicho.

EJEMPLOS DE LO QUE NO HACER (re-pregunta redundante):
  Founder: "Buscamos a alguien de marketplace, porque no tenemos casi ventas"
  Agente MAL: "Para entender bien la vacante: ¿qué rol específico buscan?"
  → ESO ESTÁ MAL. El founder YA dijo el rol (marketplace) y el porqué (sin ventas). El slot vacante está CUBIERTO. Pasa al siguiente.

  Founder: "Whatsapp e instagram, español."
  Agente MAL: "¿Hay alguna otra restricción dura?"
  → MAL. Ya cubrió no_negociables. Avanza.

  EJEMPLO DE LO QUE SÍ HACER (follow-up de un detalle puntual, máx 1):
  Founder: "Buscamos a alguien de marketplace"
  Agente OK: "Perfecto. ¿1 vacante o varias?"
  → Pide UN dato puntual, NO re-formula el slot.

ESTILO:
- Español natural neutro latinoamericano, cercano, no corporativo.
- UNA pregunta a la vez, corta y específica (máx 2 oraciones).
- Tuteo neutro con "tú", consistente. PROHIBIDO el voseo rioplatense (formas como "vos", "tenés", "contame", "decime", "fijate", "podés", "querés", "sabés", "hacés", "preferís"). Usa siempre conjugaciones estándar de "tú" ("tienes", "cuéntame", "dime", "fíjate", "puedes", "quieres", "sabes", "haces", "prefieres").

PROHIBIDO PREGUNTAS SÍ/NO:
- Nunca empieces con "¿Hubo…?", "¿Alguna vez…?", "¿Tuviste…?", "¿Sabes…?", "¿Han contratado…?", "¿Hay…?".
- Toda pregunta debe empezar con QUÉ, CÓMO, CUÁNDO, CUÁNTOS, CUÁL o un imperativo tipo "Cuéntame…", "Piensa en…", "Dame un ejemplo de…".
- Si quieres explorar si algo ocurrió, pide directamente el ejemplo: "Cuéntame la última vez que contrataron para algo parecido y qué falló" en vez de "¿Contrataron antes?".

CIERRE (done=true):
- Marca done=true cuando tengas los 4 slots OBLIGATORIOS cubiertos (vacante, tareas_del_rol, contexto_equipo, no_negociables). "Cubierto" significa conceptualmente respondido — NO esperes a que el founder diga "tengo 3 vacantes, una está en marketing y otra en ventas" para considerar el slot completo. Si dijo "buscamos alguien de X", el slot está cubierto.
- El slot experiencia_previa es OPCIONAL — no esperes a cubrirlo si los 4 obligatorios están listos.
- Nunca marques done=true antes del turno 4 del founder.
- Después del turno 6, marca done=true sí o sí (cap).
- Cuando done=true, en nextQuestion devuelve un cierre breve: "Listo, con esto puedo armar la búsqueda. Voy a estructurar tu necesidad y buscar candidatos."

Devuelve JSON con:
{
  "nextQuestion": "tu pregunta — UNA, dirigida al PRÓXIMO slot pendiente en orden de prioridad",
  "done": boolean,
  "targetedSlot": "uno de: vacante | tareas_del_rol | contexto_equipo | no_negociables | experiencia_previa",
  "slotsCovered": ["lista de slots YA cubiertos con detalle concreto"],
  "reasoning": "una frase interna: qué slot elegiste y por qué"
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

/**
 * Los 4 obligatorios — el quinto (`experiencia_previa`) es opcional y solo
 * se pregunta si hay margen de turnos. El fallback determinístico respeta
 * este orden estricto para que la entrevista sin LLM siga teniendo sentido
 * narrativo: primero el rol, luego las tareas, luego el contexto, luego los
 * no-negociables.
 */
const REQUIRED_SLOTS = [
  "vacante",
  "tareas_del_rol",
  "contexto_equipo",
  "no_negociables",
] as const;

function pickFallbackQuestion(messages: ChatMessage[]): {
  question: string;
  slot: string;
} {
  const covered = new Set(detectSlots(messages));
  const askedBlob = alreadyAskedTokens(messages);

  // Prioridad estricta: primero los slots OBLIGATORIOS en orden, luego el
  // opcional (experiencia_previa) solo si todos los obligatorios están listos.
  const orderRequired = REQUIRED_SLOTS.filter((s) => !covered.has(s));
  const orderOptional = !covered.has("experiencia_previa") ? ["experiencia_previa" as const] : [];
  const order: (typeof TARGET_SLOTS)[number][] = [...orderRequired, ...orderOptional];

  for (const slot of order) {
    for (const q of QUESTION_BANK[slot]) {
      const head = q.toLowerCase().slice(0, 24);
      if (!askedBlob.includes(head)) return { question: q, slot };
    }
  }
  return {
    question:
      "Profundicemos un poco más: dame un ejemplo concreto del día a día de la persona nueva.",
    slot: "tareas_del_rol",
  };
}

/**
 * Done = los 4 obligatorios cubiertos. El opcional no es bloqueante.
 * El caller (POST handler) además respeta MIN_USER_TURNS/MAX_USER_TURNS.
 */
function hasAllRequiredSlots(messages: ChatMessage[]): boolean {
  const covered = new Set(detectSlots(messages));
  return REQUIRED_SLOTS.every((s) => covered.has(s));
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
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string') {
        const err = validateChatMessage(m.content);
        if (err) {
          log.end({ status: 400, extra: { reason: 'message_too_long' } });
          return NextResponse.json({ error: err, code: 'message_too_long', done: false }, { status: 400 });
        }
      }
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
    // Guard adicional: si el LLM marca done=true pero los 4 slots obligatorios
    // no están cubiertos en la heurística, lo desautorizamos (a menos que ya
    // hayamos pegado el cap de turnos, donde el cierre es forzoso).
    if (done && userTurns < MAX_USER_TURNS && !hasAllRequiredSlots(messages)) {
      log.info("edge.llm_done_blocked_by_required_slots", { userTurns });
      done = false;
    }

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
