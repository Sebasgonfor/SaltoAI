import { NextRequest, NextResponse } from "next/server";
import {
  getRecruiterConfig,
  getRecruiterConfigBySlug,
  isSlugAvailable,
  upsertRecruiterConfig,
} from "@/lib/db";
import {
  toBrandPublic,
  validateRecruiterConfigInput,
  type RecruiterConfig,
} from "@/lib/recruiter-config";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Configuración de personalización por reclutadora.
 *
 *   GET ?slug=  → marca PÚBLICA para la landing `/r/[slug]` (404 si no existe).
 *                 NUNCA expone persona/instructions/styleSamples (toBrandPublic).
 *   GET ?uid=   → config COMPLETA propia (o `{ config: null }` si aún no tiene).
 *   PUT         → valida el payload, chequea disponibilidad de slug (409
 *                 `slug_taken`) y hace upsert. `uid` va en el body.
 *
 * Auth: igual que el resto del piloto (necesidad/mias, microtask/list) — el uid
 * llega por query/body, sin verificación de ID token (Admin SDK pendiente). El
 * scoping por uid evita que una reclutadora lea/escriba la config de otra por
 * accidente, pero no es una barrera criptográfica.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "recruiter-config");
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  const uid = req.nextUrl.searchParams.get("uid")?.trim();

  // ── Marca pública por slug (landing) ──────────────────────────────────────
  if (slug) {
    const cfg = await getRecruiterConfigBySlug(slug);
    if (!cfg) {
      log.end({ status: 404, extra: { slug, reason: "slug_not_found" } });
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    log.end({ status: 200, extra: { slug, mode: "brand_public" } });
    return NextResponse.json({ brand: toBrandPublic(cfg) });
  }

  // ── Config propia por uid ─────────────────────────────────────────────────
  if (uid) {
    const cfg = await getRecruiterConfig(uid);
    log.end({ status: 200, extra: { uid, mode: "own_config", found: !!cfg } });
    return NextResponse.json({ config: cfg ?? null });
  }

  log.end({ status: 400, extra: { reason: "slug_or_uid_required" } });
  return NextResponse.json(
    { error: "Indica ?slug= (marca pública) o ?uid= (config propia)." },
    { status: 400 }
  );
}

export async function PUT(req: NextRequest) {
  const log = startLog(req, "recruiter-config");
  try {
    const body = (await req.json()) as { uid?: unknown };
    const uid =
      typeof body.uid === "string" && body.uid.trim() ? body.uid.trim() : "";
    if (!uid) {
      log.end({ status: 401, extra: { reason: "uid_required" } });
      return NextResponse.json(
        { error: "Inicia sesión para guardar tu configuración." },
        { status: 401 }
      );
    }

    const result = validateRecruiterConfigInput(body, uid);
    if (!result.ok) {
      log.end({ status: 400, extra: { reason: "invalid_input" } });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // El slug es único globalmente. Si lo reclama otra reclutadora, 409.
    const slugFree = await isSlugAvailable(result.config.slug, uid);
    if (!slugFree) {
      log.end({ status: 409, extra: { slug: result.config.slug, reason: "slug_taken" } });
      return NextResponse.json(
        { error: "Ese link ya está en uso. Elige otro.", code: "slug_taken" },
        { status: 409 }
      );
    }

    const existing = await getRecruiterConfig(uid);
    const now = Date.now();
    const config: RecruiterConfig = {
      ...result.config,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertRecruiterConfig(config);

    log.end({ status: 200, extra: { uid, slug: config.slug, created: !existing } });
    return NextResponse.json({ config });
  } catch (err) {
    log.error("recruiter-config.put.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos guardar tu configuración.", code: "unknown" },
      { status: 500 }
    );
  }
}
