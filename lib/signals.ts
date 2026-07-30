/**
 * FUENTE ÚNICA DE VERDAD — Señales de SaltoAI (entrevista del joven).
 *
 * Antes esta taxonomía estaba duplicada y divergida en 3 lugares:
 *   - El prompt del LLM (12 señales, con cualitativas).
 *   - El detector de cobertura en /api/entrevista (solo 8 cuantitativas).
 *   - El extractor heurístico (otras 8).
 * Resultado: las señales CUALITATIVAS (confiabilidad, atención al detalle,
 * sentido del orden, constancia) que el prompt enfatiza para roles de cuidado
 * (cajero, contador, archivista...) eran invisibles para el detector, el banco
 * de respaldo y la extracción heurística. Este módulo unifica todo.
 *
 * Cualquier consumidor (prompt, detector, banco de fallback, heurística, chips
 * del frontend) debe importar de aquí. Es seguro para cliente y servidor: solo
 * datos + RegExp + funciones puras, sin dependencias de runtime.
 *
 * NOTA sobre skills vs señales: las SEÑALES son un set acotado (necesario para
 * medir cobertura y tener banco de preguntas). Las SKILLS del perfil NO se
 * limitan a este set — el LLM las genera libremente; estas skills canónicas
 * solo actúan como piso de robustez cuando el LLM falla o queda pobre.
 */
import type { ChatMessage } from "./types";

export type SignalCategory = "cuantitativa" | "cualitativa" | "transversal";

export interface Signal {
  /** Clave canónica — lo que se reporta en signalsCovered/targetedSignal. */
  id: string;
  /** Etiqueta para UI (chips del frontend). */
  label: string;
  /** Agrupación para el prompt y la explicación al modelo. */
  category: SignalCategory;
  /** Descripción de una línea para el SIGNALS_LIST del prompt. */
  promptLine: string;
  /** Detección heurística sobre el texto del joven. */
  pattern: RegExp;
  /** Orden de prioridad al elegir señal pendiente (menor = se pregunta antes). */
  priority: number;
  /** Skill CV-ready asociada (piso heurístico, NO límite del perfil). */
  skill: string;
  /** Rasgo conductual asociado. */
  trait: string;
  /** Verbo de acción (3ª persona, pasado) para construir una quote. */
  actionVerb: string;
  /** Quote canónica cuando no se logra extraer una cita directa. */
  fallbackQuote: string;
  /** Preguntas de respaldo (2 variantes) cuando el LLM falla o no hay key. */
  fallbackQuestions: [string, string];
}

/**
 * Las 12 señales en orden de visualización (cuanti → cuali → transversal).
 * El campo `priority` controla el orden de selección, independiente de este.
 */
export const SIGNALS: Signal[] = [
  // ── CUANTITATIVAS ─────────────────────────────────────────────────────────
  {
    id: "iniciativa",
    label: "Iniciativa",
    category: "cuantitativa",
    promptLine: "algo que arrancó sin que se lo pidieran.",
    pattern:
      /(yo (mismo|sola|solo)|decid[íi]|propuse|me puse|empec[ée]|arranqu[ée]|tom[ée] la iniciativa|sin que (nadie|me lo))/i,
    priority: 1,
    skill: "Iniciativa",
    trait: "Proactividad",
    actionVerb: "Arrancó",
    fallbackQuote:
      "Arrancó proyectos por iniciativa propia, sin esperar instrucciones, identificando lo que hacía falta y ejecutándolo.",
    fallbackQuestions: [
      "Cuéntame de algo que hayas empezado tú sin que nadie te lo pidiera. ¿Qué fue y cómo arrancaste?",
      "Dame un ejemplo de algo que viste que faltaba y decidiste hacerlo tú. ¿Qué pasó?",
    ],
  },
  {
    id: "aprendizaje autónomo",
    label: "Aprendizaje autónomo",
    category: "cuantitativa",
    promptLine: "aprendió algo solo/a (tutoriales, prueba-error).",
    pattern:
      /(aprend[íi]|tutoriales?|youtube|tiktok|por mi cuenta|sol[ao]\b|nadie me enseñó|investigu[ée]|busqu[ée] c[óo]mo|autodidacta)/i,
    priority: 6,
    skill: "Aprendizaje Autónomo",
    trait: "Autodidacta",
    actionVerb: "Aprendió",
    fallbackQuote:
      "Aprendió de forma autónoma habilidades clave mediante tutoriales en línea y prueba-error, sin formación formal previa.",
    fallbackQuestions: [
      "Cuéntame de algo que tuviste que aprender sin que te enseñaran formalmente. ¿Cómo lo lograste?",
      "¿Hay alguna herramienta o habilidad que aprendiste por tu cuenta — YouTube, tutoriales, prueba y error? Cuéntame el proceso.",
    ],
  },
  {
    id: "resolución de problemas",
    label: "Resolución de problemas",
    category: "cuantitativa",
    promptLine: "destrabó algo improvisando.",
    pattern:
      /(resolv[íi]|solucion[éae]|arregl[ée]|encontr[ée] la forma|me las arregl[ée]|destrab[éae]|destranqu[ée])/i,
    priority: 2,
    skill: "Resolución de Problemas",
    trait: "Pensamiento Resolutivo",
    actionVerb: "Resolvió",
    fallbackQuote:
      "Resolvió problemas operativos improvisando con los recursos disponibles, sin escalamiento ni supervisión externa.",
    fallbackQuestions: [
      "Cuéntame de un problema concreto que resolviste improvisando. ¿Qué hiciste paso a paso?",
      "Dame un ejemplo de algo que se complicó de repente y cómo encontraste la salida.",
    ],
  },
  {
    id: "resultados medibles",
    label: "Resultados medibles",
    category: "cuantitativa",
    promptLine: "números, %, ventas, clientes, tiempos.",
    // Exige número o verbo de logro — evita falsos positivos con la palabra
    // suelta "ventas"/"clientes" (que pertenecen a atención al cliente).
    pattern:
      /(\d+\s*%|\d+\s*(ventas|clientes|seguidores|pedidos|meses|veces)|aumen[tc][ée]|crec[íi]|triplic[óo]|dupliqu[ée]|logr[éo]|consegu[íi])/i,
    priority: 3,
    skill: "Orientación a Resultados",
    trait: "Foco en Resultados",
    actionVerb: "Generó",
    fallbackQuote:
      "Generó resultados medibles en un negocio informal, conectando acciones cotidianas con métricas concretas de impacto.",
    fallbackQuestions: [
      "De lo que has hecho, ¿qué resultado concreto puedes medir? Ventas, clientes, tiempos, cualquier número.",
      "Cuéntame de un logro que se pueda contar en números — aunque sean pequeños. ¿Qué cambió y cuánto?",
    ],
  },
  {
    id: "adaptación al cambio",
    label: "Adaptación al cambio",
    category: "cuantitativa",
    promptLine: "se ajustó a un imprevisto / cambio de reglas.",
    // Se quitó la palabra suelta "nuevo" (alto falso positivo).
    pattern:
      /(adaptarme|me adapt[ée]|me ajust[ée]|imprevisto|de repente|sin previo aviso|cambio de (reglas|planes)|sorpresa|cambi[óo] todo)/i,
    priority: 8,
    skill: "Adaptación al Cambio",
    trait: "Tolerancia al Caos",
    actionVerb: "Se adaptó",
    fallbackQuote:
      "Se adaptó a cambios bruscos en las reglas del juego (precios, plataformas, demanda) ajustando el plan en marcha sin perder operación.",
    fallbackQuestions: [
      "Cuéntame de un momento en que las cosas cambiaron de repente y tuviste que reaccionar rápido. ¿Qué hiciste?",
      "Dame un ejemplo de una situación donde el plan original ya no servía y tuviste que cambiarlo en el camino.",
    ],
  },

  // ── CUALITATIVAS ──────────────────────────────────────────────────────────
  {
    id: "confiabilidad",
    label: "Confiabilidad",
    category: "cualitativa",
    promptLine:
      'hizo el trabajo bien hecho, sin errores ni faltantes ("cuadré caja sin un peso de menos", "manejé el stock sin pérdidas").',
    pattern:
      /(cuadr[ée]\s+(la\s+)?caja|sin\s+(un\s+)?(peso|error|faltante)|sin\s+p[ée]rdidas?|me\s+(confiaron|dejaron a cargo)|a\s+cargo\s+de|responsab(le|ilidad)|sin\s+que\s+faltara)/i,
    priority: 4,
    skill: "Confiabilidad Operativa",
    trait: "Responsabilidad",
    actionVerb: "Manejó",
    fallbackQuote:
      "Manejó recursos y responsabilidades sensibles (caja, stock, llaves) sin errores ni faltantes, ganándose la confianza para tareas críticas.",
    fallbackQuestions: [
      "Cuéntame de una responsabilidad delicada que te confiaron — manejar dinero, stock, llaves. ¿Cómo te aseguraste de no fallar?",
      "Dame un ejemplo de algo que tenías que hacer bien sí o sí, sin errores. ¿Cómo lo lograste?",
    ],
  },
  {
    id: "atención al detalle",
    // Label de chip distinto a "Atención al cliente" para que no se lean como
    // redundantes ("2 veces atención…"). El id/skill/pattern no cambian.
    label: "Detección de errores",
    category: "cualitativa",
    promptLine:
      'notó cosas que otros no veían, evitó errores ("detecté que faltaban pedidos", "encontré la diferencia en el inventario").',
    pattern:
      /(detect[ée]|me\s+di\s+cuenta|not[ée]\s+que|encontr[ée]\s+(la\s+)?(diferencia|error|fallo)|revis[ée]|verifiqu[ée]|chequ[ée]|me percat[ée]|faltaban)/i,
    priority: 5,
    skill: "Atención al Detalle",
    trait: "Meticulosidad",
    actionVerb: "Detectó",
    fallbackQuote:
      "Detectó errores e inconsistencias que otros pasaban por alto, evitando pérdidas y reprocesos antes de que escalaran.",
    fallbackQuestions: [
      "Cuéntame de una vez que notaste un error o un detalle que los demás habían pasado por alto. ¿Qué hiciste?",
      "Dame un ejemplo de algo que revisaste con cuidado y encontraste algo que no cuadraba.",
    ],
  },
  {
    id: "sentido del orden",
    label: "Sentido del orden",
    category: "cualitativa",
    promptLine:
      'organizó algo que estaba caótico ("ordené las facturas que estaban tiradas", "armé un sistema de archivo").',
    pattern:
      /(orden[ée]|organic[ée]|organiz[ée]|clasifiqu[ée]|arm[ée]\s+un\s+(sistema|m[ée]todo|orden|archivo)|inventari[ée]|catalog[ée]|estructur[ée]|puse en orden)/i,
    priority: 7,
    skill: "Organización",
    trait: "Método",
    actionVerb: "Organizó",
    fallbackQuote:
      "Organizó procesos y documentación que estaban desordenados, creando sistemas simples que agilizaron el trabajo del equipo.",
    fallbackQuestions: [
      "Cuéntame de algo que estaba desordenado o caótico y que tú organizaste. ¿Cómo lo hiciste?",
      "Dame un ejemplo de un sistema o método que armaste para mantener algo en orden.",
    ],
  },
  {
    id: "constancia",
    label: "Constancia",
    category: "cualitativa",
    promptLine: 'sostuvo una rutina sin abandonar ("hice esto todos los días por X meses").',
    pattern:
      /(todos\s+los\s+d[íi]as|cada\s+d[íi]a|durante\s+(varios\s+)?(meses|a[ñn]os|semanas)|por\s+\d+\s*(meses|a[ñn]os)|rutina|sin\s+falta[r]?|nunca\s+fall[ée]|constante|todos\s+los\s+(lunes|fines))/i,
    priority: 9,
    skill: "Constancia",
    trait: "Disciplina",
    actionVerb: "Sostuvo",
    fallbackQuote:
      "Sostuvo una rutina de trabajo diaria durante meses sin abandonar, demostrando disciplina y estabilidad.",
    fallbackQuestions: [
      "Cuéntame de algo que hiciste de forma constante durante un buen tiempo, día tras día. ¿Qué era y cómo lo sostuviste?",
      "Dame un ejemplo de una rutina o compromiso que mantuviste por meses sin abandonar.",
    ],
  },

  // ── TRANSVERSALES ─────────────────────────────────────────────────────────
  {
    id: "atención al cliente",
    label: "Atención al cliente",
    category: "transversal",
    promptLine: "manejo de reclamos, gente difícil.",
    pattern:
      /(client[ea]s?|reclam[oa]s?|atend[íi]|respond[íi]|usuari[oa]s?|consumidor|comprador)/i,
    priority: 10,
    skill: "Atención al Cliente",
    trait: "Empatía Operacional",
    actionVerb: "Atendió",
    fallbackQuote:
      "Atendió clientes y manejó reclamos en un comercio informal, recuperando clientes molestos mediante respuesta rápida y trato directo.",
    fallbackQuestions: [
      "Cuéntame de una situación difícil con un cliente o con alguien al que tuviste que atender. ¿Cómo la manejaste?",
      "Dame un ejemplo de un reclamo o una persona molesta que tuviste que calmar. ¿Qué hiciste?",
    ],
  },
  {
    id: "trabajo en equipo",
    label: "Trabajo en equipo",
    category: "transversal",
    promptLine: "coordinó con otros.",
    pattern:
      /(equipo|colabor[ée]|junto a|compañer[oa]s?|coordin[éa]|nos pusimos de acuerdo|reparti[mr]os)/i,
    priority: 11,
    skill: "Trabajo en Equipo",
    trait: "Colaboración",
    actionVerb: "Coordinó",
    fallbackQuote:
      "Coordinó tareas con otras personas, dividiendo roles claros y sosteniendo rutinas conjuntas en un entorno familiar o de pequeño negocio.",
    fallbackQuestions: [
      "Cuéntame de algo que hiciste coordinando con otras personas. ¿Cómo se repartieron el trabajo?",
      "Dame un ejemplo de un momento en que tuviste que ponerte de acuerdo con alguien para sacar algo adelante.",
    ],
  },
  {
    id: "persistencia",
    label: "Persistencia",
    category: "transversal",
    promptLine: "siguió intentando después de un fallo.",
    pattern:
      /(insist[íi]|segu[íi] intentando|no me rend[íi]|volv[íi] a intentar|fracas[éo][^.!?]{0,40}(pero|igual)|aun as[íi]|no abandon[ée])/i,
    priority: 12,
    skill: "Persistencia",
    trait: "Resiliencia",
    actionVerb: "Sostuvo",
    fallbackQuote:
      "Sostuvo proyectos durante meses sin abandonar, aprendiendo de fracasos parciales y ajustando el rumbo en cada iteración.",
    fallbackQuestions: [
      "Cuéntame de algo que no te salió la primera vez y volviste a intentar. ¿Qué pasó al final?",
      "Dame un ejemplo de algo difícil que sostuviste durante meses sin abandonar. ¿Qué te ayudó a no rendirte?",
    ],
  },
];

/** IDs canónicos, en orden de visualización. */
export const SIGNAL_IDS: string[] = SIGNALS.map((s) => s.id);

/** Mapa id → Signal para acceso O(1). */
const SIGNAL_BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));

export function signalById(id: string): Signal | undefined {
  return SIGNAL_BY_ID.get(id);
}

/** Señales en orden de prioridad de selección (para preguntar pendientes). */
export const SIGNALS_BY_PRIORITY: Signal[] = [...SIGNALS].sort(
  (a, b) => a.priority - b.priority
);

const CATEGORY_HEADERS: Record<SignalCategory, string> = {
  cuantitativa:
    "Señales CUANTITATIVAS (para roles donde el impacto y los números importan — ventas, marketing, growth, etc):",
  cualitativa:
    "Señales CUALITATIVAS (para roles donde el cuidado y la consistencia importan más que las métricas — contador, cajero, diseñador, archivista, asistente, operario, etc):",
  transversal: "Señales TRANSVERSALES (sirven a cualquier rol):",
};

/**
 * Construye el bloque de señales para el system prompt, agrupado por categoría
 * y numerado 1..12, con la nota de aplicabilidad. Única fuente del listado que
 * ve el modelo.
 */
export function buildSignalsListForPrompt(): string {
  const order: SignalCategory[] = ["cuantitativa", "cualitativa", "transversal"];
  const lines: string[] = [];
  let n = 1;
  for (const cat of order) {
    if (n > 1) lines.push("");
    lines.push(CATEGORY_HEADERS[cat]);
    for (const s of SIGNALS.filter((x) => x.category === cat)) {
      lines.push(`${n}. ${s.label} — ${s.promptLine}`);
      n++;
    }
  }
  lines.push("");
  lines.push(
    "IMPORTANTE: no todas las señales aplican a todos los jóvenes. Un joven que vendió comida casera va a tener señales cuantitativas naturalmente; un joven que ayudó en una tienda o llevó la contabilidad de un familiar va a tener señales cualitativas. AMBOS son valiosos — el motor de matching decide a qué empresa los presenta según lo que esa empresa NECESITA."
  );
  return lines.join("\n");
}

/** Enum (pipe-separated) de ids para instruir el campo targetedSignal. */
export function buildTargetedSignalEnum(): string {
  return SIGNAL_IDS.join(" | ");
}

/**
 * ¿El texto inmediatamente anterior a una coincidencia la niega?
 * Mira una ventana corta (~28 chars) antes del match. Trata como negación
 * "no/nunca/jamás/tampoco", pero NO la construcción "no solo/sólo" (que no
 * niega, p.ej. "no solo aprendí, también enseñé").
 */
function isNegated(before: string): boolean {
  if (/\b(nunca|jam[áa]s|tampoco)\b/i.test(before)) return true;
  return /\bno\b(?!\s+s[óo]lo)/i.test(before);
}

/**
 * ¿La señal aparece CUBIERTA en el texto? Recorre todas las coincidencias del
 * patrón y exige al menos una que NO esté negada. Evita falsos positivos como
 * "no tuve clientes" o "nunca trabajé en equipo" que antes inflaban la
 * cobertura (y, con el gate de cierre, provocaban cierres prematuros).
 */
export function isSignalCovered(signal: Signal, text: string): boolean {
  const flags = signal.pattern.flags.includes("g")
    ? signal.pattern.flags
    : signal.pattern.flags + "g";
  const re = new RegExp(signal.pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index === re.lastIndex) re.lastIndex++; // anti-bucle en match vacío
    const before = text.slice(Math.max(0, m.index - 28), m.index);
    if (!isNegated(before)) return true;
  }
  return false;
}

/** Detecta señales cubiertas en texto plano del joven (negación-aware). */
export function detectSignalsInText(text: string): string[] {
  return SIGNALS.filter((s) => isSignalCovered(s, text)).map((s) => s.id);
}

/** Detecta señales cubiertas sobre el historial de chat (mensajes del joven). */
export function detectSignals(messages: ChatMessage[]): string[] {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  return detectSignalsInText(text);
}

/**
 * Banco de respaldo: elige una pregunta para la señal pendiente más prioritaria
 * que aún no salió en la conversación. No repite preguntas ya hechas (compara
 * los primeros ~24 caracteres). Si no quedan señales/variantes, devuelve un
 * indicador para profundizar o cerrar — el caller decide el mensaje de cierre.
 */
export function pickFallbackQuestion(
  coveredSignals: string[],
  askedQuestions: string[]
): { question: string; signal: string; done: boolean } {
  const covered = new Set(coveredSignals);
  const askedBlob = askedQuestions.map((q) => q.toLowerCase()).join(" || ");

  for (const sig of SIGNALS_BY_PRIORITY) {
    if (covered.has(sig.id)) continue;
    for (const q of sig.fallbackQuestions) {
      const head = q.toLowerCase().slice(0, 24);
      if (!askedBlob.includes(head)) {
        return { question: q, signal: sig.id, done: false };
      }
    }
  }

  // Todas las señales cubiertas o todas las variantes usadas: profundización
  // genérica antes de cerrar.
  const generic =
    "Profundicemos un poco más: dame un ejemplo concreto de lo que acabas de contar — qué hiciste exactamente y qué resultado tuvo.";
  if (!askedBlob.includes(generic.toLowerCase().slice(0, 24))) {
    return { question: generic, signal: "resolución de problemas", done: false };
  }

  return { question: "", signal: "cierre", done: true };
}
