/**
 * Configuración de personalización por RECLUTADORA — fuente única de tipos,
 * presets y validación. Módulo puro (server+client safe): solo datos, regex y
 * funciones puras, sin dependencias de runtime.
 *
 * Permite que cada reclutadora (cuenta `empresa`) personalice el entrevistador
 * y la devolución: identidad/nombre, voz (descriptor destilado + ejemplos),
 * preguntas propias, señales a priorizar, marca, idioma y foco. La config se
 * comparte vía un link público `/r/[slug]`.
 *
 * Principio: la personalización es ADITIVA y SUBORDINADA. Nada de aquí puede
 * cambiar el presupuesto de turnos, el schema JSON, la detección de señales ni
 * el gate de cierre del motor de entrevista.
 */
import { SIGNAL_IDS } from "./signals";

export type PersonalityPreset =
  | "calido" // default — reproduce el tono neutro-cálido actual
  | "directo"
  | "profesional"
  | "juvenil"
  | "tecnico";

export type InterviewLanguage = "es" | "en";

/** Origen de una muestra de voz de la reclutadora (para destilación/few-shot). */
export type StyleSampleSource = "wizard" | "pasted" | "audio";

export interface StyleSample {
  source: StyleSampleSource;
  text: string;
}

export interface RecruiterBrand {
  logoUrl?: string;
  /** Color de marca validado a `#rrggbb`. */
  primaryColor?: string;
  tagline?: string;
  welcomeMessage?: string;
}

export interface RecruiterCustomQuestion {
  id: string;
  text: string;
}

export interface RecruiterConfig {
  /** Doc id en Firestore = uid de la reclutadora (1 config por cuenta). */
  recruiterUid: string;
  /** Slug único y público para el link `/r/[slug]`. */
  slug: string;
  /** Marca/persona mostrada al joven ("Entrevista para {displayName}"). */
  displayName: string;
  /** Nombre del entrevistador (ej. "María"); el agente se presenta así. */
  interviewerName?: string;
  /** Preset baseline; la voz real vive en personaDescriptor + styleSamples. */
  personality: PersonalityPreset;
  /** Párrafo de voz DESTILADO y EDITABLE — fuente de verdad del estilo. */
  personaDescriptor?: string;
  /** Muestras de voz (respuestas del wizard, ejemplos pegados, audios transcritos). */
  styleSamples: StyleSample[];
  language: InterviewLanguage;
  /** Sector/audiencia para sesgar feedback (ej. "empleabilidad general, no solo tech"). */
  focus?: string;
  /** Preferencias libres (subordinadas a las reglas duras). */
  instructions?: string;
  customQuestions: RecruiterCustomQuestion[];
  /** Subconjunto de SIGNAL_IDS a priorizar. */
  prioritySignals: string[];
  brand: RecruiterBrand;
  createdAt: number;
  updatedAt: number;
}

/** Shape slim y saneado que consumen los builders de prompt y los endpoints de feedback. */
export interface PromptConfig {
  displayName?: string;
  interviewerName?: string;
  personality: PersonalityPreset;
  personaDescriptor?: string;
  /** Textos representativos (top N) para few-shot. */
  styleSamples: string[];
  language: InterviewLanguage;
  focus?: string;
  instructions?: string;
  customQuestions: string[];
  prioritySignals: string[];
}

/** Subset público para la landing — NUNCA expone persona/instructions/samples. */
export interface RecruiterBrandPublic {
  slug: string;
  displayName: string;
  interviewerName?: string;
  brand: RecruiterBrand;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export const DEFAULT_PERSONALITY: PersonalityPreset = "calido";
export const DEFAULT_LANGUAGE: InterviewLanguage = "es";

/** `promptLine` vacío en "calido" = sin cambios respecto al tono actual. */
export const PERSONALITY_PRESETS: Record<
  PersonalityPreset,
  { label: string; promptLine: string }
> = {
  calido: { label: "Cálido y cercano", promptLine: "" },
  directo: {
    label: "Directo y conciso",
    promptLine:
      "Tono directo y conciso: ve al grano, sin charla de relleno; máximo una oración de contexto antes de cada pregunta.",
  },
  profesional: {
    label: "Profesional y formal",
    promptLine:
      "Tono formal y profesional, cordial pero sobrio; trato respetuoso y estructurado.",
  },
  juvenil: {
    label: "Juvenil y motivador",
    promptLine:
      "Tono muy cercano y juvenil, relajado y motivador, como un mentor de confianza que anima a la persona.",
  },
  tecnico: {
    label: "Analítico y detallista",
    promptLine:
      "Tono analítico y curioso: profundiza en el cómo y el porqué, pide ejemplos concretos y datos.",
  },
};

export function isPersonalityPreset(v: unknown): v is PersonalityPreset {
  return typeof v === "string" && v in PERSONALITY_PRESETS;
}

export function isInterviewLanguage(v: unknown): v is InterviewLanguage {
  return v === "es" || v === "en";
}

// ── Caps / límites ───────────────────────────────────────────────────────────

export const MAX_CUSTOM_QUESTIONS = 8;
export const CUSTOM_QUESTION_MAX_CHARS = 200;
export const INSTRUCTIONS_MAX_CHARS = 600;
export const INTERVIEWER_NAME_MAX = 40;
export const DISPLAY_NAME_MAX = 60;
export const FOCUS_MAX = 200;
export const TAGLINE_MAX = 120;
export const WELCOME_MAX = 280;
export const PERSONA_DESCRIPTOR_MAX = 1200;
export const MAX_STYLE_SAMPLES = 12;
export const STYLE_SAMPLE_MAX_CHARS = 1000;
export const SLUG_MAX = 32;
/** Cuántas muestras se inyectan como few-shot en los prompts. */
export const PROMPT_STYLE_SAMPLES = 4;

/** Slugs reservados (rutas del producto) que no se pueden reclamar. */
export const RESERVED_SLUGS = new Set([
  "r",
  "api",
  "empresa",
  "joven",
  "admin",
  "auth",
  "onboarding",
  "login",
  "signup",
  "dashboard",
  "perfil",
  "app",
  "_next",
  "legal",
  "favicon",
]);

// ── Helpers de slug ──────────────────────────────────────────────────────────

/** Normaliza a un slug URL-safe: minúsculas, sin acentos, `[a-z0-9-]`. */
export function normalizeSlug(raw: string): string {
  return (raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // no alfanumérico → guion
    .replace(/-+/g, "-") // colapsa guiones
    .replace(/^-|-$/g, "") // recorta guiones extremos
    .slice(0, SLUG_MAX)
    .replace(/-$/g, "");
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > SLUG_MAX) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug);
}

// ── Validación de campos ─────────────────────────────────────────────────────

/** Devuelve `#rrggbb` válido en minúsculas, o `undefined` (evita inyección por CSS var). */
export function validateHexColor(raw?: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : undefined;
}

/** Intersección con SIGNAL_IDS, sin duplicados, en el orden canónico de las señales. */
export function validatePrioritySignals(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const wanted = new Set(ids.filter((x): x is string => typeof x === "string"));
  return SIGNAL_IDS.filter((id) => wanted.has(id));
}

function clampStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function genQuestionId(i: number): string {
  return `cq_${i}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCustomQuestions(raw: unknown): RecruiterCustomQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: RecruiterCustomQuestion[] = [];
  for (const item of raw) {
    let text = "";
    let id = "";
    if (typeof item === "string") text = item;
    else if (item && typeof item === "object") {
      text = clampStr((item as Record<string, unknown>).text, CUSTOM_QUESTION_MAX_CHARS);
      const rawId = (item as Record<string, unknown>).id;
      if (typeof rawId === "string" && rawId.trim()) id = rawId.trim().slice(0, 40);
    }
    text = clampStr(text, CUSTOM_QUESTION_MAX_CHARS);
    if (!text) continue;
    out.push({ id: id || genQuestionId(out.length), text });
    if (out.length >= MAX_CUSTOM_QUESTIONS) break;
  }
  return out;
}

function normalizeStyleSamples(raw: unknown): StyleSample[] {
  if (!Array.isArray(raw)) return [];
  const out: StyleSample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const text = clampStr(r.text, STYLE_SAMPLE_MAX_CHARS);
    if (!text) continue;
    const source: StyleSampleSource =
      r.source === "audio" || r.source === "pasted" || r.source === "wizard"
        ? r.source
        : "pasted";
    out.push({ source, text });
    if (out.length >= MAX_STYLE_SAMPLES) break;
  }
  return out;
}

export type ValidateResult =
  | { ok: true; config: Omit<RecruiterConfig, "createdAt" | "updatedAt"> }
  | { ok: false; error: string };

/**
 * Valida y normaliza el payload del formulario de la reclutadora. No asigna
 * timestamps (los pone la ruta PUT). Garantiza slug válido, displayName, caps
 * en todos los textos y enums coercionados a valores seguros.
 */
export function validateRecruiterConfigInput(raw: unknown, uid: string): ValidateResult {
  if (!uid) return { ok: false, error: "uid requerido" };
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload inválido" };
  const r = raw as Record<string, unknown>;

  const slug = normalizeSlug(typeof r.slug === "string" ? r.slug : "");
  if (!isValidSlug(slug)) {
    return { ok: false, error: "El slug no es válido o está reservado (usa letras, números y guiones)." };
  }

  const displayName = clampStr(r.displayName, DISPLAY_NAME_MAX);
  if (!displayName || displayName.length < 2) {
    return { ok: false, error: "El nombre a mostrar es obligatorio." };
  }

  const personality = isPersonalityPreset(r.personality) ? r.personality : DEFAULT_PERSONALITY;
  const language = isInterviewLanguage(r.language) ? r.language : DEFAULT_LANGUAGE;

  const interviewerName = clampStr(r.interviewerName, INTERVIEWER_NAME_MAX) || undefined;
  const personaDescriptor = clampStr(r.personaDescriptor, PERSONA_DESCRIPTOR_MAX) || undefined;
  const focus = clampStr(r.focus, FOCUS_MAX) || undefined;
  const instructions = clampStr(r.instructions, INSTRUCTIONS_MAX_CHARS) || undefined;

  const brandRaw = (r.brand && typeof r.brand === "object" ? r.brand : {}) as Record<string, unknown>;
  const brand: RecruiterBrand = {
    logoUrl: clampStr(brandRaw.logoUrl, 500) || undefined,
    primaryColor: validateHexColor(brandRaw.primaryColor),
    tagline: clampStr(brandRaw.tagline, TAGLINE_MAX) || undefined,
    welcomeMessage: clampStr(brandRaw.welcomeMessage, WELCOME_MAX) || undefined,
  };

  return {
    ok: true,
    config: {
      recruiterUid: uid,
      slug,
      displayName,
      interviewerName,
      personality,
      personaDescriptor,
      styleSamples: normalizeStyleSamples(r.styleSamples),
      language,
      focus,
      instructions,
      customQuestions: normalizeCustomQuestions(r.customQuestions),
      prioritySignals: validatePrioritySignals(r.prioritySignals),
      brand,
    },
  };
}

// ── Proyecciones ─────────────────────────────────────────────────────────────

/** Config → shape slim para prompts/feedback (defensa en profundidad: recapa). */
export function toPromptConfig(cfg: RecruiterConfig): PromptConfig {
  return {
    displayName: cfg.displayName || undefined,
    interviewerName: cfg.interviewerName || undefined,
    personality: isPersonalityPreset(cfg.personality) ? cfg.personality : DEFAULT_PERSONALITY,
    personaDescriptor: cfg.personaDescriptor
      ? cfg.personaDescriptor.slice(0, PERSONA_DESCRIPTOR_MAX)
      : undefined,
    styleSamples: (cfg.styleSamples ?? [])
      .map((s) => s.text.slice(0, STYLE_SAMPLE_MAX_CHARS))
      .filter(Boolean)
      .slice(0, PROMPT_STYLE_SAMPLES),
    language: isInterviewLanguage(cfg.language) ? cfg.language : DEFAULT_LANGUAGE,
    focus: cfg.focus ? cfg.focus.slice(0, FOCUS_MAX) : undefined,
    instructions: cfg.instructions ? cfg.instructions.slice(0, INSTRUCTIONS_MAX_CHARS) : undefined,
    customQuestions: (cfg.customQuestions ?? [])
      .map((q) => q.text)
      .filter(Boolean)
      .slice(0, MAX_CUSTOM_QUESTIONS),
    prioritySignals: validatePrioritySignals(cfg.prioritySignals),
  };
}

/** Config → subset público para la landing. */
export function toBrandPublic(cfg: RecruiterConfig): RecruiterBrandPublic {
  return {
    slug: cfg.slug,
    displayName: cfg.displayName,
    interviewerName: cfg.interviewerName,
    brand: {
      logoUrl: cfg.brand?.logoUrl,
      primaryColor: validateHexColor(cfg.brand?.primaryColor),
      tagline: cfg.brand?.tagline,
      welcomeMessage: cfg.brand?.welcomeMessage,
    },
  };
}
