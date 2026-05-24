export type Role = "agent" | "user";

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
}

/**
 * Feedback de match: el dato propietario que reentrena el ICS (PRD §8.6).
 * Mínimo viable: ¿este match le pareció útil al founder? sí/no/timestamp.
 * matchId = `${needId}__${profileId}` para que sea idempotente sin secuencias.
 */
export interface FeedbackEntry {
  id?: string;
  matchId: string;
  needId?: string;
  profileId?: string;
  useful: boolean;
  timestamp: number;
  source?: "empresa_match" | "joven_perfil" | "other";
  note?: string;
}

export const ICS_WEIGHTS = {
  skillsFit: 0.35,
  behavioralFit: 0.3,
  learningSignal: 0.2,
  contextFit: 0.15,
} as const;
