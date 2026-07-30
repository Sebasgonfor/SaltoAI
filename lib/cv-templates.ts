/**
 * 5 plantillas de CV seleccionables por el joven (PRD §6.2.5).
 *
 * Cada formato tiene un trade-off entre **parseabilidad ATS** y
 * **legibilidad humana**. Le pasamos al usuario la decisión con un
 * indicador claro (atsScore 0-5) y una recomendación.
 *
 *   minimalist      — la más parseable. Lo que armamos antes.
 *   chronological   — la convención corporativa: experiencia con fechas.
 *   functional      — agrupa por competencia. Ideal para junior sin chrono.
 *   hybrid          — mezcla resumen de skills + bloques por competencia.
 *   creative        — 2 columnas, color emerald, tipografía grande.
 *                     Riesgo: rompe ATS estrictos. Para roles creativos.
 *
 * Decisiones de diseño compartidas a TODAS las plantillas:
 *  - Fuentes "del sistema" (Arial/Helvetica) — los ATS no descargan webfonts.
 *  - Headings semánticos `<h1>/<h2>/<h3>` — Workday/Greenhouse los detectan
 *    como secciones aun en español.
 *  - Sin `<img>`, sin `<table>` (excepto Creative, advertido), sin text-boxes.
 *  - `@page A4` con márgenes 16/18mm para print.
 *  - `.screen-only` para hints que no se imprimen.
 */
import type { CompanyNeed, Profile } from "./types";
import { formatExperienceEntry } from "./cv-evidence";

// ---------- Tipos públicos ----------

export type CvStyle = "minimalist" | "chronological" | "functional" | "hybrid" | "creative";

export interface CvOptions {
  email?: string;
  phone?: string;
  city?: string;
  linkedin?: string;
  languages?: string;
  /** Herramientas / tecnologías (Power BI, Excel, Figma, ATS…), separadas por coma. */
  tools?: string;
  education?: string;
  certifications?: string;
  headline?: string;
  /** Ocultar secciones opcionales del CV (el joven las desactiva en el customizer). */
  hideTraits?: boolean;
  hideLanguages?: boolean;
  /** Si vino un needId, mostramos un badge tailored y reordenamos skills. */
  needRole?: string;
  /** Inyecta script de window.print() al cargar. */
  autoprint: boolean;
}

export interface CvStyleMeta {
  id: CvStyle;
  label: string;
  /** Tagline corto que va abajo del nombre en el picker. */
  tagline: string;
  /** Descripción de 1-2 frases para el tooltip / leyenda. */
  description: string;
  /** Compatibilidad ATS de 0 a 5 estrellas (heurística + criterio editorial). */
  atsScore: 0 | 1 | 2 | 3 | 4 | 5;
  /** A quién le sirve más este formato. */
  bestFor: string;
}

export const CV_STYLES: CvStyleMeta[] = [
  {
    id: "minimalist",
    label: "ATS minimalista",
    tagline: "Una columna, máximo parseable",
    description:
      "El formato más seguro para portales tipo Computrabajo, Greenhouse, Workday. Una sola columna, sin gráficos, headings estándar. Default seguro.",
    atsScore: 5,
    bestFor: "Postulaciones a empresas grandes o portales con ATS automático.",
  },
  {
    id: "hybrid",
    label: "Híbrido / Combinado",
    tagline: "Skills + logros por competencia",
    description:
      "Lo mejor de los dos mundos: resumen de habilidades arriba, logros agrupados por competencia debajo. Recomendado para Salto: usa la evidencia citada como puntos fuertes.",
    atsScore: 5,
    bestFor: "Recomendado para perfiles junior con evidencia rica.",
  },
  {
    id: "functional",
    label: "Funcional",
    tagline: "Agrupado por competencia, sin fechas",
    description:
      "Tu evidencia laboral se ordena por habilidad, no por timeline. Ideal cuando tu trayectoria es informal y quieres que cada skill brille con sus logros.",
    atsScore: 4,
    bestFor: "Junior sin historial cronológico formal; cambios de carrera.",
  },
  {
    id: "chronological",
    label: "Cronológico",
    tagline: "Experiencia con fechas, formato clásico",
    description:
      "El formato corporativo estándar: experiencia en orden reverso con períodos. Útil si tienes educación/cursos con fechas concretas para mostrar.",
    atsScore: 5,
    bestFor: "Postulaciones a roles corporativos o sectores tradicionales.",
  },
  {
    id: "creative",
    label: "Creativo / Diseño",
    tagline: "Dos columnas, color y tipografía",
    description:
      "Layout visual con sidebar, acentos en color emerald y tipografía grande. Genial para roles de diseño / marketing / contenido. Aviso: NO pasa ciertos ATS estrictos.",
    atsScore: 2,
    bestFor: "Roles creativos donde el portfolio importa más que el ATS.",
  },
];

export function isCvStyle(s: string): s is CvStyle {
  return CV_STYLES.some((m) => m.id === s);
}

// ---------- Caps de contenido (single-page rule) ----------
//
// Un CV ATS de junior debe caber en UNA hoja A4. El Perfil de Evidencia puede
// generar 13+ evidencias y muchas skills — eso empuja el render a 2-3 páginas.
// Capeamos en la capa de plantilla, NO en el matching: el motor sigue viendo
// el perfil completo, solo la versión imprimible se acota.
const MAX_EVIDENCE_FOR_CV = 6;
const MAX_SKILLS_FOR_CV = 10;
const MAX_TRAITS_FOR_CV = 6;
const MAX_QUOTE_CHARS = 180; // si una cita es enorme, se trunca con "…"

function trimQuote(q: string): string {
  const s = q.trim();
  if (s.length <= MAX_QUOTE_CHARS) return s;
  return s.slice(0, MAX_QUOTE_CHARS - 1).replace(/\s+\S*$/, "") + "…";
}

/**
 * Devuelve una versión "imprimible" del perfil: top-N de cada campo, citas
 * truncadas. Se llama una sola vez en cada renderXxx antes de tocar los
 * bloques. NO modifica el objeto original.
 */
function capProfileForCv(p: Profile): Profile {
  return {
    ...p,
    skills: p.skills.slice(0, MAX_SKILLS_FOR_CV),
    traits: p.traits.slice(0, MAX_TRAITS_FOR_CV),
    evidence: p.evidence
      .slice(0, MAX_EVIDENCE_FOR_CV)
      .map((e) => ({ ...e, quote: trimQuote(e.quote) })),
  };
}

// ---------- Helpers comunes ----------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function tailorToNeed(profile: Profile, need: CompanyNeed): Profile {
  const reqNorm = need.requiredSkills.map(normalize);
  const traitNorm = need.desiredTraits.map(normalize);

  const matchesSkill = (s: string) => {
    const n = normalize(s);
    return reqNorm.some((r) => n.includes(r) || r.includes(n));
  };
  const matchesTrait = (t: string) => {
    const n = normalize(t);
    return traitNorm.some((r) => n.includes(r) || r.includes(n));
  };

  return {
    ...profile,
    skills: [
      ...profile.skills.filter(matchesSkill),
      ...profile.skills.filter((s) => !matchesSkill(s)),
    ],
    traits: [
      ...profile.traits.filter(matchesTrait),
      ...profile.traits.filter((t) => !matchesTrait(t)),
    ],
    evidence: [
      ...profile.evidence.filter((e) => matchesSkill(e.skill)),
      ...profile.evidence.filter((e) => !matchesSkill(e.skill)),
    ],
  };
}

export function deriveHeadline(p: Profile, override?: string): string {
  if (override && override.trim()) return override.trim();
  return p.skills.slice(0, 3).join(" · ") || "Candidato/a — primer empleo formal";
}

function buildContactLine(opts: CvOptions): { html: string; hasContact: boolean } {
  const parts: string[] = [];
  if (opts.email) parts.push(escapeHtml(opts.email));
  if (opts.phone) parts.push(escapeHtml(opts.phone));
  if (opts.city) parts.push(escapeHtml(opts.city));
  if (opts.linkedin) parts.push(escapeHtml(opts.linkedin));
  if (parts.length > 0) {
    return { html: `<p class="contact">${parts.join(" · ")}</p>`, hasContact: true };
  }
  // Sin contacto: no renderizamos ni placeholders ([Email], [Teléfono]…) ni
  // banner amarillo de advertencia. El export está gateado upstream por
  // cv-customizer.tsx (validation.ok), así que llegar acá sin contacto solo
  // ocurre en preview interno — y aún así no queremos texto "[…]" basura
  // que se cuele si alguien imprime saltándose el gate (Cmd+P del navegador).
  return {
    html: "",
    hasContact: false,
  };
}

function buildLanguagesList(opts: CvOptions): string[] {
  return (opts.languages?.trim() || "Español (nativo)")
    .split(/[,\n;]/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function tailoredBadge(opts: CvOptions): string {
  return opts.needRole
    ? `<p class="tailored screen-only">CV adaptado para: <strong>${escapeHtml(opts.needRole)}</strong> · skills relevantes ordenadas al inicio.</p>`
    : "";
}

function todayLatamLocale(): string {
  return new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function autoprintScript(opts: CvOptions): string {
  return opts.autoprint
    ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>`
    : "";
}

/**
 * CSS base compartido entre las 4 plantillas ATS-safe (todas menos Creative).
 * Lo que cambia entre estilos es el LAYOUT y el ORDEN de secciones, no la
 * tipografía base.
 */
const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 10.5pt;
    line-height: 1.4;
    color: #1a1a1a;
    background: #f6f6f6;
  }
  main {
    background: white;
    max-width: 780px;
    margin: 32px auto;
    padding: 36px 44px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  }
  h1 {
    font-size: 20pt;
    margin: 0 0 2px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #111;
  }
  .headline {
    font-size: 11pt;
    color: #444;
    margin: 0 0 6px;
    font-weight: 500;
  }
  .contact {
    font-size: 10.5pt;
    color: #333;
    margin: 4px 0 0;
  }
  .contact.placeholder { color: #999; font-style: italic; }
  .contact-hint {
    font-size: 9pt;
    color: #b45309;
    margin: 4px 0 0;
    background: #fef3c7;
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #fde68a;
  }
  section { margin-top: 12px; page-break-inside: avoid; break-inside: avoid; }
  h2 {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 4px;
    padding-bottom: 2px;
    border-bottom: 1px solid #222;
    font-weight: 700;
    color: #111;
  }
  h3 {
    font-size: 10.5pt;
    margin: 6px 0 2px;
    font-weight: 700;
    color: #111;
  }
  .section-note { font-size: 9pt; color: #555; margin: 0 0 4px; font-style: italic; }
  ul { margin: 2px 0 0; padding-left: 18px; }
  li { margin-bottom: 2px; }
  .skills-list, .traits-list, .languages-list {
    columns: 2;
    column-gap: 24px;
    padding-left: 16px;
  }
  .experience-list li { margin-bottom: 6px; line-height: 1.45; }
  .experience-list .exp-competency { display: block; font-weight: 600; color: #111; font-size: 0.92em; margin-bottom: 1px; }
  .experience-list .exp-bullet { display: block; color: #333; }
  .experience-list li strong { color: #111; }
  .entry { margin-bottom: 6px; }
  .entry .meta { font-size: 9pt; color: #555; margin: 0 0 2px; }
  .entry .role { font-weight: 700; font-size: 10.5pt; margin: 0 0 2px; }
  p.freeform { margin: 0; }
  .tailored {
    margin: 4px 0 8px;
    font-size: 9pt;
    color: #065f46;
    background: #d1fae5;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #6ee7b7;
  }
  .doc-footer {
    margin-top: 16px;
    padding-top: 6px;
    border-top: 1px solid #ddd;
    font-size: 8pt;
    color: #666;
    line-height: 1.35;
  }
  /* Single-page rule. Márgenes apretados (12/14mm) + body 10pt + secciones
     compactas → cabe en A4 si el render respeta los caps de contenido. */
  @page { size: A4; margin: 12mm 14mm; }
  @media print {
    body { background: white; font-size: 10pt; line-height: 1.35; }
    main { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .screen-only { display: none !important; }
    .skills-list, .traits-list, .languages-list { columns: 2; column-gap: 18px; }
    a { color: inherit; text-decoration: none; }
    h1 { font-size: 17pt; }
    h2 { font-size: 9.5pt; margin-bottom: 3px; }
    h3 { font-size: 10pt; }
    section { margin-top: 9px; }
    /* El footer institucional ocupa una línea — lo escondemos en print para
       no provocar overflow a una segunda hoja por una sola línea. */
    .doc-footer { display: none; }
    .tailored { display: none; }
  }
`;

// ---------- Bloques reutilizables (devuelven strings HTML) ----------

function summaryBlock(p: Profile): string {
  return p.summary
    ? `<section><h2>Perfil profesional</h2><p>${escapeHtml(p.summary)}</p></section>`
    : "";
}

function skillsBlock(p: Profile, heading = "Competencias clave"): string {
  if (p.skills.length === 0) return "";
  const items = p.skills.map((s) => `    <li>${escapeHtml(s)}</li>`).join("\n");
  return `<section>
  <h2>${heading}</h2>
  <ul class="skills-list">
${items}
  </ul>
</section>`;
}

function traitsBlock(p: Profile, opts: CvOptions): string {
  if (opts.hideTraits || p.traits.length === 0) return "";
  const items = p.traits.map((t) => `    <li>${escapeHtml(t)}</li>`).join("\n");
  return `<section>
  <h2>Rasgos profesionales</h2>
  <ul class="traits-list">
${items}
  </ul>
</section>`;
}

function evidenceListBlock(p: Profile, heading = "Experiencia y logros"): string {
  if (p.evidence.length === 0) return "";
  const items = p.evidence
    .map((e) => {
      const { competency, bullet } = formatExperienceEntry(e.skill, e.quote);
      if (!bullet) return "";
      return `    <li>
      <span class="exp-competency">${escapeHtml(competency)}</span>
      <span class="exp-bullet">${escapeHtml(bullet)}</span>
    </li>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!items) return "";
  return `<section>
  <h2>${heading}</h2>
  <p class="section-note">Experiencia práctica y proyectos autónomos.</p>
  <ul class="experience-list">
${items}
  </ul>
</section>`;
}

/**
 * Logros agrupados por habilidad. Cada `<h3>` es una skill, los bullets son
 * sus quotes. Si una skill no tiene evidencia citada, no aparece (no inventamos).
 */
function evidenceByCompetencyBlock(p: Profile): string {
  if (p.evidence.length === 0) return "";
  // Agrupamos por skill conservando el orden de p.skills (después de tailor)
  const grouped = new Map<string, string[]>();
  for (const e of p.evidence) {
    if (!grouped.has(e.skill)) grouped.set(e.skill, []);
    grouped.get(e.skill)!.push(e.quote);
  }
  const order = p.skills.filter((s) => grouped.has(s));
  // Edge case: si la evidencia tiene skills que no están en p.skills, las
  // agregamos al final para no perderlas.
  for (const key of grouped.keys()) if (!order.includes(key)) order.push(key);

  const blocks = order
    .map((skill) => {
      const quotes = grouped.get(skill)!;
      const items = quotes
        .map((q) => {
          const { bullet } = formatExperienceEntry(skill, q);
          return bullet ? `    <li>${escapeHtml(bullet)}</li>` : "";
        })
        .filter(Boolean)
        .join("\n");
      if (!items) return "";
      return `  <div class="entry">
    <h3>${escapeHtml(skill)}</h3>
    <ul>
${items}
    </ul>
  </div>`;
    })
    .filter(Boolean)
    .join("\n");

  if (!blocks) return "";

  return `<section>
  <h2>Logros por competencia</h2>
  <p class="section-note">Resultados concretos agrupados por competencia.</p>
${blocks}
</section>`;
}

function educationBlock(opts: CvOptions): string {
  if (!opts.education?.trim()) return "";
  return `<section>
  <h2>Educación</h2>
  <p class="freeform">${escapeHtml(opts.education).replace(/\n/g, "<br />")}</p>
</section>`;
}

function workHistoryBlock(p: Profile): string {
  const entries = (p.workHistory ?? []).filter((w) => w && w.role?.trim());
  if (entries.length === 0) return "";
  const items = entries
    .map((w) => {
      const heading = [escapeHtml(w.role.trim()), w.organization?.trim() ? escapeHtml(w.organization.trim()) : ""]
        .filter(Boolean)
        .join(" — ");
      const period = w.period?.trim() ? `<span class="wh-period"> · ${escapeHtml(w.period.trim())}</span>` : "";
      const desc = w.description?.trim() ? `<br />${escapeHtml(w.description.trim())}` : "";
      return `    <p><strong>${heading}</strong>${period}${desc}</p>`;
    })
    .join("\n");
  return `<section>
  <h2>Experiencia laboral</h2>
${items}
</section>`;
}

function toolsBlock(opts: CvOptions): string {
  if (!opts.tools?.trim()) return "";
  const items = opts.tools
    .split(/[,\n;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `    <li>${escapeHtml(t)}</li>`)
    .join("\n");
  if (!items) return "";
  return `<section>
  <h2>Herramientas y tecnologías</h2>
  <ul class="skills-list">
${items}
  </ul>
</section>`;
}

function certificationsBlock(opts: CvOptions): string {
  if (!opts.certifications?.trim()) return "";
  return `<section>
  <h2>Certificaciones y cursos</h2>
  <p class="freeform">${escapeHtml(opts.certifications).replace(/\n/g, "<br />")}</p>
</section>`;
}

function languagesBlock(opts: CvOptions): string {
  if (opts.hideLanguages) return "";
  const langs = buildLanguagesList(opts);
  const items = langs.map((l) => `    <li>${escapeHtml(l)}</li>`).join("\n");
  return `<section>
  <h2>Idiomas</h2>
  <ul class="languages-list">
${items}
  </ul>
</section>`;
}

function docFooter(): string {
  // El CV no debe revelar la herramienta con la que se generó: se lee como un
  // CV profesional normal. Footer neutro con solo la fecha de actualización.
  return `<p class="doc-footer">Actualizado: ${todayLatamLocale()}.</p>`;
}

function htmlShell(args: {
  name: string;
  styleId: CvStyle;
  bodyClass?: string;
  customCss?: string;
  inner: string;
  autoprint: boolean;
  profileIdMeta?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>CV — ${args.name}</title>
<meta name="generator" content="Curriculum Vitae" />
<meta name="cv-style" content="${args.styleId}" />
<meta name="profile-id" content="${escapeHtml(args.profileIdMeta || "")}" />
<style>
${BASE_CSS}
${args.customCss ?? ""}
</style>
</head>
<body${args.bodyClass ? ` class="${args.bodyClass}"` : ""}>
${args.inner}
${autoprintScript({ autoprint: args.autoprint } as CvOptions)}
</body>
</html>`;
}

function header(p: Profile, opts: CvOptions): string {
  const { html: contactHtml } = buildContactLine(opts);
  return `  <header>
    <h1>${escapeHtml(p.name || "Candidato/a")}</h1>
    <p class="headline">${escapeHtml(deriveHeadline(p, opts.headline))}</p>
    ${contactHtml}
  </header>`;
}

// ---------- 1. Minimalist (ATS-friendly, default) ----------

function renderMinimalist(p: Profile, opts: CvOptions): string {
  const inner = `<main>
${header(p, opts)}
  ${tailoredBadge(opts)}
  ${summaryBlock(p)}
  ${skillsBlock(p)}
  ${evidenceListBlock(p)}
  ${traitsBlock(p, opts)}
  ${workHistoryBlock(p)}
  ${toolsBlock(opts)}
  ${educationBlock(opts)}
  ${certificationsBlock(opts)}
  ${languagesBlock(opts)}
  ${docFooter()}
</main>`;
  return htmlShell({
    name: p.name,
    styleId: "minimalist",
    inner,
    autoprint: opts.autoprint,
    profileIdMeta: p.id,
  });
}

// ---------- 2. Chronological (clásico corporativo) ----------

function renderChronological(p: Profile, opts: CvOptions): string {
  // En chrono "real" iría por años. Sin fechas formales, el bloque de
  // experiencia se muestra como "Trayectoria reciente" con cada evidencia
  // como entrada. Educación lista textual de opts (donde sí hay fechas).
  const evidenceEntries =
    p.evidence.length > 0
      ? `<section>
  <h2>Experiencia y trayectoria</h2>
  <p class="section-note">Experiencia práctica y proyectos autónomos — orden por relevancia.</p>
${p.evidence
  .map((e) => {
    const { competency, bullet } = formatExperienceEntry(e.skill, e.quote);
    if (!bullet) return "";
    return `  <div class="entry">
    <p class="meta">Proyecto autónomo · ${escapeHtml(competency)}</p>
    <p>${escapeHtml(bullet)}</p>
  </div>`;
  })
  .filter(Boolean)
  .join("\n")}
</section>`
      : "";

  const inner = `<main>
${header(p, opts)}
  ${tailoredBadge(opts)}
  ${summaryBlock(p)}
  ${evidenceEntries}
  ${workHistoryBlock(p)}
  ${toolsBlock(opts)}
  ${educationBlock(opts)}
  ${certificationsBlock(opts)}
  ${skillsBlock(p, "Habilidades")}
  ${traitsBlock(p, opts)}
  ${languagesBlock(opts)}
  ${docFooter()}
</main>`;
  return htmlShell({
    name: p.name,
    styleId: "chronological",
    inner,
    autoprint: opts.autoprint,
    profileIdMeta: p.id,
  });
}

// ---------- 3. Functional (por competencia) ----------

function renderFunctional(p: Profile, opts: CvOptions): string {
  const inner = `<main>
${header(p, opts)}
  ${tailoredBadge(opts)}
  ${summaryBlock(p)}
  ${evidenceByCompetencyBlock(p)}
  ${traitsBlock(p, opts)}
  ${workHistoryBlock(p)}
  ${toolsBlock(opts)}
  ${educationBlock(opts)}
  ${certificationsBlock(opts)}
  ${languagesBlock(opts)}
  ${docFooter()}
</main>`;
  return htmlShell({
    name: p.name,
    styleId: "functional",
    inner,
    autoprint: opts.autoprint,
    profileIdMeta: p.id,
  });
}

// ---------- 4. Hybrid (lo recomendado) ----------

function renderHybrid(p: Profile, opts: CvOptions): string {
  const inner = `<main>
${header(p, opts)}
  ${tailoredBadge(opts)}
  ${summaryBlock(p)}
  ${skillsBlock(p, "Competencias destacadas")}
  ${evidenceByCompetencyBlock(p)}
  ${traitsBlock(p, opts)}
  ${workHistoryBlock(p)}
  ${toolsBlock(opts)}
  ${educationBlock(opts)}
  ${certificationsBlock(opts)}
  ${languagesBlock(opts)}
  ${docFooter()}
</main>`;
  return htmlShell({
    name: p.name,
    styleId: "hybrid",
    inner,
    autoprint: opts.autoprint,
    profileIdMeta: p.id,
  });
}

// ---------- 5. Creative / Diseño ----------

/**
 * Layout 2 columnas con sidebar emerald. Está **explícitamente NO recomendado**
 * para portales ATS estrictos. El propio documento incluye un aviso visible
 * solo en pantalla (no en print) para que el joven sepa el trade-off.
 *
 * Para minimizar el daño ATS, ordenamos el DOM de forma que el bloque MAIN
 * vaya ANTES del SIDEBAR — los parsers leen el orden del HTML, no el visual.
 * Así, aunque parezca 2 columnas, el contenido fluye en el orden correcto
 * para los ATS que sí lo intentan.
 */
function renderCreative(p: Profile, opts: CvOptions): string {
  const { html: contactHtml } = buildContactLine(opts);
  const langs = buildLanguagesList(opts);

  const css = `
    body { background: #f0fdf4; }
    main.creative {
      background: white;
      max-width: 880px;
      margin: 28px auto;
      padding: 0;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 0;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 6px 30px rgba(5, 95, 70, 0.08);
    }
    aside.creative-side {
      background: linear-gradient(180deg, #064e3b 0%, #065f46 100%);
      color: white;
      padding: 36px 28px;
    }
    aside.creative-side h2 {
      color: #d1fae5;
      border-bottom-color: #10b981;
      margin-top: 22px;
    }
    aside.creative-side h2:first-of-type { margin-top: 0; }
    aside.creative-side ul, aside.creative-side p { color: #ecfdf5; }
    aside.creative-side .skills-list,
    aside.creative-side .traits-list,
    aside.creative-side .languages-list { columns: 1; padding-left: 18px; }
    .avatar {
      width: 96px;
      height: 96px;
      border-radius: 24px;
      background: white;
      color: #065f46;
      font-size: 38pt;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
      letter-spacing: -0.02em;
    }
    aside.creative-side .contact { color: #ecfdf5; font-size: 10pt; word-break: break-word; }
    aside.creative-side .contact.placeholder { color: #6ee7b7; }
    .creative-main { padding: 40px 36px; }
    .creative-main h1 {
      font-size: 26pt;
      color: #064e3b;
      letter-spacing: -0.02em;
    }
    .creative-main .headline {
      color: #065f46;
      font-weight: 600;
      font-size: 12pt;
    }
    .creative-main h2 {
      color: #064e3b;
      border-bottom-color: #10b981;
    }
    .creative-main h3 { color: #065f46; }
    .creative-warning {
      background: #fef3c7;
      border: 1px solid #fde68a;
      color: #78350f;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 9.5pt;
      margin: 10px 0;
      line-height: 1.4;
    }
    @media print {
      body { background: white; }
      main.creative {
        max-width: none;
        margin: 0;
        border-radius: 0;
        box-shadow: none;
        grid-template-columns: 240px 1fr;
      }
      aside.creative-side { background: #065f46 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .creative-warning, .screen-only { display: none !important; }
    }
  `;

  // El <main> va PRIMERO en el orden del DOM para que ATS lean el contenido
  // central antes del sidebar. CSS Grid sigue muestrandolos lado a lado.
  const inner = `<main class="creative">
  <section class="creative-main" style="grid-column: 2;">
    <header>
      <h1>${escapeHtml(p.name || "Candidato/a")}</h1>
      <p class="headline">${escapeHtml(deriveHeadline(p, opts.headline))}</p>
    </header>
    ${tailoredBadge(opts)}
    ${summaryBlock(p)}
    ${evidenceByCompetencyBlock(p)}
    ${workHistoryBlock(p)}
  ${toolsBlock(opts)}
  ${educationBlock(opts)}
    ${certificationsBlock(opts)}
    ${docFooter()}
  </section>
  <aside class="creative-side" style="grid-column: 1; grid-row: 1;">
    <h2>Contacto</h2>
    ${contactHtml}
    ${
      p.skills.length > 0
        ? `<h2>Habilidades</h2><ul class="skills-list">${p.skills
            .map((s) => `<li>${escapeHtml(s)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${
      p.traits.length > 0
        ? `<h2>Rasgos</h2><ul class="traits-list">${p.traits
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join("")}</ul>`
        : ""
    }
    <h2>Idiomas</h2>
    <ul class="languages-list">${langs.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
  </aside>
</main>`;

  return htmlShell({
    name: p.name,
    styleId: "creative",
    customCss: css,
    inner,
    autoprint: opts.autoprint,
    profileIdMeta: p.id,
  });
}

// ---------- Dispatcher ----------

export function renderCv(profile: Profile, style: CvStyle, opts: CvOptions): string {
  // Capeamos el perfil ANTES de pasarlo a la plantilla. Esto garantiza una
  // sola hoja A4 sin necesidad de tocar cada renderer ni meter lógica de
  // truncate en los bloques. El perfil completo sigue vivo en el motor de
  // matching; lo que se acota es solo la versión imprimible.
  const p = capProfileForCv(profile);
  switch (style) {
    case "chronological":
      return renderChronological(p, opts);
    case "functional":
      return renderFunctional(p, opts);
    case "hybrid":
      return renderHybrid(p, opts);
    case "creative":
      return renderCreative(p, opts);
    case "minimalist":
    default:
      return renderMinimalist(p, opts);
  }
}

/**
 * Versión plain-text, alineada al estilo elegido. Para campos "Pega tu CV"
 * de ATS legacy (Computrabajo / OCC / Bumeran). El estilo afecta el ORDEN
 * de las secciones, no el rendering en sí (todo es texto).
 */
export function renderPlainText(rawProfile: Profile, style: CvStyle, opts: CvOptions): string {
  // Mismo cap que el HTML — para que la versión "Texto plano" que pega en
  // ATS legacy también respete el límite single-page (~50 líneas).
  const profile = capProfileForCv(rawProfile);
  const lines: string[] = [];
  lines.push(profile.name);
  lines.push(deriveHeadline(profile, opts.headline));
  const contact = [opts.email, opts.phone, opts.city, opts.linkedin].filter(Boolean);
  if (contact.length > 0) lines.push(contact.join(" · "));
  lines.push("");

  const pushSummary = () => {
    if (profile.summary) {
      lines.push("PERFIL PROFESIONAL");
      lines.push(profile.summary);
      lines.push("");
    }
  };
  const pushSkills = (heading = "COMPETENCIAS CLAVE") => {
    if (profile.skills.length > 0) {
      lines.push(heading);
      profile.skills.forEach((s) => lines.push(`- ${s}`));
      lines.push("");
    }
  };
  const pushEvidenceFlat = () => {
    if (profile.evidence.length > 0) {
      lines.push("EXPERIENCIA Y LOGROS");
      profile.evidence.forEach((e) => {
        const { competency, bullet } = formatExperienceEntry(e.skill, e.quote);
        if (bullet) lines.push(`- ${competency}: ${bullet}`);
      });
      lines.push("");
    }
  };
  const pushEvidenceGrouped = () => {
    if (profile.evidence.length === 0) return;
    lines.push("LOGROS POR COMPETENCIA");
    const grouped = new Map<string, string[]>();
    for (const e of profile.evidence) {
      if (!grouped.has(e.skill)) grouped.set(e.skill, []);
      grouped.get(e.skill)!.push(e.quote);
    }
    for (const [skill, quotes] of grouped) {
      lines.push(`-- ${skill}`);
      quotes.forEach((q) => {
        const { bullet } = formatExperienceEntry(skill, q);
        if (bullet) lines.push(`   • ${bullet}`);
      });
    }
    lines.push("");
  };
  const pushTraits = () => {
    if (!opts.hideTraits && profile.traits.length > 0) {
      lines.push("RASGOS PROFESIONALES");
      profile.traits.forEach((t) => lines.push(`- ${t}`));
      lines.push("");
    }
  };
  const pushWorkHistory = () => {
    const entries = (profile.workHistory ?? []).filter((w) => w && w.role?.trim());
    if (entries.length === 0) return;
    lines.push("EXPERIENCIA LABORAL");
    entries.forEach((w) => {
      const heading = [w.role.trim(), w.organization?.trim(), w.period?.trim()]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- ${heading}`);
      if (w.description?.trim()) lines.push(`   ${w.description.trim()}`);
    });
    lines.push("");
  };
  const pushTools = () => {
    const items = (opts.tools ?? "")
      .split(/[,\n;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (items.length > 0) {
      lines.push("HERRAMIENTAS Y TECNOLOGÍAS");
      items.forEach((t) => lines.push(`- ${t}`));
      lines.push("");
    }
  };
  const pushEducation = () => {
    if (opts.education?.trim()) {
      lines.push("EDUCACIÓN");
      lines.push(opts.education.trim());
      lines.push("");
    }
  };
  const pushCerts = () => {
    if (opts.certifications?.trim()) {
      lines.push("CERTIFICACIONES Y CURSOS");
      lines.push(opts.certifications.trim());
      lines.push("");
    }
  };
  const pushLanguages = () => {
    if (opts.hideLanguages) return;
    lines.push("IDIOMAS");
    buildLanguagesList(opts).forEach((l) => lines.push(`- ${l}`));
  };

  switch (style) {
    case "chronological":
      pushSummary();
      pushEvidenceFlat();
      pushWorkHistory();
      pushTools();
      pushEducation();
      pushCerts();
      pushSkills("HABILIDADES");
      pushTraits();
      pushLanguages();
      break;
    case "functional":
      pushSummary();
      pushEvidenceGrouped();
      pushTraits();
      pushWorkHistory();
      pushTools();
      pushEducation();
      pushCerts();
      pushLanguages();
      break;
    case "hybrid":
      pushSummary();
      pushSkills("COMPETENCIAS DESTACADAS");
      pushEvidenceGrouped();
      pushTraits();
      pushWorkHistory();
      pushTools();
      pushEducation();
      pushCerts();
      pushLanguages();
      break;
    case "creative":
    case "minimalist":
    default:
      pushSummary();
      pushSkills();
      pushEvidenceFlat();
      pushTraits();
      pushWorkHistory();
      pushTools();
      pushEducation();
      pushCerts();
      pushLanguages();
      break;
  }

  return lines.join("\n").trim();
}
