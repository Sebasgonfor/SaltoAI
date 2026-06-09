/**
 * Clasificación carrera/título ≠ habilidad.
 *
 * Una reclutadora (Merlys) reportó que al subir su CV, "Ingeniería Industrial"
 * —una CARRERA— entró como habilidad en "Lo que sabes hacer". Una carrera, un
 * título o un grado NO son habilidades: son formación. Este módulo detecta esos
 * casos para sacarlos de la lista de skills (van a educación/credenciales).
 *
 * Se usa en dos puntos:
 *   - extracción desde documentos (lib/document-extractor.ts)
 *   - extracción desde la entrevista (app/api/perfil/route.ts)
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Términos que denotan una CARRERA / TÍTULO / GRADO académico (no una skill).
// Match por inclusión: "Ingeniería Industrial" contiene "ingenieria".
const DEGREE_TERMS = [
  "ingenieria",
  "licenciatura",
  "licenciado",
  "licenciada",
  "tecnologo",
  "tecnologa",
  "tecnologia en",
  "tecnico en",
  "bachiller",
  "bachillerato",
  "doctorado",
  "doctor en",
  "doctora en",
  "maestria",
  "magister",
  "master en",
  "diplomado",
  "especializacion",
  "pregrado",
  "posgrado",
  "postgrado",
  "carrera de",
  "administracion de empresas",
  "contaduria",
  "contaduria publica",
];

// Cargos/puestos que a veces se cuelan como "skill" (son roles, no habilidades).
// Match estricto: la etiqueta DEBE empezar por el cargo, para no filtrar skills
// legítimas como "Gestión de clientes".
const JOB_TITLE_PREFIXES = [
  "gerente",
  "coordinador",
  "coordinadora",
  "asistente de",
  "auxiliar de",
  "director de",
  "directora de",
  "jefe de",
  "jefa de",
  "pasante",
  "practicante",
];

/** ¿La etiqueta es el nombre de una carrera/título académico (no una skill)? */
export function isDegreeName(label: string): boolean {
  const n = normalize(label);
  if (!n) return false;
  return DEGREE_TERMS.some((t) => n.includes(t));
}

/** ¿La etiqueta es un cargo/puesto (no una habilidad)? */
export function isJobTitle(label: string): boolean {
  const n = normalize(label);
  if (!n) return false;
  return JOB_TITLE_PREFIXES.some((t) => n === t || n.startsWith(t + " "));
}

/**
 * True si NO debe tratarse como habilidad (carrera, título o cargo puro), y por
 * lo tanto debe excluirse de la lista de skills.
 */
export function isNotASkill(label: string): boolean {
  if (!label || label.trim().length < 2) return true;
  return isDegreeName(label) || isJobTitle(label);
}

/** Filtra una lista de nombres de skills dejando solo habilidades reales. */
export function filterRealSkills(labels: string[]): string[] {
  return labels.filter((l) => !isNotASkill(l));
}
