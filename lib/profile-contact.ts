import type { ProfileContact } from "./types";

const CV_STYLES = new Set([
  "minimalist",
  "chronological",
  "functional",
  "hybrid",
  "creative",
]);

function trimStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Valida y normaliza contacto desde PATCH /api/perfil. */
export function parseProfileContact(raw: unknown): ProfileContact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const contact: ProfileContact = {};
  const email = trimStr(o.email);
  const phone = trimStr(o.phone);
  const city = trimStr(o.city);
  const linkedin = trimStr(o.linkedin);
  const languages = trimStr(o.languages);
  const tools = trimStr(o.tools);
  const education = trimStr(o.education);
  const certifications = trimStr(o.certifications);
  const headline = trimStr(o.headline);
  const cvStyle = trimStr(o.cvStyle);

  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  if (city) contact.city = city;
  if (linkedin) contact.linkedin = linkedin;
  if (languages) contact.languages = languages;
  if (tools) contact.tools = tools;
  if (education) contact.education = education;
  if (certifications) contact.certifications = certifications;
  if (headline) contact.headline = headline;
  if (cvStyle && CV_STYLES.has(cvStyle)) contact.cvStyle = cvStyle;

  return Object.keys(contact).length > 0 ? contact : null;
}

/** Mezcla contacto del perfil con query params del CV (params tienen prioridad). */
export function mergeCvContact(
  fromProfile?: ProfileContact,
  fromQuery?: Partial<ProfileContact>
): ProfileContact {
  return {
    ...fromProfile,
    ...Object.fromEntries(
      Object.entries(fromQuery ?? {}).filter(([, v]) => typeof v === "string" && v.trim())
    ),
  };
}
