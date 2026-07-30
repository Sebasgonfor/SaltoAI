#!/usr/bin/env node
/**
 * E2E con tu cuenta Google real.
 *
 * Flujo:
 *  1. Abro Chrome visible apuntando a localhost:3000.
 *  2. Vos hacés sign-in manual con Google (yo no puedo automatizar OAuth).
 *  3. Detecto que estás logueado leyendo el localStorage de Firebase Auth.
 *  4. Leo tu rol (joven o empresa).
 *  5. Recorro el flow completo del rol detectado, capturando console errors,
 *     network failures, hydration warnings, redirects rotos, botones muertos.
 *  6. Screenshots en /tmp/salto-e2e-auth/.
 *  7. Reporte final con findings P0/P1/P2.
 */

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "/tmp/salto-e2e-auth";
mkdirSync(OUT, { recursive: true });

const findings = [];
function report(severity, area, msg, extra) {
  findings.push({ severity, area, msg, ...(extra || {}) });
  const icon = severity === "P0" ? "🔴" : severity === "P1" ? "🟡" : severity === "P2" ? "🔵" : "ℹ️";
  console.log(`${icon} [${severity}] ${area}: ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);
}

const allConsoleEvents = [];
function attachListeners(page, label) {
  const snap = { label, errors: [], warnings: [], failedRequests: [] };
  page.on("console", (m) => {
    const type = m.type();
    const text = m.text();
    allConsoleEvents.push({ label, type, text });
    if (text.includes("Cross-Origin-Opener-Policy")) return; // ya filtrado por COOP header en next.config
    if (text.includes("[accounts] getUserAccount fallback to memory")) return;
    if (type === "error") snap.errors.push(text);
    else if (type === "warning") snap.warnings.push(text);
  });
  page.on("pageerror", (err) => snap.errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    snap.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("_next/") && !res.url().includes("favicon")) {
      snap.failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return snap;
}

function summarize(snap) {
  if (snap.errors.length) {
    report("P1", snap.label, "console errors", {
      count: snap.errors.length,
      samples: snap.errors.slice(0, 2),
    });
  }
  const hydration = snap.warnings.filter((w) =>
    /hydration|cannot be a descendant|setState in render|Cannot update a component/i.test(w)
  );
  if (hydration.length) {
    report("P1", snap.label, "React warnings (hydration/render)", {
      samples: hydration.slice(0, 2),
    });
  }
  if (snap.failedRequests.length) {
    const blocking = snap.failedRequests.filter(
      (r) => !/_next\/|favicon|chrome-extension/i.test(r)
    );
    if (blocking.length) {
      report("P0", snap.label, "network failures", { samples: blocking.slice(0, 3) });
    }
  }
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } catch {
    /* page might be navigating */
  }
}

async function waitForLogin(page, maxMs = 180_000) {
  console.log("\n⏳ Esperando que completes el sign-in con Google...");
  console.log("   1. En la ventana del browser, clickeá 'Soy empresa' o 'Soy joven'.");
  console.log("   2. Completá el login de Google.");
  console.log("   3. Vas a aterrizar en /empresa o /joven/chat — eso me dice que estás listo.");
  console.log(`   Timeout: ${maxMs / 1000}s\n`);

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const data = await page.evaluate(() => {
      // Firebase guarda la sesión en localStorage con prefix `firebase:authUser:`
      const keys = Object.keys(localStorage);
      const authKey = keys.find((k) => k.startsWith("firebase:authUser:"));
      if (!authKey) return null;
      try {
        const user = JSON.parse(localStorage.getItem(authKey) || "{}");
        return { uid: user.uid, email: user.email, displayName: user.displayName };
      } catch {
        return null;
      }
    });
    if (data?.uid) return data;
    await page.waitForTimeout(1500);
  }
  return null;
}

async function detectRole(page, uid) {
  // El AuthProvider lee /accounts/{uid} y lo expone como `account` en el context.
  // No es fácil leerlo desde Playwright sin un hook. Vamos a inferir por URL final:
  // si estás en /empresa* → empresa. Si /joven/* → joven. Si /onboarding/rol → no asignado.
  // Sino, leemos /api/perfil?id={uid} para inferir si hay perfil de joven.
  const url = page.url();
  if (url.includes("/empresa")) return "empresa";
  if (url.includes("/joven")) return "joven";
  if (url.includes("/onboarding")) return "no_role";

  // Fallback: probar perfil de joven
  try {
    const res = await page.request.get(`${BASE}/api/perfil?id=${encodeURIComponent(uid)}`);
    if (res.ok()) return "joven";
  } catch {
    /* ignore */
  }
  return "unknown";
}

async function flowEmpresa(page, uid) {
  console.log("\n— Recorriendo flow EMPRESA —");

  // 1. /empresa dashboard
  let snap = attachListeners(page, "empresa.dashboard");
  await page.goto(`${BASE}/empresa`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000); // espera fetch de needs + tasks
  await shot(page, "01-empresa-dashboard");

  const greeting = await page.locator("h1").first().textContent().catch(() => "");
  if (!/Buenos días|Buenas tardes|Buenas noches/i.test(greeting || "")) {
    report("P1", "empresa.dashboard", "greeting personalizado no aparece", { found: greeting });
  }

  // KPI cards
  const kpiCount = await page.locator("h2:has-text('Mis necesidades'), h2:has-text('Micro-tareas')").count();
  if (kpiCount < 2) report("P1", "empresa.dashboard", "secciones Mis necesidades / Micro-tareas faltan");

  // Hay necesidades?
  let needId = null;
  const needsResp = await page.request.get(`${BASE}/api/necesidad/mias?uid=${uid}`);
  if (needsResp.ok()) {
    const { needs } = await needsResp.json();
    if (Array.isArray(needs) && needs.length > 0) {
      needId = needs[0].id;
      console.log(`  ℹ️  Tenés ${needs.length} necesidad(es); voy a ver el match de la primera (${needId}).`);
    }
  }
  summarize(snap);

  // 2. Si no tiene need, intento crear una vía API (no por chat para ahorrar tokens Gemini)
  if (!needId) {
    console.log("  ℹ️  No tenés necesidades publicadas — creando una de prueba via API");
    const create = await page.request.post(`${BASE}/api/necesidad`, {
      data: {
        companyName: "Salto E2E Test",
        rawDescription:
          "Local de comida nuevo en Barranquilla. Somos 3 personas, abriendo primer local, ritmo rápido sin protocolos. Necesitamos a alguien para redes (Instagram, TikTok), atención al cliente y resolver reclamos. Caos, autodidacta, orientación a resultados.",
        ownerUid: uid,
        ownerEmail: "e2e@test.com",
        ownerName: "E2E Test",
      },
      headers: { "Content-Type": "application/json" },
    });
    if (create.ok()) {
      const { id } = await create.json();
      needId = id;
      console.log(`  ✓ Necesidad de prueba creada: ${needId}`);
    } else {
      report("P0", "empresa.dashboard", "no pude crear necesidad de prueba", { status: create.status() });
    }
  }

  if (!needId) return;

  // 3. /empresa/matches/{needId}
  snap = attachListeners(page, "empresa.matches");
  await page.goto(`${BASE}/empresa/matches/${needId}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  // Espera el LLM
  try {
    await page.waitForSelector("text=Mejor match", { timeout: 60000 });
    await shot(page, "02-empresa-matches");
  } catch {
    await shot(page, "02-empresa-matches-NOT-LOADED");
    report("P1", "empresa.matches", "'Mejor match' no apareció en 60s (rate limit o error)");
  }

  // Verificar que aparecen 1-3 candidatos
  const matchCount = await page.locator("article:has(button:has-text('Contactar')), article:has(button:has-text('Ver perfil'))").count();
  console.log(`  ℹ️  Cards de candidato encontrados: ${matchCount}`);

  // Botón "Contactar" — sigue muerto?
  const contactarBtns = await page.locator("button:has-text('Contactar')").all();
  if (contactarBtns.length > 0) {
    const onclick = await contactarBtns[0].evaluate((el) => (el).onclick ? "yes" : "no");
    if (onclick === "no") {
      report("P1", "empresa.matches", "Botón 'Contactar' sin handler (dead button)");
    }
  }

  // Botón "Editar necesidad" — apunta a /empresa/publicar sin prefill?
  const editLink = await page.locator("a:has-text('Editar necesidad')").first().getAttribute("href").catch(() => null);
  if (editLink && !editLink.includes("editId") && !editLink.includes("?id")) {
    report("P1", "empresa.matches", `'Editar necesidad' va a ${editLink} sin prefill — perdería todo`);
  }

  // ¿Útil? sí/no
  const utilButtons = await page.locator("button:has-text('Sí'), button:has-text('No')").count();
  if (utilButtons === 0) report("P2", "empresa.matches", "Botones ¿útil? no encontrados");

  summarize(snap);

  // 4. Click en "Ver perfil completo" del top match
  snap = attachListeners(page, "perfil.candidato.como.empresa");
  const verPerfil = page.locator("a:has-text('Ver perfil completo'), a:has-text('Ver perfil')").first();
  const verPerfilHref = await verPerfil.getAttribute("href").catch(() => null);
  if (!verPerfilHref) {
    report("P1", "empresa.matches", "Link 'Ver perfil completo' no encontrado");
  } else {
    console.log(`  → Navegando a ${verPerfilHref}`);
    await page.goto(`${BASE}${verPerfilHref}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, "03-perfil-candidato-como-empresa");

    // El banner de "Estás viendo un candidato" debería aparecer
    const banner = await page.locator("text=Estás viendo el perfil de un candidato").count();
    if (banner === 0) {
      report("P1", "perfil.candidato.como.empresa", "Banner contextual 'Estás viendo el perfil de un candidato' NO aparece");
    } else {
      console.log("  ✓ Banner contextual aparece");
    }

    // El nombre del candidato visible
    const nombre = await page.locator("h1").first().textContent().catch(() => "");
    if (!nombre || nombre.length < 3) {
      report("P0", "perfil.candidato.como.empresa", "Nombre del candidato no renderiza");
    }
  }
  summarize(snap);

  // 5. /empresa/probar/{profileId} — propose tarea
  if (verPerfilHref) {
    const profileId = verPerfilHref.split("/").pop();
    snap = attachListeners(page, "empresa.probar");
    await page.goto(`${BASE}/empresa/probar/${profileId}?needId=${needId}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await shot(page, "04-empresa-probar");

    // El form de proponer tarea está visible?
    const textarea = await page.locator("textarea").count();
    if (textarea === 0) {
      report("P1", "empresa.probar", "Form de proponer tarea no encontrado (sin textarea)");
    }
    summarize(snap);
  }

  // 6. Volvé al dashboard
  snap = attachListeners(page, "empresa.dashboard.return");
  await page.goto(`${BASE}/empresa`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, "05-empresa-dashboard-return");

  // ¿La need creada aparece ahora?
  const cards = await page.locator(`a[href="/empresa/matches/${needId}"]`).count();
  if (cards === 0) {
    report("P1", "empresa.dashboard.return", `La need creada (${needId}) no aparece en el dashboard tras refresh`);
  } else {
    console.log("  ✓ La need creada aparece en el dashboard");
  }
  summarize(snap);
}

async function flowJoven(page, uid) {
  console.log("\n— Recorriendo flow JOVEN —");

  // 1. /dashboard
  let snap = attachListeners(page, "joven.dashboard");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "01-joven-dashboard");

  // ¿Hay perfil?
  const perfilResp = await page.request.get(`${BASE}/api/perfil?id=${uid}`);
  const hasPerfil = perfilResp.ok();
  console.log(`  ℹ️  Perfil de joven existe: ${hasPerfil}`);
  summarize(snap);

  // 2. /joven/perfil/{uid}
  if (hasPerfil) {
    snap = attachListeners(page, "joven.perfil");
    await page.goto(`${BASE}/joven/perfil/${uid}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, "02-joven-perfil");

    const nombre = await page.locator("h1").first().textContent().catch(() => "");
    if (!nombre || nombre.length < 3) {
      report("P0", "joven.perfil", "Nombre del joven no renderiza");
    }

    // CvCustomizer presente
    const picker = await page.locator("text=Plantilla de CV").count();
    if (picker === 0) report("P1", "joven.perfil", "CvCustomizer no renderiza");

    // 5 botones de estilo
    const styleBtns = await page.locator('[role="radio"]').count();
    if (styleBtns < 5) report("P1", "joven.perfil", `Picker tiene ${styleBtns} botones (esperado 5)`);

    summarize(snap);
  }

  // 3. /joven/conectar (oportunidades)
  snap = attachListeners(page, "joven.conectar");
  await page.goto(`${BASE}/joven/conectar`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "03-joven-conectar");
  summarize(snap);

  // 4. /joven/tareas
  snap = attachListeners(page, "joven.tareas");
  await page.goto(`${BASE}/joven/tareas`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, "04-joven-tareas");
  summarize(snap);
}

(async () => {
  console.log(`▸ Browser headless: false (vas a ver la ventana)`);
  console.log(`▸ BASE: ${BASE}`);
  console.log(`▸ Output: ${OUT}\n`);

  const browser = await chromium.launch({ headless: false, args: ["--no-default-browser-check"] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  attachListeners(page, "bootstrap");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot(page, "00-landing-pre-login");

  const user = await waitForLogin(page);
  if (!user) {
    console.log("⏱  Timeout esperando login. Si querés reintentar, corré de nuevo.");
    await browser.close();
    process.exit(1);
  }
  console.log(`\n✓ Logueado como ${user.email} (uid ${user.uid.slice(0, 8)}…)`);
  await page.waitForTimeout(2000); // espera redirect post-login

  const role = await detectRole(page, user.uid);
  console.log(`✓ Rol detectado: ${role}`);

  if (role === "empresa") {
    await flowEmpresa(page, user.uid);
  } else if (role === "joven") {
    await flowJoven(page, user.uid);
  } else if (role === "no_role") {
    report("P1", "auth", "El user no tiene rol asignado todavía (en /onboarding/rol)");
  } else {
    report("P1", "auth", "No pude detectar tu rol", { url: page.url() });
  }

  // Guardo storageState para reutilizar después
  await ctx.storageState({ path: `${OUT}/storage-state.json` });

  console.log("\n═══════════════════ RESUMEN ═══════════════════");
  const by = { P0: [], P1: [], P2: [] };
  findings.forEach((f) => (by[f.severity] || []).push(f));
  console.log(`P0 blockers : ${by.P0.length}`);
  console.log(`P1 friction : ${by.P1.length}`);
  console.log(`P2 polish   : ${by.P2.length}`);
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  writeFileSync(`${OUT}/console-log.json`, JSON.stringify(allConsoleEvents, null, 2));
  console.log(`\nScreenshots: ${OUT}/*.png`);
  console.log(`Findings:    ${OUT}/findings.json`);
  console.log(`Console log: ${OUT}/console-log.json`);

  console.log("\n⏸  El browser queda abierto para que veas el final. Cerralo cuando quieras (Cmd+W).");
  // No cierro el browser — el user lo cierra cuando quiera
  await new Promise(() => {}); // bloquear forever, el user mata el proceso
})();
