import type { EvidenceItem } from "./types";

export interface FormattedExperience {
  competency: string;
  bullet: string;
}

/** Evidencia demasiado meta o sin hecho concreto — no va al CV. */
const META_EVIDENCE =
  /^(cont[oó]|dij[oó]|mencion[oó]|narr[oó]|habl[oó]|coment[oó]|explic[oó])\s/i;

const FILLER =
  /\b(básicamente|como que|tipo|en plan|o sea|literalmente|pues|bueno)\b/gi;

/** Paráfrasis seguras: mismo hecho, tono más apto para reclutadores. */
const NEUTRAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdel local de su t(?:í|i)a\b/gi, "de un comercio familiar"],
  [/\bnegocio de su t(?:í|i)a\b/gi, "de un comercio familiar"],
  [/\bde su t(?:í|i)a\b/gi, "de un negocio familiar"],
  [/\bdel negocio de su (?:primo|prima|papá|mamá|madre|padre)\b/gi, "de un negocio familiar"],
  [/\ben el negocio de la familia\b/gi, "en un negocio familiar"],
  [/\bdel barrio\b/gi, "local"],
  [/\ba toda hora\b/gi, "en horarios extendidos"],
  [/\btodo el día\b/gi, "jornada completa"],
  [/\bsin que nadie (?:le )?(?:pidiera|le pidiera)\b/gi, "de forma autónoma"],
  [/\bpor su cuenta\b/gi, "de forma autónoma"],
  [/\baprendió sola?\b/gi, "Aprendió de forma autónoma"],
  [/\bmanejó sola?\b/gi, "Gestionó de forma autónoma"],
  [/\barmó sola?\b/gi, "Implementó de forma autónoma"],
  [/\bhizo sola?\b/gi, "Ejecutó de forma autónoma"],
  [/\brespondía mensajes\b/gi, "Gestionó mensajes de clientes"],
  [/\ble hizo la landing\b/gi, "Desarrolló la landing page"],
  [/\bnegocios del barrio\b/gi, "pequeños comercios"],
];

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function stripSkillPrefix(skill: string, quote: string): string {
  const normSkill = skill.replace(/\.$/, "").trim().toLowerCase();
  let q = quote.trim();
  const lower = q.toLowerCase();
  if (lower.startsWith(normSkill)) {
    q = q.slice(normSkill.length).replace(/^[\s.:—–-]+/, "").trim();
  }
  return q;
}

/**
 * Limpia tono coloquial y muletillas sin inventar hechos.
 * Pensado para bullets de "Experiencia y logros" en el CV.
 */
export function polishExperienceQuote(raw: string, skill = ""): string {
  let q = raw.trim();
  if (!q || META_EVIDENCE.test(q)) return "";

  q = q.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of NEUTRAL_REPLACEMENTS) {
    q = q.replace(pattern, replacement);
  }

  if (skill) q = stripSkillPrefix(skill, q);

  // Restos de primera persona al inicio
  q = q.replace(/^(yo |me |mi |nosotros )/i, "");

  q = q.replace(/\s+/g, " ").trim();
  return capitalizeFirst(q);
}

export function isCvReadyEvidence(quote: string): boolean {
  const q = quote.trim();
  if (q.length < 12) return false;
  if (META_EVIDENCE.test(q)) return false;
  return true;
}

export function formatExperienceEntry(skill: string, quote: string): FormattedExperience {
  const competency = skill.replace(/\.$/, "").trim();
  const bullet = polishExperienceQuote(quote, competency);
  return { competency, bullet };
}

/** Normaliza evidencia al guardar perfil o renderizar CV. */
export function sanitizeEvidenceForCv(evidence: EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];

  for (const item of evidence) {
    const skill = item.skill?.trim();
    if (!skill) continue;

    const bullet = polishExperienceQuote(item.quote ?? "", skill);
    if (!isCvReadyEvidence(bullet)) continue;

    const key = `${skill.toLowerCase()}::${bullet.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ skill, quote: bullet });
  }

  // Si el LLM devolvió evidencia meta/informal que el filtro estricto elimina,
  // conservamos una versión suavizada en vez de dejar el perfil sin logros.
  if (out.length === 0 && evidence.length > 0) {
    for (const item of evidence) {
      const skill = item.skill?.trim();
      const raw = item.quote?.trim();
      if (!skill || !raw || raw.length < 12) continue;
      const key = `${skill.toLowerCase()}::${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ skill, quote: capitalizeFirst(raw) });
    }
  }

  return out;
}
