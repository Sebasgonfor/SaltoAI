import { NextRequest, NextResponse } from "next/server";
import { getNeed, getProfile } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, Profile } from "@/lib/types";

export const runtime = "nodejs";

/**
 * CV ATS one-click (PRD §6.2.5) — versión "recruiter-grade".
 *
 * Reglas de oro que seguimos (intersección de las guías de Lever, Greenhouse,
 * Workday, Jobscan, Harvard CS y Indeed para parseo ATS junior 2024-2026):
 *
 *  1. UNA columna, semántico (h1/h2/p/ul/li). Nada de tablas, columnas CSS,
 *     text-boxes ni imágenes — los parsers leen el DOM linealmente.
 *  2. Fuentes "del sistema" Arial/Helvetica (los ATS no descargan webfonts).
 *  3. Headings de sección estándar y en español: PERFIL PROFESIONAL,
 *     COMPETENCIAS CLAVE, EXPERIENCIA Y LOGROS, EDUCACIÓN, IDIOMAS,
 *     CERTIFICACIONES, INFORMACIÓN DE CONTACTO.
 *  4. Bullets en EXPERIENCIA empiezan con verbo de acción + cuantificación
 *     cuando exista (la evidencia citada del perfil ya viene en ese formato).
 *  5. Contacto en texto plano separado por "·" (todos los ATS lo parsean
 *     como email/phone/url sin necesidad de iconos).
 *  6. Tamaños A4/Letter con márgenes 18mm; máx 1 página para junior.
 *  7. Sin headers/footers reales en print (`@page { margin: ... }`) — algunos
 *     ATS los descartan; nuestra "firma Salto" va dentro del body como
 *     párrafo pequeño al final.
 *
 * Query params soportados:
 *   profileId (required)  · id del perfil
 *   email, phone, city, linkedin · datos de contacto (opcionales)
 *   languages             · default "Español (nativo)"
 *   education             · texto libre, opcional
 *   certifications        · texto libre, opcional
 *   headline              · subtítulo bajo el nombre, default = top skills
 *   needId                · si presente, ordena skills/evidencia poniendo
 *                           PRIMERO las que matchean la necesidad → CV
 *                           tailoreado con keyword density alta.
 *   format=html|json      · html por defecto
 *   autoprint=1           · dispara window.print() al cargar
 *   download=1            · Content-Disposition attachment
 */
function escapeHtml(s: string): string {
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

/**
 * Devuelve el perfil con `skills` y `evidence` re-ordenados de forma que las
 * coincidencias con `need.requiredSkills` queden primero. Mantiene el orden
 * relativo de los no-coincidentes.
 *
 * Esto es la jugada de "CV tailoreado" que recomiendan los ATS: arrancar
 * con los keywords del job description sube el match score interno.
 */
function tailorToNeed(profile: Profile, need: CompanyNeed): Profile {
  const reqNorm = need.requiredSkills.map(normalize);
  const traitNorm = need.desiredTraits.map(normalize);

  const matchesSkill = (s: string) => {
    const n = normalize(s);
    return reqNorm.some((r) => n.includes(r) || r.includes(n));
  };

  const skills = [
    ...profile.skills.filter((s) => matchesSkill(s)),
    ...profile.skills.filter((s) => !matchesSkill(s)),
  ];

  const traits = [
    ...profile.traits.filter((t) => {
      const n = normalize(t);
      return traitNorm.some((r) => n.includes(r) || r.includes(n));
    }),
    ...profile.traits.filter((t) => {
      const n = normalize(t);
      return !traitNorm.some((r) => n.includes(r) || r.includes(n));
    }),
  ];

  const evidence = [
    ...profile.evidence.filter((e) => matchesSkill(e.skill)),
    ...profile.evidence.filter((e) => !matchesSkill(e.skill)),
  ];

  return { ...profile, skills, traits, evidence };
}

function deriveHeadline(p: Profile, override?: string): string {
  if (override && override.trim()) return override.trim();
  // Tomamos las top-3 skills como subtítulo profesional (es la convención
  // junior 2024-2026, sustituye el "objetivo profesional" anticuado).
  return p.skills.slice(0, 3).join(" · ") || "Candidato/a — primer empleo formal";
}

interface CvOptions {
  email?: string;
  phone?: string;
  city?: string;
  linkedin?: string;
  languages?: string;
  education?: string;
  certifications?: string;
  headline?: string;
  needRole?: string;
  autoprint: boolean;
}

function renderAtsHtml(p: Profile, opts: CvOptions): string {
  const name = escapeHtml(p.name || "Candidato/a Salto");
  const headline = escapeHtml(deriveHeadline(p, opts.headline));
  const summary = escapeHtml(p.summary || "");

  // ---- Contact line (texto plano separado por · — ATS-friendly) ----
  // Si no hay nada, mostramos placeholders entre corchetes con una nota
  // que SOLO aparece en pantalla, no en print, para que el joven los
  // edite antes de imprimir.
  const contactParts: string[] = [];
  if (opts.email) contactParts.push(escapeHtml(opts.email));
  if (opts.phone) contactParts.push(escapeHtml(opts.phone));
  if (opts.city) contactParts.push(escapeHtml(opts.city));
  if (opts.linkedin) contactParts.push(escapeHtml(opts.linkedin));

  const contactHtml =
    contactParts.length > 0
      ? `<p class="contact">${contactParts.join(" · ")}</p>`
      : `<p class="contact placeholder">[Email] · [Teléfono] · [Ciudad] · [LinkedIn]</p>
         <p class="screen-only contact-hint">Completá tus datos de contacto antes de enviar este CV. Volvé al perfil para pasarlos como parámetros, o editá el documento luego de imprimirlo a PDF.</p>`;

  // ---- EXPERIENCIA Y LOGROS ----
  // Cada evidencia del Perfil de Evidencia se vuelve un bullet con la
  // habilidad como mini-encabezado en negrita + el quote como descripción.
  // El quote suele venir como statement en pasado, action-verb-first
  // ("Triplicó las ventas..."), que es exactamente el formato ATS-óptimo.
  // Si la evidencia está vacía caemos a un párrafo honesto que apunta al
  // Perfil de Evidencia en lugar de inventar experiencia laboral.
  const experienceHtml =
    p.evidence.length > 0
      ? `<section>
  <h2>Experiencia y logros</h2>
  <p class="section-note">Trayectoria informal y proyectos personales · evidencia verificada por Salto IA.</p>
  <ul class="experience-list">
${p.evidence
  .map(
    (e) => `    <li>
      <strong>${escapeHtml(e.skill)}.</strong> ${escapeHtml(e.quote)}
    </li>`
  )
  .join("\n")}
  </ul>
</section>`
      : "";

  // ---- COMPETENCIAS ----
  // Bulleted, no comma-separated — los ATS modernos extraen mejor desde <li>.
  const skillsHtml =
    p.skills.length > 0
      ? `<section>
  <h2>Competencias clave</h2>
  <ul class="skills-list">
${p.skills.map((s) => `    <li>${escapeHtml(s)}</li>`).join("\n")}
  </ul>
</section>`
      : "";

  const traitsHtml =
    p.traits.length > 0
      ? `<section>
  <h2>Rasgos profesionales</h2>
  <ul class="traits-list">
${p.traits.map((t) => `    <li>${escapeHtml(t)}</li>`).join("\n")}
  </ul>
</section>`
      : "";

  // ---- IDIOMAS ----
  // Default explícito porque "ningún idioma" rompe el parser de ciertos ATS.
  const languages = opts.languages?.trim() || "Español (nativo)";
  const languagesHtml = `<section>
  <h2>Idiomas</h2>
  <ul class="languages-list">
${languages
  .split(/[,\n;]/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => `    <li>${escapeHtml(l)}</li>`)
  .join("\n")}
  </ul>
</section>`;

  // ---- EDUCACIÓN (opcional) ----
  const educationHtml = opts.education?.trim()
    ? `<section>
  <h2>Educación</h2>
  <p class="freeform">${escapeHtml(opts.education).replace(/\n/g, "<br />")}</p>
</section>`
    : "";

  // ---- CERTIFICACIONES (opcional) ----
  const certificationsHtml = opts.certifications?.trim()
    ? `<section>
  <h2>Certificaciones y cursos</h2>
  <p class="freeform">${escapeHtml(opts.certifications).replace(/\n/g, "<br />")}</p>
</section>`
    : "";

  // ---- Tailoring badge (solo si vino needId) ----
  const tailoredBadge = opts.needRole
    ? `<p class="tailored screen-only">CV adaptado para: <strong>${escapeHtml(opts.needRole)}</strong> · skills relevantes ordenadas al inicio.</p>`
    : "";

  // ---- Generación: fecha en formato común LATAM ----
  const today = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const autoprintScript = opts.autoprint
    ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>`
    : "";

  // ---- Documento ----
  // Estructura semántica plana en `<main>`. Cada `<section>` con un `<h2>`
  // que el parser ATS reconoce como heading estándar (Workday/Greenhouse
  // identifican EXPERIENCE, SKILLS, EDUCATION en cualquier idioma).
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>CV — ${name}</title>
<meta name="generator" content="Salto · Perfil de Evidencia" />
<meta name="profile-id" content="${escapeHtml(p.id || "")}" />
<meta name="description" content="${escapeHtml(summary.slice(0, 160))}" />
<style>
  /* ----- Reset minimal ----- */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }

  /* ----- Base typography (Arial = el más ATS-friendly) ----- */
  body {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 11pt;
    line-height: 1.45;
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

  /* ----- Header ----- */
  h1 {
    font-size: 22pt;
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

  /* ----- Sections ----- */
  section {
    margin-top: 18px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  h2 {
    font-size: 10.5pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #222;
    font-weight: 700;
    color: #111;
  }
  h2::before {
    /* algunos ATS leen este selector como heading explícito */
    content: "";
  }
  .section-note {
    font-size: 9.5pt;
    color: #555;
    margin: 0 0 6px;
    font-style: italic;
  }

  /* ----- Lists ----- */
  ul {
    margin: 4px 0 0;
    padding-left: 20px;
  }
  li { margin-bottom: 4px; }
  .skills-list, .traits-list, .languages-list {
    /* Lista en 2 columnas visuales SOLO en pantalla, no en print:
       el parser ATS sigue viendo <li> uno tras otro. */
    columns: 2;
    column-gap: 28px;
    padding-left: 18px;
  }
  .experience-list li { margin-bottom: 8px; }
  .experience-list li strong { color: #111; }

  /* ----- Freeform paragraphs ----- */
  p.freeform { margin: 0; }

  /* ----- Tailored badge ----- */
  .tailored {
    margin: 6px 0 12px;
    font-size: 9.5pt;
    color: #065f46;
    background: #d1fae5;
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #6ee7b7;
  }

  /* ----- Footer ----- */
  .doc-footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #ddd;
    font-size: 8.5pt;
    color: #666;
    line-height: 1.4;
  }

  /* ----- Print: lo único que el ATS imprimirá si suben PDF ----- */
  @page {
    size: A4;
    margin: 16mm 18mm;
  }
  @media print {
    body { background: white; }
    main {
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
    }
    .screen-only { display: none !important; }
    .skills-list, .traits-list, .languages-list {
      columns: 1;
    }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<main>
  <header>
    <h1>${name}</h1>
    <p class="headline">${headline}</p>
    ${contactHtml}
  </header>

  ${tailoredBadge}

  ${
    summary
      ? `<section>
  <h2>Perfil profesional</h2>
  <p>${summary}</p>
</section>`
      : ""
  }

  ${skillsHtml}

  ${experienceHtml}

  ${traitsHtml}

  ${educationHtml}

  ${certificationsHtml}

  ${languagesHtml}

  <p class="doc-footer">
    Documento generado por <strong>Salto</strong> a partir del Perfil de Evidencia · cada habilidad listada está anclada a una cita de la entrevista conversacional · ${today}.
  </p>
</main>
${autoprintScript}
</body>
</html>`;
}

/**
 * Versión plain-text del CV, alineada con el HTML, para campos
 * "Pegá tu CV" de ciertos ATS legacy (Computrabajo, OCC, Bumeran).
 */
function renderPlainText(p: Profile, opts: CvOptions): string {
  const lines: string[] = [];
  lines.push(p.name);
  lines.push(deriveHeadline(p, opts.headline));
  const contact = [opts.email, opts.phone, opts.city, opts.linkedin].filter(Boolean);
  if (contact.length > 0) lines.push(contact.join(" · "));
  lines.push("");
  if (p.summary) {
    lines.push("PERFIL PROFESIONAL");
    lines.push(p.summary);
    lines.push("");
  }
  if (p.skills.length > 0) {
    lines.push("COMPETENCIAS CLAVE");
    p.skills.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (p.evidence.length > 0) {
    lines.push("EXPERIENCIA Y LOGROS");
    p.evidence.forEach((e) => lines.push(`- ${e.skill}. ${e.quote}`));
    lines.push("");
  }
  if (p.traits.length > 0) {
    lines.push("RASGOS PROFESIONALES");
    p.traits.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }
  if (opts.education?.trim()) {
    lines.push("EDUCACIÓN");
    lines.push(opts.education.trim());
    lines.push("");
  }
  if (opts.certifications?.trim()) {
    lines.push("CERTIFICACIONES Y CURSOS");
    lines.push(opts.certifications.trim());
    lines.push("");
  }
  lines.push("IDIOMAS");
  const langs = (opts.languages?.trim() || "Español (nativo)").split(/[,\n;]/).map((l) => l.trim()).filter(Boolean);
  langs.forEach((l) => lines.push(`- ${l}`));
  return lines.join("\n").trim();
}

async function readOpts(req: NextRequest): Promise<{
  profileId: string | null;
  format: string;
  autoprint: boolean;
  download: boolean;
  needId: string | null;
  cv: CvOptions;
}> {
  const sp = req.nextUrl.searchParams;
  return {
    profileId: sp.get("profileId") ?? sp.get("id"),
    format: (sp.get("format") ?? "html").toLowerCase(),
    autoprint: sp.get("autoprint") === "1",
    download: sp.get("download") === "1",
    needId: sp.get("needId"),
    cv: {
      email: sp.get("email") ?? undefined,
      phone: sp.get("phone") ?? undefined,
      city: sp.get("city") ?? undefined,
      linkedin: sp.get("linkedin") ?? undefined,
      languages: sp.get("languages") ?? undefined,
      education: sp.get("education") ?? undefined,
      certifications: sp.get("certifications") ?? undefined,
      headline: sp.get("headline") ?? undefined,
      autoprint: sp.get("autoprint") === "1",
    },
  };
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "cv");
  const { profileId, format, download, needId, cv } = await readOpts(req);

  if (!profileId) {
    log.end({ status: 400, extra: { reason: "profileId_required" } });
    return NextResponse.json(
      { error: "profileId requerido", code: "fields_required" },
      { status: 400 }
    );
  }

  let profile = await getProfile(profileId);
  if (!profile) {
    log.end({ status: 404, extra: { profileId } });
    return NextResponse.json({ error: "Perfil no encontrado", code: "not_found" }, { status: 404 });
  }

  // Tailoring opcional: ordenar skills/evidencia por relevancia a una
  // necesidad concreta. Pone los keywords del JD primero → keyword density
  // alta donde los ATS la buscan.
  if (needId) {
    const need = await getNeed(needId);
    if (need) {
      profile = tailorToNeed(profile, need);
      cv.needRole = need.role;
    }
  }

  if (format === "json") {
    log.end({ status: 200, extra: { profileId, needId, format: "json" } });
    return NextResponse.json({
      profile,
      ats: { plainText: renderPlainText(profile, cv) },
    });
  }

  const html = renderAtsHtml(profile, cv);
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
  };
  if (download) {
    const safeName = (profile.name || "candidato").replace(/[^a-z0-9\-_]+/gi, "_").toLowerCase();
    headers["Content-Disposition"] = `attachment; filename="cv_ats_${safeName}.html"`;
  }
  log.end({
    status: 200,
    extra: {
      profileId,
      needId,
      format: "html",
      autoprint: cv.autoprint,
      download,
      tailored: !!cv.needRole,
    },
  });
  return new NextResponse(html, { status: 200, headers });
}

/**
 * POST clone para clientes que prefieren body JSON. Mantiene la misma
 * superficie pública.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = new URL(req.url);
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue;
    url.searchParams.set(k, v === true ? "1" : String(v));
  }
  return GET(new NextRequest(url, { method: "GET", headers: req.headers }));
}
