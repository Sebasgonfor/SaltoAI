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

/**
 * Términos que indican que una etiqueta describe una COMPETENCIA (skill) aunque
 * empiece con un prefijo de cargo. Ej: "Asistente de marketing digital" empieza
 * con "asistente de" pero contiene "marketing" y "digital" → es una skill, no
 * un cargo puro.
 */
const COMPETENCY_TERMS = [
  "gestion",
  "manejo",
  "atencion",
  "ventas",
  "diseño",
  "diseno",
  "desarrollo",
  "contenido",
  "marketing",
  "campañas",
  "campanas",
  "clientes",
  "logistica",
  "operaciones",
  "redes",
  "sociales",
  "digital",
  "web",
  "datos",
  "proyectos",
  "estrategia",
  "comunicacion",
  "publicidad",
  "cobranza",
  "inventario",
  "produccion",
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
  for (const prefix of JOB_TITLE_PREFIXES) {
    if (n === prefix || n.startsWith(prefix + " ")) {
      // Si el resto de la etiqueta contiene términos de competencia,
      // es una skill descrita como función, no un cargo puro.
      const remainder = n.slice(prefix.length).trim();
      if (remainder && COMPETENCY_TERMS.some((ct) => remainder.split(/\s+/).some((w) => w === ct))) {
        continue; // Skill con prefijo de cargo → permitir
      }
      return true;
    }
  }
  return false;
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
