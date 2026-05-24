import { parseJovenAge } from "./input-validation";
import type { CompanyLegal, Gender, JovenBasics, Profile } from "./types";

const VALID_GENDERS: Gender[] = ["mujer", "hombre", "otro", "prefiero_no_decir"];

function jovenBasicsKey(uid: string | null | undefined): string {
  return `salto_joven_basics_${uid || "anon"}`;
}

function empresaLegalKey(uid: string | null | undefined): string {
  return `salto_empresa_legal_${uid || "anon"}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function profileToJovenBasics(
  profile: Pick<Profile, "name" | "age" | "gender">
): JovenBasics | null {
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  const age =
    typeof profile.age === "number"
      ? profile.age
      : parseJovenAge(profile.age == null ? "" : String(profile.age));
  const gender = profile.gender;
  if (!name || name.length < 2 || age == null || !gender || !VALID_GENDERS.includes(gender)) {
    return null;
  }
  return { name, age, gender };
}

export function loadSavedJovenBasics(uid: string | null | undefined): JovenBasics | null {
  const parsed = readJson<Partial<JovenBasics>>(jovenBasicsKey(uid));
  if (!parsed || typeof parsed !== "object") return null;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const age =
    typeof parsed.age === "number"
      ? parsed.age
      : parseJovenAge(typeof parsed.age === "string" ? parsed.age : "");
  const gender = parsed.gender;
  if (!name || name.length < 2 || age == null || !gender || !VALID_GENDERS.includes(gender)) {
    return null;
  }
  return { name, age, gender };
}

export function saveJovenBasics(uid: string | null | undefined, basics: JovenBasics): void {
  writeJson(jovenBasicsKey(uid), basics);
}

export function loadSavedEmpresaLegal(uid: string | null | undefined): CompanyLegal | null {
  const parsed = readJson<Partial<CompanyLegal>>(empresaLegalKey(uid));
  if (!parsed || typeof parsed !== "object") return null;
  const companyName = typeof parsed.companyName === "string" ? parsed.companyName.trim() : "";
  const taxId = typeof parsed.taxId === "string" ? parsed.taxId.trim() : "";
  const legalRepName = typeof parsed.legalRepName === "string" ? parsed.legalRepName.trim() : "";
  const legalRepDocId = typeof parsed.legalRepDocId === "string" ? parsed.legalRepDocId.trim() : "";
  if (!companyName || !taxId || !legalRepName || !legalRepDocId || !parsed.acceptedTerms) {
    return null;
  }
  return {
    companyName,
    taxId,
    legalRepName,
    legalRepDocId,
    acceptedTerms: true,
    acceptedAt:
      typeof parsed.acceptedAt === "string" && parsed.acceptedAt
        ? parsed.acceptedAt
        : new Date().toISOString(),
  };
}

export function saveEmpresaLegal(uid: string | null | undefined, legal: CompanyLegal): void {
  writeJson(empresaLegalKey(uid), legal);
}

export async function fetchJovenBasicsFromProfile(
  uid: string
): Promise<JovenBasics | null> {
  try {
    const res = await fetch(`/api/perfil?id=${encodeURIComponent(uid)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: Profile };
    if (!data.profile) return null;
    return profileToJovenBasics(data.profile);
  } catch {
    return null;
  }
}
