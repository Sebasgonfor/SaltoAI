/**
 * Validación honesta de inputs para los agentes.
 *
 * §8.5 del PRD: ante perfil escaso o conversación vacía, decimos "necesito más
 * detalle" en vez de inventar (mock genérico) o reventar con 500.
 */
import type { ChatMessage } from "./types";
import { detectSignals } from "./signals";

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
  reason?: "no_user_turns" | "too_short" | "too_few_words" | "no_signals";
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
  const signals = detectSignals(messages).length;

  if (turns === 0) {
    return {
      ok: false,
      reason: "no_user_turns",
      message:
        "Aún no contaste nada. Para armar tu Perfil de Evidencia necesito al menos una historia con detalle.",
    };
  }

  // Si la conversación YA tiene sustancia clara (varias señales reales o un
  // relato extenso), CONSTRUIMOS el perfil — sin importar que la última
  // respuesta haya sido corta (p. ej. "no" a la última pregunta). Antes esto
  // bloqueaba perfiles ricos (392 palabras, 6 señales) solo por el último
  // mensaje breve y disparaba el rescate de forma absurda.
  if (signals >= 3 || (signals >= 1 && words >= 60)) {
    return { ok: true };
  }

  if (words < 15) {
    return {
      ok: false,
      reason: "too_few_words",
      message:
        "Necesito más detalle para construir tu perfil. Cuéntame qué hiciste exactamente y qué resultado tuvo.",
    };
  }
  // Sin señales reales (relatos vacíos / divagación): no armamos un perfil con
  // el piso heurístico — sería sin sustancia. Pedimos un caso concreto.
  if (signals === 0) {
    return {
      ok: false,
      reason: "no_signals",
      message:
        "Todavía no detecto evidencia laboral en lo que contaste. Cuéntame UN caso concreto: algo que hiciste, cómo lo hiciste y qué resultado tuvo.",
    };
  }
  // Caso borde (pocas señales y última respuesta muy corta): pedimos profundizar.
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

// ─── Tipos de documento de identidad ─────────────────────────────────────────

export type DocType = 'CC' | 'CE' | 'PPN' | 'NIT';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CC: 'Cédula de Ciudadanía',
  CE: 'Cédula de Extranjería',
  PPN: 'Pasaporte',
  NIT: 'NIT (persona natural)',
};

// ─── NIT Colombia — validación de formato ────────────────────────────────────
//
// El NIT colombiano tiene 9 dígitos base + 1 dígito de verificación separado
// por guión. Aceptamos el NIT con o sin guión, con o sin dígito verificador,
// con puntos o espacios como separadores de miles (se normalizan antes de
// validar). También aceptamos el NIT sin el dígito verificador (6–9 dígitos).

function normalizeNumeric(raw: string): string {
  return raw.replace(/[\s.,]/g, ''); // elimina espacios, puntos, comas
}

// Calcula el dígito de verificación del NIT colombiano (DIAN).
// Retorna null si los dígitos no son exactamente 9.
function nitVerificationDigit(nineDigits: string): number | null {
  if (nineDigits.length !== 9 || !/^\d{9}$/.test(nineDigits)) return null;
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(nineDigits[8 - i]) * weights[i];
  }
  const rem = sum % 11;
  return rem < 2 ? rem : 11 - rem;
}

// ─── Identificador fiscal (NIT / RFC / CIF / genérico) ───────────────────────

export function validateTaxId(raw: string): string | null {
  if (!raw?.trim()) return 'El identificador fiscal es obligatorio.';

  // Separar el dígito verificador si viene con guión (ej. 900123456-7)
  const parts = raw.trim().split('-');
  const base = normalizeNumeric(parts[0]);
  const checkProvided = parts.length === 2 ? parts[1].trim() : null;

  // Colombia NIT: 6–9 dígitos base (o 10 si vienen juntos sin guión)
  if (/^\d{6,9}$/.test(base)) {
    if (base.length === 9 && checkProvided !== null) {
      const expected = nitVerificationDigit(base);
      if (expected !== null && parseInt(checkProvided) !== expected) {
        return `Dígito de verificación incorrecto. Para este NIT el dígito correcto es ${expected}.`;
      }
    }
    return null; // formato NIT válido
  }

  // NIT de 10 dígitos sin guión (los 9 base + el verificador pegado)
  if (/^\d{10}$/.test(base)) {
    const nineBase = base.slice(0, 9);
    const check = parseInt(base[9]);
    const expected = nitVerificationDigit(nineBase);
    if (expected !== null && check !== expected) {
      return `Dígito de verificación incorrecto. Para este NIT el dígito correcto es ${expected}.`;
    }
    return null;
  }

  // México RFC empresa (12 chars: 3 letras + 6 dígitos + 3 alfanum)
  if (/^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/i.test(base)) return null;

  // México RFC persona física (13 chars: 4 letras + 6 dígitos + 3 alfanum)
  if (/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/i.test(base)) return null;

  // España CIF (letra + 7 dígitos + control alfanumérico)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i.test(base)) return null;

  // España NIF (8 dígitos + letra)
  if (/^\d{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/i.test(base)) return null;

  // Genérico: mínimo 6 chars alfanuméricos con al menos 1 número
  if (base.length >= 6 && /[0-9]/.test(base) && /^[A-Z0-9]{6,20}$/i.test(base)) return null;

  return 'Formato no reconocido. Para Colombia ingresa el NIT sin puntos y con dígito de verificación (Ej: 900123456-7).';
}

// ─── Documento de identidad ───────────────────────────────────────────────────

export function validateDocId(raw: string, type: DocType = 'CC'): string | null {
  const cleaned = normalizeNumeric(raw.trim());
  if (!cleaned) return 'El número de documento es obligatorio.';

  switch (type) {
    case 'CC':
      if (!/^\d{6,10}$/.test(cleaned))
        return 'La Cédula de Ciudadanía debe tener entre 6 y 10 dígitos numéricos.';
      break;
    case 'NIT':
      if (!/^\d{6,10}$/.test(cleaned))
        return 'El NIT persona natural debe tener entre 6 y 10 dígitos.';
      break;
    case 'CE':
      if (!/^[A-Z0-9]{4,12}$/i.test(cleaned))
        return 'La Cédula de Extranjería debe tener entre 4 y 12 caracteres alfanuméricos.';
      break;
    case 'PPN':
      if (!/^[A-Z0-9]{5,9}$/i.test(cleaned))
        return 'El pasaporte debe tener entre 5 y 9 caracteres alfanuméricos.';
      break;
  }
  return null;
}

// ─── Nombres de persona ───────────────────────────────────────────────────────

export function validatePersonName(
  raw: string,
  opts: { requireFullName?: boolean; fieldLabel?: string } = {}
): string | null {
  const name = raw.trim();
  const label = opts.fieldLabel ?? 'El nombre';
  if (!name) return `${label} es obligatorio.`;
  if (name.length < 2) return `${label} debe tener al menos 2 caracteres.`;
  if (name.length > 80) return `${label} no puede superar los 80 caracteres.`;
  if (!/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/u.test(name)) return `${label} debe contener al menos una letra.`;
  if (/[<>{}\[\]\\|;@#$%^*=+]/.test(name)) return `${label} contiene caracteres no permitidos.`;
  if (opts.requireFullName && name.split(/\s+/).filter(Boolean).length < 2)
    return `${label} debe incluir nombre y apellido.`;
  return null;
}

// ─── Nombre de empresa ────────────────────────────────────────────────────────

export function validateCompanyName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return 'La razón social es obligatoria.';
  if (name.length < 2) return 'La razón social debe tener al menos 2 caracteres.';
  if (name.length > 120) return 'La razón social no puede superar los 120 caracteres.';
  if (/^[\d\s.,\-]+$/.test(name)) return 'La razón social no puede ser solo números o símbolos.';
  if (/[<>{}\[\]\\|;]/.test(name)) return 'La razón social contiene caracteres no permitidos.';
  return null;
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'El correo electrónico es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return 'Ingresa un correo electrónico válido (Ej: nombre@empresa.com).';
  return null;
}

// ─── Mensaje de chat ──────────────────────────────────────────────────────────

export const CHAT_MESSAGE_MAX_CHARS = 2000;

export function validateChatMessage(raw: string): string | null {
  if (raw.trim().length > CHAT_MESSAGE_MAX_CHARS)
    return `El mensaje no puede superar los ${CHAT_MESSAGE_MAX_CHARS} caracteres.`;
  return null;
}

// ─── API — campos requeridos ──────────────────────────────────────────────────

export function requireApiFields(
  body: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const f of fields) {
    const val = body[f];
    if (val == null || (typeof val === 'string' && !val.trim()))
      return `Campo requerido faltante: ${f}`;
  }
  return null;
}
