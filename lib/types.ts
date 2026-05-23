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
}

export interface OpportunityMatch {
  needId: string;
  companyName: string;
  role: string;
  ics: number;
  reason: string;
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
}

export const ICS_WEIGHTS = {
  skillsFit: 0.35,
  behavioralFit: 0.3,
  learningSignal: 0.2,
  contextFit: 0.15,
} as const;
