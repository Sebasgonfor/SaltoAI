export type Role = "agent" | "user";

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
  summary: string;
  skills: string[];
  traits: string[];
  evidence: EvidenceItem[];
  embedding: number[];
  createdAt: number;
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
