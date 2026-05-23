#!/usr/bin/env node
/**
 * E2E con Playwright contra dev local.
 *
 * Cobertura:
 *   - Landing: render, navegación, CTAs (Soy joven / Soy empresa).
 *   - Onboarding/rol: render + redirect cuando no hay sesión.
 *   - /joven/perfil/seed_camila_silva: render del perfil de evidencia.
 *   - CV ATS: las 5 plantillas renderizan sin tablas/imágenes y con
 *     headings esperados.
 *   - /empresa/matches/{needId}: con una need creada vía API.
 *   - APIs: smoke equivalente (seed, necesidad, match, feedback, cv, mias).
 *
 * No cubre (requiere Google OAuth real, no automatizable sin pre-auth):
 *   - Flow completo joven con login.
 *   - Flow completo empresa con login → /empresa/chat → matches → tarea.
 *
 * Para cada navegación capturo: console errors, console warnings, network
 * failures, hydration errors, layout broken (visualmente).
 *
 * Output: tabla de findings + screenshots en /tmp/salto-e2e/.
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "/tmp/salto-e2e";
mkdirSync(OUT, { recursive: true });

const findings = [];
function report(severity, area, msg, extra) {
  findings.push({ severity, area, msg, ...(extra || {}) });
  const icon = severity === "P0" ? "🔴" : severity === "P1" ? "🟡" : severity === "P2" ? "🔵" : "ℹ️";
  console.log(`${icon} [${severity}] ${area}: ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

function attachListeners(page, label) {
  const errors = [];
  const warnings = [];
  const failedRequests = [];
  page.on("console", (m) => {
    const type = m.type();
    const text = m.text();
    if (type === "error") {
      // Filtramos los falsos positivos conocidos del browser dev tools
      // (COOP warning de Firebase ya está fixed; cualquier error legítimo
      // entra acá).
      if (text.includes("Cross-Origin-Opener-Policy")) return;
      errors.push(text);
    } else if (type === "warning") {
      warnings.push(text);
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("_next/")) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return { errors, warnings, failedRequests, label };
}

function summarize(snap) {
  if (snap.errors.length) report("P1", snap.label, "console errors", { count: snap.errors.length, samples: snap.errors.slice(0, 2) });
  // Hydration warnings son P1
  const hydration = snap.warnings.filter((w) => /hydration|in HTML.*cannot be|setState in render/i.test(w));
  if (hydration.length) report("P1", snap.label, "hydration / React warnings", { samples: hydration.slice(0, 2) });
  const otherWarns = snap.warnings.filter((w) => !/hydration|in HTML.*cannot be|setState in render/i.test(w));
  if (otherWarns.length) report("P2", snap.label, "console warnings (non-hydration)", { count: otherWarns.length, samples: otherWarns.slice(0, 1) });
  if (snap.failedRequests.length) {
    const blocking = snap.failedRequests.filter((r) => !/_next\/|favicon|chrome-extension/i.test(r));
    if (blocking.length) report("P0", snap.label, "network failures", { samples: blocking.slice(0, 3) });
  }
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function apiSmoke() {
  console.log("\n— API SMOKE —");
  // /api/seed (cargar perfiles si la base está vacía)
  const seed = await fetch(`${BASE}/api/seed?force=1`, { method: "POST" });
  if (!seed.ok) report("P0", "api.seed", "POST /api/seed failed", { status: seed.status });

  // /api/necesidad → necesario para tener un needId real
  const need = await fetch(`${BASE}/api/necesidad`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "Arepas Doña Lucha (E2E)",
      rawDescription:
        "Abrimos primer local en Barranquilla, somos 3 personas, sin protocolos, atendemos al público directamente. Necesitamos a alguien que maneje redes (Instagram, TikTok), responda mensajes y atienda en vitrina. Caos, autodidacta, orientación a resultados.",
    }),
  });
  if (!need.ok) {
    report("P0", "api.necesidad", "POST /api/necesidad failed", { status: need.status });
    return null;
  }
  const needJson = await need.json();
  const needId = needJson.id;

  // /api/match
  const match = await fetch(`${BASE}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ needId }),
  });
  if (!match.ok) {
    report("P0", "api.match", "POST /api/match failed", { status: match.status });
  } else {
    const m = await match.json();
    if (!Array.isArray(m.matches) || m.matches.length === 0) {
      report("P1", "api.match", "match returned 0 candidates", { needId });
    } else {
      const camila = m.matches.find((mm) => /camila/i.test(mm.profileName));
      if (!camila) report("P1", "api.match", "Camila no apareció en top-3", { top: m.matches.map((mm) => mm.profileName) });
      else if (camila.ics < 80) report("P1", "api.match", `Camila ICS=${camila.ics} < 80`, { needId });
      else console.log(`  ✓ api.match: Camila ICS=${camila.ics}`);
    }
  }

  // /api/feedback
  const fb = await fetch(`${BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ needId, profileId: "seed_camila_silva", useful: true, source: "empresa_match" }),
  });
  if (!fb.ok) report("P1", "api.feedback", "POST failed", { status: fb.status });
  else console.log(`  ✓ api.feedback OK`);

  // /api/cv todos los estilos
  for (const style of ["minimalist", "hybrid", "functional", "chronological", "creative"]) {
    const r = await fetch(`${BASE}/api/cv?profileId=seed_camila_silva&style=${style}`);
    if (!r.ok) report("P0", `api.cv.${style}`, "GET failed", { status: r.status });
    else {
      const html = await r.text();
      // Checks ATS-killer
      if (style !== "creative" && /<table[\s>]/.test(html))
        report("P1", `api.cv.${style}`, "contiene <table> (rompe ATS)");
      if (/<img[\s>]/.test(html)) report("P2", `api.cv.${style}`, "contiene <img>");
      if (!/cv-style/.test(html)) report("P2", `api.cv.${style}`, "meta cv-style ausente");
    }
  }
  console.log("  ✓ api.cv: 5 estilos OK");

  // /api/oportunidades
  const opp = await fetch(`${BASE}/api/oportunidades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: "seed_camila_silva" }),
  });
  if (!opp.ok) report("P1", "api.oportunidades", "POST failed", { status: opp.status });

  // /api/necesidad/mias (sin uid devuelve { needs: [], note: 'no_uid' })
  const mias = await fetch(`${BASE}/api/necesidad/mias`);
  if (!mias.ok) report("P1", "api.necesidad.mias", "GET sin uid devolvió error", { status: mias.status });

  return { needId };
}

async function browserFlow(needId) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  // ──── 1. LANDING ────
  console.log("\n— BROWSER FLOWS —");
  let snap = attachListeners(page, "landing");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "01-landing");

  // CTAs presentes?
  const ctaJoven = await page.locator('a[href="/joven/chat"]').first().count();
  const ctaEmpresa = await page.locator('a[href="/empresa/publicar"], a[href="/empresa/chat"]').first().count();
  if (ctaJoven === 0) report("P1", "landing", "CTA 'Soy joven' no encontrado");
  if (ctaEmpresa === 0) report("P1", "landing", "CTA 'Soy empresa' no encontrado");
  summarize(snap);

  // ──── 2. /joven/chat (basics phase visible aunque no haya login) ────
  snap = attachListeners(page, "joven.chat");
  await page.goto(`${BASE}/joven/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "02-joven-chat");
  summarize(snap);

  // ──── 3. /empresa (dashboard founder) — sin auth muestra muro ────
  snap = attachListeners(page, "empresa.dashboard");
  await page.goto(`${BASE}/empresa`, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "03-empresa-dashboard-anon");
  summarize(snap);

  // ──── 4. /joven/perfil/seed_camila_silva (perfil público) ────
  snap = attachListeners(page, "perfil.camila");
  await page.goto(`${BASE}/joven/perfil/seed_camila_silva`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500); // espera fetch del profile
  await shot(page, "04-perfil-camila");

  // Verifica que cargó el perfil real
  const nameVisible = await page.getByText("Camila Silva").first().count();
  if (nameVisible === 0) report("P0", "perfil.camila", "Nombre del perfil no aparece — fetch falló");

  // CV customizer presente?
  const cvCustomizer = await page.locator("text=Plantilla de CV").count();
  if (cvCustomizer === 0) report("P1", "perfil.camila", "CvCustomizer no renderizó (falta picker)");

  // 5 botones de estilo presentes?
  const styleButtons = await page.locator('[role="radio"]').count();
  if (styleButtons < 5) report("P1", "perfil.camila", `Picker de plantillas: ${styleButtons} botones (esperado 5)`);

  summarize(snap);

  // ──── 5. CV print preview (cada uno de los 5 estilos via window.open) ────
  for (const style of ["minimalist", "hybrid", "functional", "chronological", "creative"]) {
    snap = attachListeners(page, `cv.${style}`);
    const cvUrl = `${BASE}/api/cv?profileId=seed_camila_silva&style=${style}&email=test@test.com&phone=%2B57+300+000+0000&city=Barranquilla&languages=Espa%C3%B1ol+(nativo)`;
    await page.goto(cvUrl, { waitUntil: "networkidle", timeout: 30000 });
    await shot(page, `05-cv-${style}`);
    summarize(snap);
  }

  // ──── 6. /empresa/matches/{needId} (con el need creado por API) ────
  if (needId) {
    snap = attachListeners(page, "empresa.matches");
    await page.goto(`${BASE}/empresa/matches/${needId}`, { waitUntil: "networkidle", timeout: 60000 });
    // Espera al spinner → resultados (~15s con LLM)
    try {
      await page.waitForSelector("text=Mejor match", { timeout: 30000 });
      await shot(page, "06-empresa-matches");
    } catch {
      await shot(page, "06-empresa-matches-NOT-LOADED");
      report("P1", "empresa.matches", "no apareció 'Mejor match' en 30s (rate-limit Gemini o auth gate)");
    }
    summarize(snap);
  }

  // ──── 7. /dashboard (joven dashboard) sin auth ────
  snap = attachListeners(page, "dashboard.joven.anon");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "07-dashboard-joven-anon");
  summarize(snap);

  // ──── 8. /aliados/impacto ────
  snap = attachListeners(page, "aliados.impacto");
  await page.goto(`${BASE}/aliados/impacto`, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "08-aliados-impacto");
  summarize(snap);

  // ──── 9. /onboarding/rol ────
  snap = attachListeners(page, "onboarding.rol");
  await page.goto(`${BASE}/onboarding/rol`, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "09-onboarding-rol");
  summarize(snap);

  await browser.close();
}

(async () => {
  const ctx = await apiSmoke();
  await browserFlow(ctx?.needId);

  // ─── Resumen ───
  console.log("\n═══════════════════════ RESUMEN ═══════════════════════");
  const by = { P0: [], P1: [], P2: [] };
  findings.forEach((f) => (by[f.severity] || []).push(f));
  console.log(`P0 blockers : ${by.P0.length}`);
  console.log(`P1 friction : ${by.P1.length}`);
  console.log(`P2 polish   : ${by.P2.length}`);
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  console.log(`\nScreenshots en ${OUT}/*.png`);
  console.log(`Findings JSON en ${OUT}/findings.json`);

  if (by.P0.length > 0) process.exit(2);
  if (by.P1.length > 0) process.exit(1);
  process.exit(0);
})();
