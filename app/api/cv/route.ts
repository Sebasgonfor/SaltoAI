import { NextRequest, NextResponse } from "next/server";
import { getNeed, getProfile } from "@/lib/db";
import { startLog } from "@/lib/logger";
import {
  CV_STYLES,
  type CvOptions,
  type CvStyle,
  isCvStyle,
  renderCv,
  renderPlainText,
  tailorToNeed,
} from "@/lib/cv-templates";

export const runtime = "nodejs";

/**
 * CV ATS one-click (PRD §6.2.5) — 5 estilos seleccionables.
 *
 * Estilos soportados (ver `lib/cv-templates.ts` para detalle):
 *   - minimalist (default, ATS-safe)
 *   - hybrid (recomendado para Salto: skills + logros por competencia)
 *   - functional (agrupado por competencia)
 *   - chronological (clásico corporativo)
 *   - creative (2 columnas, color — NO pasa ATS estrictos, avisado en doc)
 *
 * Query params:
 *   profileId (required)
 *   style=minimalist|hybrid|functional|chronological|creative (default minimalist)
 *   email, phone, city, linkedin, languages, education, certifications, headline
 *   needId          → tailoring por necesidad (sube keyword density)
 *   format=html|json
 *   autoprint=1     → window.print() al cargar
 *   download=1      → Content-Disposition attachment
 *   styles=list     → endpoint introspectivo: devuelve la metadata de los 5
 *                     estilos en JSON. Útil para la UI sin hardcodear.
 */
async function readOpts(req: NextRequest): Promise<{
  profileId: string | null;
  style: CvStyle;
  format: string;
  autoprint: boolean;
  download: boolean;
  needId: string | null;
  cv: CvOptions;
  introspectStyles: boolean;
}> {
  const sp = req.nextUrl.searchParams;
  const requestedStyle = (sp.get("style") ?? "minimalist").toLowerCase();
  const style: CvStyle = isCvStyle(requestedStyle) ? requestedStyle : "minimalist";
  return {
    profileId: sp.get("profileId") ?? sp.get("id"),
    style,
    format: (sp.get("format") ?? "html").toLowerCase(),
    autoprint: sp.get("autoprint") === "1",
    download: sp.get("download") === "1",
    needId: sp.get("needId"),
    introspectStyles: sp.get("styles") === "list",
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
  const opts = await readOpts(req);

  // Introspect-only mode: devuelve la metadata de los 5 estilos sin necesidad
  // de un profileId. La UI del cv-customizer lo usa para no duplicar la lista.
  if (opts.introspectStyles) {
    log.end({ status: 200, extra: { introspect: true } });
    return NextResponse.json({ styles: CV_STYLES });
  }

  const { profileId, style, format, download, needId, cv } = opts;

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

  // Tailoring opcional por necesidad — pone los keywords del JD al inicio.
  if (needId) {
    const need = await getNeed(needId);
    if (need) {
      profile = tailorToNeed(profile, need);
      cv.needRole = need.role;
    }
  }

  if (format === "json") {
    log.end({ status: 200, extra: { profileId, needId, style, format: "json" } });
    return NextResponse.json({
      profile,
      style,
      ats: { plainText: renderPlainText(profile, style, cv) },
    });
  }

  // Texto plano servido directo — antes "format=json" devolvía un objeto JSON
  // y se mostraba como dump crudo en una pestaña nueva. El usuario pide ver
  // el CV en texto plano, no la estructura interna.
  if (format === "txt" || format === "text") {
    const text = renderPlainText(profile, style, cv);
    log.end({ status: 200, extra: { profileId, needId, style, format: "txt" } });
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    };
    if (download) {
      const safeName = (profile.name || "candidato")
        .replace(/[^a-z0-9\-_]+/gi, "_")
        .toLowerCase();
      headers["Content-Disposition"] = `attachment; filename="cv_${style}_${safeName}.txt"`;
    }
    return new NextResponse(text, { status: 200, headers });
  }

  const html = renderCv(profile, style, cv);
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
  };
  if (download) {
    const safeName = (profile.name || "candidato")
      .replace(/[^a-z0-9\-_]+/gi, "_")
      .toLowerCase();
    headers["Content-Disposition"] = `attachment; filename="cv_${style}_${safeName}.html"`;
  }
  log.end({
    status: 200,
    extra: {
      profileId,
      needId,
      style,
      format: "html",
      autoprint: cv.autoprint,
      download,
      tailored: !!cv.needRole,
    },
  });
  return new NextResponse(html, { status: 200, headers });
}

/**
 * POST clone para clientes que prefieren body JSON. Misma superficie pública.
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
