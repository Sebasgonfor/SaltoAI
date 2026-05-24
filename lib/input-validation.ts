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
        "Necesito más detalle para construir tu perfil. Contame qué hiciste exactamente y qué resultado tuvo.",
    };
  }
  if (isLastAnswerTooShort(messages, 3)) {
    return {
      ok: false,
      reason: "too_short",
      message:
        "Tu última respuesta fue muy corta. Profundizá un poco — paso a paso, qué hiciste y cómo te diste cuenta de que funcionó.",
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
      message: "Necesito una descripción de tu necesidad. Contame qué buscás y en qué contexto.",
    };
  }
  if (words < 8) {
    return {
      ok: false,
      reason: "too_few_words",
      message:
        "Tu descripción es muy corta para estructurar el rol. Contame qué hace la persona, el contexto del equipo y qué señales conductuales importan.",
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
