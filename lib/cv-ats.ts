import type { Gender, Profile } from "./types";

const GENDER_LABEL: Record<Gender, string> = {
  mujer: "Mujer",
  hombre: "Hombre",
  otro: "Otro",
  prefiero_no_decir: "Prefiere no indicar",
};

/** CV en una sola columna, texto plano: parseable por ATS (sin tablas ni columnas). */
export function buildAtsCvText(profile: Profile): string {
  const lines: string[] = [];

  lines.push(profile.name.toUpperCase());
  if (profile.age) {
    lines.push(`Edad: ${profile.age} años`);
  }
  if (profile.gender && profile.gender !== "prefiero_no_decir") {
    lines.push(GENDER_LABEL[profile.gender]);
  }
  lines.push("");

  if (profile.summary) {
    lines.push("RESUMEN PROFESIONAL");
    lines.push(profile.summary);
    lines.push("");
  }

  if (profile.skills.length > 0) {
    lines.push("HABILIDADES");
    for (const s of profile.skills) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (profile.traits.length > 0) {
    lines.push("COMPETENCIAS CONDUCTUALES");
    for (const t of profile.traits) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  if (profile.evidence.length > 0) {
    lines.push("EXPERIENCIA Y LOGROS (evidencia verificada)");
    for (const ev of profile.evidence) {
      lines.push(`${ev.skill}`);
      lines.push(`  ${ev.quote}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("Perfil generado por SaltoAI · Evidencia extraída de entrevista conversacional");

  return lines.join("\n").trim();
}

/** HTML mínimo, una columna, sin tablas (compatible con export PDF desde navegador). */
export function buildAtsCvHtml(profile: Profile): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const skills = profile.skills.map((s) => `<li>${esc(s)}</li>`).join("");
  const traits = profile.traits.map((t) => `<li>${esc(t)}</li>`).join("");
  const evidence = profile.evidence
    .map(
      (e) =>
        `<p><strong>${esc(e.skill)}</strong><br>${esc(e.quote)}</p>`
    )
    .join("");

  const genderLine =
    profile.gender && profile.gender !== "prefiero_no_decir"
      ? `<p class="meta">${esc(GENDER_LABEL[profile.gender])}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>CV - ${esc(profile.name)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; max-width: 680px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 18pt; margin: 0 0 0.25rem; letter-spacing: 0.02em; }
    .meta { margin: 0 0 1rem; color: #444; font-size: 10pt; }
    h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; margin: 1.25rem 0 0.5rem; }
    ul { margin: 0.25rem 0 0.75rem; padding-left: 1.25rem; }
    li { margin-bottom: 0.2rem; }
    p { margin: 0.35rem 0; }
    footer { margin-top: 2rem; font-size: 9pt; color: #666; border-top: 1px solid #eee; padding-top: 0.75rem; }
  </style>
</head>
<body>
  <h1>${esc(profile.name)}</h1>
  ${profile.age ? `<p class="meta">Edad: ${profile.age} años</p>` : ""}
  ${genderLine}
  <h2>Resumen profesional</h2>
  <p>${esc(profile.summary || "Profesional en etapa temprana con experiencia informal demostrable.")}</p>
  ${skills ? `<h2>Habilidades</h2><ul>${skills}</ul>` : ""}
  ${traits ? `<h2>Competencias conductuales</h2><ul>${traits}</ul>` : ""}
  ${evidence ? `<h2>Experiencia y logros</h2>${evidence}` : ""}
  <footer>Perfil SaltoAI · CV optimizado para sistemas ATS (una columna, sin tablas)</footer>
</body>
</html>`;
}

export function cvDownloadFilename(profile: Profile): string {
  const slug = profile.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return `CV_${slug || "salto"}_ATS.txt`;
}
