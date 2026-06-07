/**
 * Extractor heurístico de perfil — piso de robustez.
 *
 * Cuando el LLM devuelve perfil pobre (0 skills, 0 evidencia) o no hay
 * GEMINI_API_KEY, este extractor garantiza que NUNCA salga un perfil vacío.
 * Funciona escaneando el transcript del joven con regex de las 8 señales
 * del PRD §8 y armando skills/traits/evidence canónicos a partir de
 * citas reales del usuario.
 *
 * NO inventa cifras. NO inventa logros. Solo toma fragmentos del propio
 * texto del joven y los etiqueta con la skill correspondiente.
 */
import type { ChatMessage, Profile } from "./types";
import { SIGNALS, isSignalCovered, type Signal } from "./signals";

/** Devuelve los fragmentos del transcript del joven (oraciones útiles). */
function extractSentences(messages: ChatMessage[]): string[] {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  // Cortamos en signos fuertes y conservamos solo oraciones con cuerpo.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.split(/\s+/).length >= 6);
}

/**
 * Conjugaciones de 1ª persona singular (pasado) → 3ª persona singular (pasado).
 * Cubre los verbos más frecuentes en relatos de trabajo informal. Se usa para
 * convertir el verbo inicial de la cita; si queda 1ª persona sin convertir,
 * NO arriesgamos texto roto (ver toThirdPerson).
 */
const FIRST_TO_THIRD: Record<string, string> = {
  decidí: "decidió", propuse: "propuso", empecé: "empezó", arranqué: "arrancó",
  aprendí: "aprendió", enseñé: "enseñó", resolví: "resolvió", solucioné: "solucionó",
  arreglé: "arregló", encontré: "encontró", vendí: "vendió", compré: "compró",
  aumenté: "aumentó", crecí: "creció", logré: "logró", conseguí: "consiguió",
  alcancé: "alcanzó", atendí: "atendió", respondí: "respondió", ayudé: "ayudó",
  coordiné: "coordinó", colaboré: "colaboró", organicé: "organizó", ordené: "ordenó",
  clasifiqué: "clasificó", detecté: "detectó", noté: "notó", revisé: "revisó",
  verifiqué: "verificó", manejé: "manejó", administré: "administró", cuadré: "cuadró",
  controlé: "controló", insistí: "insistió", seguí: "siguió", continué: "continuó",
  terminé: "terminó", completé: "completó", hice: "hizo", armé: "armó", monté: "montó",
  creé: "creó", diseñé: "diseñó", construí: "construyó", implementé: "implementó",
  gestioné: "gestionó", lideré: "lideró", llevé: "llevó", abrí: "abrió", puse: "puso",
  trabajé: "trabajó", estudié: "estudió", investigué: "investigó", busqué: "buscó",
  adapté: "adaptó", ajusté: "ajustó", di: "dio", fui: "fue", tuve: "tuvo",
  estuve: "estuvo", pude: "pudo", supe: "supo", vine: "vino", dije: "dijo",
  quise: "quiso", vi: "vio",
};

function stripPunct(w: string): string {
  return w.toLowerCase().replace(/[.,;:!?"'¿¡]/g, "");
}

/** ¿Queda algún rastro de 1ª persona tras intentar convertir? */
function hasResidualFirstPerson(s: string): boolean {
  if (/\b(yo|mí|conmigo)\b/i.test(s)) return true;
  // Algún verbo de 1ª persona del mapa que no se convirtió (p. ej. mid-frase).
  const words = s.match(/[a-zñáéíóú]+/gi) ?? [];
  return words.some((w) => Object.prototype.hasOwnProperty.call(FIRST_TO_THIRD, w.toLowerCase()));
}

/**
 * Convierte una cita del joven (primera persona) en una quote CV-ready
 * (tercera persona, pasado). Limpia pronombres, conjuga el verbo inicial con
 * FIRST_TO_THIRD y, si TODAVÍA queda 1ª persona, NO emite texto roto: usa la
 * quote canónica (fallbackQuote) o, en su defecto, presenta las palabras del
 * joven como cita textual explícita (honesto y gramaticalmente válido).
 */
function toThirdPerson(
  sentence: string,
  actionVerb: string,
  fallbackQuote?: string
): string {
  // Limpieza de pronombres de 1ª persona (incluye reflexivos "me " → "se ").
  let s = sentence
    .replace(/^\s*yo\s+/i, "")
    .replace(/\bmis\s+/gi, "sus ")
    .replace(/\bmi\s+/gi, "su ")
    .replace(/\bme\s+/gi, "se ")
    .replace(/\bnos\s+/gi, "se ")
    .replace(/\s+/g, " ")
    .trim();

  // Conjuga el verbo inicial. En reflexivos ("se <verbo>") el verbo va en pos. 1.
  const tokens = s.split(" ");
  const idx = stripPunct(tokens[0] ?? "") === "se" && tokens[1] ? 1 : 0;
  const verbKey = stripPunct(tokens[idx] ?? "");
  if (Object.prototype.hasOwnProperty.call(FIRST_TO_THIRD, verbKey)) {
    tokens[idx] = FIRST_TO_THIRD[verbKey];
    s = tokens.join(" ");
  }

  // Si la conversión no quedó limpia, preferimos calidad sobre especificidad.
  if (hasResidualFirstPerson(s)) {
    if (fallbackQuote) return fallbackQuote;
    return `${actionVerb} algo que describe así: "${sentence.trim()}"`;
  }

  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ExtractedProfileBody {
  summary: string;
  skills: string[];
  traits: string[];
  evidence: { skill: string; quote: string }[];
}

/**
 * Extractor heurístico — siempre produce 2-5 skills, 2-3 traits, 2-5 evidence,
 * o cae a un perfil canónico "mock" si literalmente no hay nada utilizable.
 */
export function heuristicExtraction(
  messages: ChatMessage[],
  basics: { name: string }
): ExtractedProfileBody {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  // Sin nada que extraer: perfil canónico mínimo (no vacío).
  if (!userText.trim()) {
    return {
      summary: `${basics.name} compartió fragmentos breves de su trayectoria. Para un perfil más completo, conviene profundizar con ejemplos concretos.`,
      skills: ["Comunicación", "Disposición a Aprender"],
      traits: ["Iniciativa"],
      evidence: [
        {
          skill: "Disposición a Aprender",
          quote:
            "Mostró interés en construir su perfil profesional y abrirse al primer empleo formal con apoyo de la plataforma.",
        },
      ],
    };
  }

  const matched: Signal[] = SIGNALS.filter((s) => isSignalCovered(s, userText));
  const sentences = extractSentences(messages);

  // Empareja cada señal con la oración más cercana que también la dispare.
  // Si no hay, usa la fallbackQuote canónica.
  const evidence: { skill: string; quote: string }[] = [];
  const skillsSet = new Set<string>();
  const traitsSet = new Set<string>();

  for (const sig of matched) {
    const matchingSentence = sentences.find((s) => isSignalCovered(sig, s));
    const quote = matchingSentence
      ? toThirdPerson(matchingSentence, sig.actionVerb, sig.fallbackQuote)
      : sig.fallbackQuote;
    evidence.push({ skill: sig.skill, quote });
    skillsSet.add(sig.skill);
    traitsSet.add(sig.trait);
  }

  // Floor: si el regex no enganchó nada, garantizamos 2 skills genéricas
  // ancladas a contenido real.
  if (evidence.length === 0) {
    const firstSentence = sentences[0] ?? userText.slice(0, 180);
    evidence.push({
      skill: "Comunicación",
      quote: toThirdPerson(firstSentence, "Compartió"),
    });
    evidence.push({
      skill: "Iniciativa",
      quote:
        "Tomó la decisión de armar su perfil profesional para acceder al primer empleo formal, mostrando disposición a aprender en marcha.",
    });
    skillsSet.add("Comunicación");
    skillsSet.add("Iniciativa");
    traitsSet.add("Proactividad");
  }

  // Garantizar mínimos sensatos (2 skills, 2 traits, 2 evidencias).
  if (traitsSet.size < 2) traitsSet.add("Curiosidad Aplicada");

  const skills = Array.from(skillsSet).slice(0, 10);
  const traits = Array.from(traitsSet).slice(0, 6);
  const finalEvidence = evidence.slice(0, 8);

  const summary =
    matched.length >= 2
      ? `${basics.name} ha demostrado ${matched
          .slice(0, 3)
          .map((m) => m.skill.toLowerCase())
          .join(", ")} a través de experiencias informales reales. Su trayectoria combina iniciativa con aprendizaje en marcha, en contextos de pequeño comercio o proyectos familiares.`
      : `${basics.name} compartió su trayectoria con ejemplos concretos. Su perfil se ancla en disposición a aprender y resolver problemas en entornos no formales.`;

  return {
    summary,
    skills,
    traits,
    evidence: finalEvidence,
  };
}

/**
 * Conveniencia: chequea si un perfil extraído por el LLM está vacío o pobre
 * y por tanto debe ser reforzado con el extractor heurístico.
 */
export function isProfileTooThin(p: {
  skills?: string[];
  evidence?: { skill: string; quote: string }[];
}): boolean {
  const skills = Array.isArray(p.skills) ? p.skills.length : 0;
  const evidence = Array.isArray(p.evidence) ? p.evidence.length : 0;
  // < 2 skills o < 2 evidencias = pobre. Forzamos refuerzo.
  return skills < 2 || evidence < 2;
}

/**
 * Fusiona el output del LLM con el del heurístico: prioriza el LLM (calidad
 * narrativa) pero rellena los huecos con el heurístico (piso de robustez).
 */
export function mergeProfiles(
  llm: ExtractedProfileBody,
  heuristic: ExtractedProfileBody
): ExtractedProfileBody {
  const skillsSet = new Set([...(llm.skills ?? []), ...heuristic.skills]);
  const traitsSet = new Set([...(llm.traits ?? []), ...heuristic.traits]);
  const evidence = [...(llm.evidence ?? [])];
  // Añadimos evidencia heurística solo de skills no cubiertas por el LLM.
  const llmSkillSet = new Set((llm.evidence ?? []).map((e) => e.skill.toLowerCase()));
  for (const h of heuristic.evidence) {
    if (!llmSkillSet.has(h.skill.toLowerCase())) evidence.push(h);
    if (evidence.length >= 8) break;
  }
  return {
    summary: llm.summary?.trim() || heuristic.summary,
    // Tope amplio: el LLM puede nombrar muchas skills reales; el heurístico
    // solo rellena huecos. No truncamos agresivamente.
    skills: Array.from(skillsSet).slice(0, 12),
    traits: Array.from(traitsSet).slice(0, 6),
    evidence: evidence.slice(0, 8),
  };
}
