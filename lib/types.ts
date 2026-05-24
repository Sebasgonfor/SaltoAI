export type Role = "agent" | "user";

/**
 * Documento que el joven subió a su perfil — diploma, certificado, constancia
 * laboral, CV físico, etc. Persistido en Firestore (colección `documents`).
 *
 * Las skills extraídas por Gemini multimodal viven aparte en el campo
 * `extractedSkills` con `evidence` (cita textual del documento) — sin cita
 * no se agregan al perfil principal. Anti-alucinación.
 */
export type DocumentKind =
  | "certificado_curso"
  | "diploma"
  | "titulo_universitario"
  | "constancia_laboral"
  | "cv_fisico"
  | "otro";

export interface DocumentSkill {
  /** Habilidad inferida por la IA a partir del documento. */
  skill: string;
  /** Cita textual del documento que justifica la habilidad. SIN CITA, NO ENTRA. */
  evidence: string;
  /** 0-100: cuán segura está la IA de que la skill aparece. */
  confidence: number;
}

export interface ProfileDocument {
  id?: string;
  profileId: string;
  /** UID del usuario que subió el doc (para validar permisos de borrado). */
  uploaderUid?: string;
  /** URL pública servida por Cloudinary. */
  url: string;
  /** PublicId de Cloudinary, necesario para borrar el asset. */
  publicId: string;
  /** Tipo de archivo: pdf | jpg | png | webp */
  format: string;
  /** Tamaño en bytes (reportado por Cloudinary post-upload). */
  bytes: number;
  /** Nombre original del archivo que subió el joven. */
  originalName: string;
  /** Tipo de documento inferido por la IA o declarado por el joven. */
  kind?: DocumentKind;
  /** Institución emisora (ej. "SENA", "Platzi"). Inferida por la IA. */
  institution?: string;
  /** Título del programa/curso/grado. */
  programTitle?: string;
  /** Fecha de emisión (YYYY-MM) si se pudo inferir. */
  issuedAt?: string;
  /** Skills extraídas por Gemini multimodal — anti-alucinación con evidence. */
  extractedSkills?: DocumentSkill[];
  /** Estado del proceso de extracción. */
  extractionStatus?: "pending" | "done" | "failed" | "skipped";
  extractionError?: string;
  createdAt: number;
}

/** Género declarado por la persona (no se infiere del nombre). */
export type Gender = "mujer" | "hombre" | "otro" | "prefiero_no_decir";

export interface JovenBasics {
  name: string;
  age: number;
  gender: Gender;
}

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface EvidenceItem {
  skill: string;
  quote: string;
}

export interface HiddenSkill {
  name: string;
  derivedFrom: string;
  marketContext: string;
  confidence: "low" | "medium" | "high" | string;
}

export interface TransversalSkill {
  name: string;
  derivedFrom: string;
}

export interface SuggestedRole {
  roleTitle: string;
  whyFits: string;
  readinessHint: string;
}

export interface LatentProfile {
  hiddenSkills: HiddenSkill[];
  transversalSkills: TransversalSkill[];
  suggestedRoles: SuggestedRole[];
  closingMessage: string;
}

export interface TaskOutcomeStat {
  totalCompleted: number;
  averageRating: number;
}

/** Datos de contacto del joven para CV y vista empresa. Persistidos en `profiles.contact`. */
export interface ProfileContact {
  email?: string;
  phone?: string;
  city?: string;
  linkedin?: string;
  languages?: string;
  education?: string;
  certifications?: string;
  headline?: string;
  cvStyle?: string;
}

export interface Profile {
  id?: string;
  name: string;
  /** Perfiles antiguos pueden no tener edad. */
  age?: number;
  gender?: Gender;
  summary: string;
  skills: string[];
  traits: string[];
  evidence: EvidenceItem[];
  embedding: number[];
  createdAt: number;
  latent?: LatentProfile;
  taskStats?: TaskOutcomeStat;
  contact?: ProfileContact;
  /**
   * Skills extraídas por IA de los documentos del joven (diplomas,
   * certificados). NO persistido en el documento `profiles`; se enriquece
   * en runtime desde la colección `documents` cuando el motor de matching
   * necesita evaluar si una skill está VERIFICADA por documento (pesa más)
   * vs solo DECLARADA en entrevista.
   */
  documentSkills?: DocumentSkill[];
}

export type MicroTaskStatus =
  | "pending"
  | "in_progress"
  | "delivered"
  | "evaluated"
  | "paid";

export interface EvaluationCriterion {
  name: string;
  description: string;
}

export interface CriterionScore {
  name: string;
  score: number;
  comment: string;
}

export interface MicroTask {
  id?: string;
  companyId: string;
  companyName: string;
  profileId: string;
  profileName: string;
  needId?: string;
  title: string;
  rawRequest: string;
  brief: string;
  expectedDeliverable: string;
  criteria: EvaluationCriterion[];
  amountCOP: number;
  deadlineHours: number;
  status: MicroTaskStatus;
  deliverable?: string;
  deliveredAt?: number;
  aiEvaluation?: {
    criteriaScores: CriterionScore[];
    overallScore: number;
    overallComment: string;
  };
  companyRating?: number;
  companyComment?: string;
  evaluatedAt?: number;
  createdAt: number;
}

export interface OpportunityMatch {
  needId: string;
  companyName: string;
  role: string;
  ics: number;
  reason: string;
  /** Desglose del ICS — para que el joven pueda VER por qué le dieron ese
   * score sin necesidad de cruzar el muro de la vista de empresa. */
  breakdown?: ICSBreakdown;
  redFlag?: string;
  topSkills?: string[];
  /** Decisión de la empresa sobre este match (si existe). */
  companyStatus?: "interested" | "discarded" | null;
}

export type MatchDecisionStatus = "pending" | "interested" | "discarded";

export interface MatchDecision {
  id: string;
  needId: string;
  profileId: string;
  companyId: string;
  status: MatchDecisionStatus;
  icsAtTime?: number;
  updatedAt: number;
}

export interface CompanyLegal {
  /** Razón social o nombre comercial declarado. */
  companyName: string;
  /** NIT (CO) / CIF (ES) / RFC (MX) / RUT (CL) — texto libre, validado por jurisdicción aparte. */
  taxId: string;
  legalRepName: string;
  legalRepDocId: string;
  acceptedTerms: boolean;
  /** ISO timestamp del momento en que el founder aceptó TyC. */
  acceptedAt: string;
}

export interface CompanyNeed {
  id?: string;
  companyName: string;
  rawDescription: string;
  role: string;
  context: string;
  requiredSkills: string[];
  desiredTraits: string[];
  hardConstraints: string[];
  embedding: number[];
  createdAt: number;
  /** Solo presente cuando la necesidad vino del chat con gating legal. */
  legal?: CompanyLegal;
  /** UID del founder dueño. Necesario para que `listNeedsByOwner()` lo
   * encuentre y aparezca en `/empresa` (dashboard). Sin esto la necesidad
   * queda huérfana — guardada en Firestore pero invisible para su dueño. */
  ownerUid?: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  /** Naturaleza inferida del rol — cambia cómo el motor de matching pondera
   * los sub-scores. Default "mixta" para needs creados antes de esta feature. */
  jobNature?: JobNature;
  /** Breve explicación de POR QUÉ se clasificó así. Útil para auditoría
   * humana cuando el founder dice "no entiendo por qué este candidato sale alto". */
  jobNatureReason?: string;
}

export interface ICSBreakdown {
  skillsFit: number;
  behavioralFit: number;
  learningSignal: number;
  contextFit: number;
  penalties: number;
}

export interface Match {
  profileId: string;
  profileName: string;
  ics: number;
  breakdown: ICSBreakdown;
  reason: string;
  redFlag: string;
  topSkills: string[];
  taskStats?: TaskOutcomeStat;
  /**
   * Skills del joven que están VERIFICADAS por documento (certificado,
   * diploma) Y son relevantes para esta necesidad. La UI muestra un badge
   * "✓ verificada por documento" para distinguirlas de las declaradas en
   * entrevista — el founder confía más en estas.
   */
  verifiedSkills?: { skill: string; evidence: string }[];
}

/** Resultado persistido del ICS para una necesidad (calculado una vez al publicar). */
export interface NeedMatchSnapshot {
  needId: string;
  matches: Match[];
  rankingMode: "llm" | "degraded";
  degradedReason?: string;
  excluded: { profileId: string; reason: string }[];
  meta: {
    shortlistSize: number;
    llmHits: number;
    heuristicHits: number;
    profileCount: number;
  };
  warning?: string;
  computedAt: number;
}

/**
 * Tipo de señal de feedback. El motor ICS usa cada uno con un peso distinto:
 *   explicit_vote        — el founder marcó 👍/👎 en el match: señal directa.
 *   implicit_connect     — el founder clickeó "Quiero conectar": interés débil pero real.
 *   implicit_microtask   — el founder propuso una micro-tarea pagada: interés FUERTE
 *                          (puso dinero en el juego).
 *   microtask_outcome    — la micro-tarea fue completada y rateada: ground-truth
 *                          real sobre si ese match funciona o no.
 *   joven_interest       — el joven clickeó "Quiero conectar" en una oportunidad:
 *                          intención bidireccional; cuando ambas partes mostraron
 *                          interés (joven + founder) es señal MUY fuerte de match real.
 */
export type FeedbackSignal =
  | "explicit_vote"
  | "implicit_connect"
  | "implicit_microtask"
  | "microtask_outcome"
  | "joven_interest";

/**
 * Touchpoint del producto donde el feedback se captura. Cada pantalla
 * importante emite señales para que el motor ICS y los prompts se
 * recalibren con data REAL (PRD §6.2.6, §8.6 — el data flywheel).
 *
 * NOTA: los valores se persisten en Firestore, no renombrar después de
 * tener entries. Si necesitás un nuevo touchpoint, agregalo acá.
 */
/**
 * Alias local de UserRole para evitar import circular con lib/accounts.ts.
 * Si el set de roles cambia (raro), actualizar ambos lados.
 */
type UserRole = "joven" | "empresa";

export type FeedbackTouchpoint =
  // ─── Lado joven ─────────────────────────────────────────────
  | "interview_quality"        // post-entrevista: ¿la conversación entendió?
  | "profile_accuracy"         // perfil generado: ¿te sentís representado?
  | "evidence_quote"           // una cita específica del perfil
  | "cv_generated"             // CV descargado (implícita: qué template eligió)
  | "opportunity_click"        // joven clicó una need (interés débil)
  | "microtask_clarity"        // ¿el brief de la tarea está claro?
  | "microtask_evaluation"     // ¿la evaluación de la IA + founder fue justa?
  | "latent_suggestion"        // rol latente sugerido (click o descarte)
  | "course_recommendation"    // curso recomendado (click o ya hecho)
  // ─── Lado empresa ───────────────────────────────────────────
  | "need_structuring"         // ¿la IA capturó bien la necesidad?
  | "match_useful"             // ¿este candidato es útil? (legacy, ya existe)
  | "profile_click"            // founder clicó "Ver perfil completo"
  | "microtask_proposed"       // founder propuso tarea pagada (interés fuerte)
  | "microtask_outcome"        // rating final de la micro-tarea (ground truth)
  | "ai_preeval_agreement"     // ¿coincides con la pre-eval de la IA?
  | "post_hire_followup"       // ¿la contratación funcionó a 30/60/90 días?
  | "red_flag_accuracy"        // ¿el red flag mostrado era acertado?
  // ─── Bidireccional: empresa ↔ joven (no es sobre la IA) ─────
  // Estos cierran el loop humano que ningún competidor da: el joven
  // recibe feedback CUALITATIVO de empresas reales, y puede responder.
  | "company_feedback_to_youth" // empresa deja comentario + rating sobre la
                                //   candidatura del joven (no microtask outcome).
  | "company_pass_reason"       // empresa abrió el perfil pero NO avanzó:
                                //   le deja al joven la razón corta.
  | "youth_reply_to_company";   // joven responde al feedback recibido
                                //   (gracias / contraargumento / actualización).

export type SignalKind = "explicit" | "implicit";

/** A qué objeto del dominio se refiere la señal. */
export type FeedbackTarget = "profile" | "need" | "match" | "microtask" | "evidence" | "suggestion";

/**
 * Feedback de match: dato propietario que reentrena el ICS (PRD §8.6).
 * matchId = `${needId}__${profileId}` para idempotencia sin secuencias.
 *
 * v3 — extensión para cubrir los 17 touchpoints del producto. Campos
 * VIEJOS (matchId, useful, source, signalType, score, icsAtTime) se
 * mantienen para retrocompatibilidad con entries pre-v3 y con el flow
 * de match-feedback existente. Campos NUEVOS (touchpoint, kind,
 * targetType, targetId, userId, userRole, rating, binary, text,
 * modelVersion) son opcionales pero recomendados para señales nuevas.
 *
 * Calibración del motor: `icsAtTime` permite medir si el modelo acierta
 * cuando predice 90% (¿el founder confirma?). Si predice 40% y rate 5/5,
 * estamos siendo conservadores → bajar peso de penalizaciones.
 */
export interface FeedbackEntry {
  id?: string;
  timestamp: number;

  // ── Campos legacy (match useful sí/no) ───────────────────────
  matchId: string;             // requerido históricamente; en señales nuevas se construye con target
  needId?: string;
  profileId?: string;
  useful: boolean;             // requerido históricamente; en señales no-binarias mapeamos rating ≥ 3 → true
  source?: "empresa_match" | "joven_perfil" | "other";
  note?: string;
  /** Default "explicit_vote" para retrocompatibilidad con entries viejos. */
  signalType?: FeedbackSignal;
  /** Solo para microtask_outcome: 1-5 estrellas del founder. */
  score?: number;
  /** ICS que el motor predijo en el momento de la señal. Para correlación. */
  icsAtTime?: number;

  // ── Campos v3 (touchpoint-aware) ─────────────────────────────
  /** En qué función / pantalla del producto se emitió. */
  touchpoint?: FeedbackTouchpoint;
  /** Explicit (el user lo eligió) vs implicit (capturado del comportamiento). */
  kind?: SignalKind;
  /** Tipo del objeto evaluado. */
  targetType?: FeedbackTarget;
  /** ID del objeto evaluado (ej. profileId, matchId, taskId, evidenceQuoteHash). */
  targetId?: string;
  /** Quién emitió la señal. */
  userId?: string;
  /** Rol del emisor (necesario para weighting distinto por rol). */
  userRole?: UserRole;
  /** 1-5 stars (rating, accuracy). */
  rating?: number;
  /** Sí/no, true/false (útil, acertó, está claro). */
  binary?: boolean;
  /** Comentario libre — sobre todo en señales correctivas ("esto no es mío"). */
  text?: string;
  /** Versión del prompt/modelo activo cuando se emitió. Para A/B futuro. */
  modelVersion?: string;

  // ── v4: feedback bidireccional empresa ↔ joven ───────────────
  /**
   * Para hilos: id del feedback al que esta entry responde. Permite que el
   * joven responda a un `company_feedback_to_youth` y que el dashboard
   * arme la conversación. Solo se llena en `youth_reply_to_company`.
   */
  parentFeedbackId?: string;
  /**
   * Display name del emisor (ej. "Arepas El Primo", "Camila Silva"). El
   * cliente lo lee directo en lugar de hacer un join contra accounts/needs.
   * NO es PII oculta: ya es público en el producto (matches, microtasks).
   */
  authorDisplayName?: string;
  /**
   * Para feedback empresa→joven: razón pre-canónica del descarte cuando
   * el founder eligió una opción del menú en `company_pass_reason`. Permite
   * agregaciones limpias en el dashboard (skill_gap, context_mismatch, etc.)
   * sin parsear el `text` libre.
   */
  reasonCode?:
    | "skill_gap"
    | "context_mismatch"
    | "availability"
    | "salary_range"
    | "other";
}

/**
 * Naturaleza del rol — clasificación que cambia QUÉ se valora más en el ICS.
 *
 *  - cuantitativa: roles donde el VALOR se mide en números (ventas, crecimiento,
 *    leads, conversión). Ejemplos: vendedor, growth, marketing, community manager,
 *    SDR. El motor valora "Resultados medibles" y "Aprendizaje autónomo" alto.
 *
 *  - cualitativa: roles donde el VALOR se mide en consistencia, rigor y cuidado.
 *    Ejemplos: contador de MIPYME, cajero, diseñador gráfico, archivista, asistente
 *    administrativo, operario, conserje, cocinero. Acá pedir "triplé las ventas"
 *    es absurdo — lo que importa es "cuadré caja todos los días sin un faltante".
 *    El motor valora "Confiabilidad", "Sentido del detalle" y "Estabilidad".
 *
 *  - mixta: roles que pueden ir hacia cualquier lado según el contexto.
 *    Ejemplo: atención al cliente (a veces métrica de NPS, a veces solo trato),
 *    asistente de marketing (a veces métricas, a veces solo ejecución pulcra).
 *    Default seguro cuando no se puede clasificar con certeza.
 *
 * El motor de matching adapta los pesos del ICS según esta clasificación —
 * un contador con perfil "callado, detallista, responsable" en una MIPYME
 * NO debería puntuar bajo solo porque no triplicó nada.
 */
export type JobNature = "cuantitativa" | "cualitativa" | "mixta";

/**
 * Pesos del ICS calibrados POR naturaleza del rol.
 *
 *  Cuantitativa: learningSignal y resultsmetric pesan más — un vendedor sin
 *  evidencia de iniciativa autodidacta es señal de alarma.
 *
 *  Cualitativa: behavioralFit pesa MUCHO más — el rasgo "detallista responsable"
 *  vale para un contador más que "aprendí solo a usar X tutorial". learningSignal
 *  baja porque el valor del rol NO está en la iniciativa scrappy sino en
 *  ejecutar con cuidado lo establecido.
 *
 *  Mixta: balance histórico de Salto. Default cuando no hay clasificación.
 */
export const ICS_WEIGHTS_BY_NATURE: Record<JobNature, {
  skillsFit: number;
  behavioralFit: number;
  learningSignal: number;
  contextFit: number;
}> = {
  cuantitativa: {
    skillsFit: 0.30,
    behavioralFit: 0.25,
    learningSignal: 0.25, // peso fuerte: autodidactismo + resultados medibles
    contextFit: 0.20,
  },
  cualitativa: {
    skillsFit: 0.35,
    behavioralFit: 0.40, // peso fuerte: detalle, confiabilidad, consistencia
    learningSignal: 0.10, // peso bajo: no penalizar al callado y rigoroso
    contextFit: 0.15,
  },
  mixta: {
    skillsFit: 0.35,
    behavioralFit: 0.30,
    learningSignal: 0.20,
    contextFit: 0.15,
  },
} as const;

/** Pesos canónicos retro-compatibles. Apuntan a `mixta` — comportamiento de Salto pre-jobNature. */
export const ICS_WEIGHTS = ICS_WEIGHTS_BY_NATURE.mixta;

/** Helper: pesos del ICS para un need dado, con fallback a mixta. */
export function weightsForNeed(need: { jobNature?: JobNature }): typeof ICS_WEIGHTS_BY_NATURE.mixta {
  const nature = need.jobNature ?? "mixta";
  return ICS_WEIGHTS_BY_NATURE[nature];
}
