/**
 * Validación honesta de inputs para los agentes.
 *
 * §8.5 del PRD: ante perfil escaso o conversación vacía, decimos "necesito más
 * detalle" en vez de inventar (mock genérico) o reventar con 500.
 */
import type { ChatMessage } from "./types";

export function countUserTurns(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

export function totalUserWords(messages: ChatMessage[]): number {
  return messages
    .filter((m) => m.role === "user")
    .reduce((acc, m) => acc + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
}

export function isLastAnswerTooShort(messages: ChatMessage[], minWords = 2): boolean {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return true;
  const words = last.content.trim().split(/\s+/).filter(Boolean);
  return words.length < minWords;
}

/**
 * Detecta si el último mensaje del agente es una pregunta cerrada (sí/no).
 * Sirve para que el guard de "respuesta muy corta" no regañe al usuario
 * cuando "No" / "Sí" / "Nunca" son respuestas legítimas a una pregunta
 * que el propio agente formuló mal. Idealmente el prompt prohíbe sí/no,
 * pero a veces se le escapa al LLM y queremos manejarlo con elegancia.
 */
export function isYesNoQuestion(text: string): boolean {
  const t = (text ?? "").toLowerCase().trim();
  if (!t.includes("?")) return false;
  // Aperturas típicas de pregunta cerrada en español neutro latinoamericano.
  return /(^|[¿\s])(hubo|hubieron|alguna vez|alguien|tuviste|te pas[óo]|te toc[óo]|sab[ée]s|sabias|sab[ií]as|pod[ée]s|pudiste|fuiste|estuviste|conoces|conoc[ée]s|has |hab[ée]s|hac[ée]s|hiciste|llegaste|recordas|record[áa]s)/i.test(
    t
  );
}

export function lastAgentMessage(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "agent");
  return last?.content ?? "";
}

/**
 * Variantes de re-prompt cuando el usuario respondió corto a una pregunta
 * sí/no del agente. NO regaña — pide el ejemplo concreto.
 */
export const YES_NO_FOLLOWUP_PROMPTS = [
  "Bueno, cuéntame ese momento — ¿qué pasó, qué hiciste, cómo terminó?",
  "Perfecto. Ahora cuéntame el ejemplo concreto: ¿cuándo fue y qué hiciste exactamente?",
  "Buenísimo, vamos al caso real. Cuéntame paso a paso qué hiciste y qué cambió.",
] as const;

export function pickYesNoFollowup(seed = 0): string {
  return YES_NO_FOLLOWUP_PROMPTS[seed % YES_NO_FOLLOWUP_PROMPTS.length];
}

export interface InterviewValidity {
  ok: boolean;
  reason?: "no_user_turns" | "too_short" | "too_few_words";
  message?: string;
}

/**
 * Validación previa al CIERRE de entrevista (POST /api/perfil).
 * Antes el código mockeaba a Camila Silva cuando no había historial → falsa
 * señal en la demo. Ahora pedimos más contexto explícitamente.
 */
export function validateForProfileExtraction(messages: ChatMessage[]): InterviewValidity {
  const turns = countUserTurns(messages);
  const words = totalUserWords(messages);
  if (turns === 0) {
    return {
      ok: false,
      reason: "no_user_turns",
      message:
        "Aún no contaste nada. Para armar tu Perfil de Evidencia necesito al menos una historia con detalle.",
    };
  }
  if (words < 15) {
    return {
      ok: false,
      reason: "too_few_words",
      message:
        "Necesito más detalle para construir tu perfil. Cuéntame qué hiciste exactamente y qué resultado tuvo.",
    };
  }
  if (isLastAnswerTooShort(messages, 3)) {
    return {
      ok: false,
      reason: "too_short",
      message:
        "Tu última respuesta fue muy corta. Profundiza un poco — paso a paso, qué hiciste y cómo te diste cuenta de que funcionó.",
    };
  }
  return { ok: true };
}

export function validateNeedDescription(raw: string): InterviewValidity {
  const t = (raw ?? "").trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (t.length === 0) {
    return {
      ok: false,
      reason: "no_user_turns",
      message: "Necesito una descripción de tu necesidad. Cuéntame qué buscas y en qué contexto.",
    };
  }
  if (words < 8) {
    return {
      ok: false,
      reason: "too_few_words",
      message:
        "Tu descripción es muy corta para estructurar el rol. Cuéntame qué hace la persona, el contexto del equipo y qué señales conductuales importan.",
    };
  }
  return { ok: true };
}

export const JOVEN_AGE_MIN = 14;
export const JOVEN_AGE_MAX = 99;

/** Parsea edad desde formulario o persistencia (string o number). */
export function parseJovenAge(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const age = Math.round(n);
  if (age < JOVEN_AGE_MIN || age > JOVEN_AGE_MAX) return null;
  return age;
}

export function jovenAgeErrorMessage(): string {
  return `Escribe una edad válida (${JOVEN_AGE_MIN}–${JOVEN_AGE_MAX} años).`;
}
