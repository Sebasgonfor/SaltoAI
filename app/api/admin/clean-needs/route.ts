import { NextRequest, NextResponse } from "next/server";
import { deleteNeed, getAllNeeds } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Endpoint admin para limpiar `CompanyNeed`s — pensado para borrar la data
 * de demo que se filtró desde el viejo `/empresa/publicar` (ej. los "Arepas
 * El Primo" duplicados que se publicaban al clickear los ejemplos del form).
 *
 * Modos:
 *   - ?company=<nombre exacto>     → borra todas las necesidades de esa empresa.
 *   - ?dryRun=1                    → solo lista qué borraría, sin tocar.
 *   - ?keepLatest=1                → mantiene la más reciente por companyName
 *                                     (útil para deduplicar sin perder todo).
 *
 * Protección: requiere header `x-admin-token` que coincida con
 * `process.env.ADMIN_TOKEN`. Si no hay ADMIN_TOKEN seteado, devuelve 503 —
 * no queremos un endpoint público que borre Firestore.
 *
 * Uso típico:
 *   curl -X POST -H "x-admin-token: $T" \
 *     "https://salto-ai.vercel.app/api/admin/clean-needs?company=Arepas%20El%20Primo&keepLatest=1"
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 8) return false;
  const got = req.headers.get("x-admin-token") || "";
  return got === expected;
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "admin.clean-needs");
  if (!isAuthorized(req)) {
    log.end({ status: 401, extra: { reason: "unauthorized" } });
    return NextResponse.json(
      { error: "unauthorized — requires x-admin-token header matching ADMIN_TOKEN env var" },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const companyFilter = sp.get("company")?.trim().toLowerCase();
  const dryRun = sp.get("dryRun") === "1";
  const keepLatest = sp.get("keepLatest") === "1";

  if (!companyFilter) {
    log.end({ status: 400, extra: { reason: "company_param_required" } });
    return NextResponse.json(
      { error: "Pasa ?company=<nombre exacto> para identificar qué borrar." },
      { status: 400 }
    );
  }

  const all = await getAllNeeds();
  const matches = all.filter(
    (n) => n.companyName.trim().toLowerCase() === companyFilter
  );

  if (matches.length === 0) {
    log.end({ status: 200, extra: { companyFilter, matched: 0 } });
    return NextResponse.json({
      ok: true,
      matched: 0,
      message: `No hay necesidades con companyName = "${companyFilter}".`,
    });
  }

  // Si keepLatest=1, ordenamos desc por createdAt y dejamos viva la primera.
  const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
  const toKeep = keepLatest ? sorted.slice(0, 1) : [];
  const toDelete = sorted.filter((n) => !toKeep.includes(n));

  const summary = {
    matched: matches.length,
    keep: toKeep.map((n) => ({ id: n.id, role: n.role, createdAt: n.createdAt })),
    delete: toDelete.map((n) => ({ id: n.id, role: n.role, createdAt: n.createdAt })),
    dryRun,
  };

  if (dryRun) {
    log.end({
      status: 200,
      extra: {
        companyFilter,
        matched: matches.length,
        keepCount: toKeep.length,
        deleteCount: toDelete.length,
        dryRun: true,
      },
    });
    return NextResponse.json({ ok: true, ...summary });
  }

  let deletedCount = 0;
  const failed: string[] = [];
  for (const n of toDelete) {
    if (!n.id) continue;
    const ok = await deleteNeed(n.id);
    if (ok) deletedCount++;
    else failed.push(n.id);
  }

  log.end({
    status: 200,
    extra: {
      companyFilter,
      matched: matches.length,
      deleted: deletedCount,
      failed: failed.length,
      kept: toKeep.length,
    },
  });

  return NextResponse.json({
    ok: true,
    ...summary,
    deletedCount,
    failed,
  });
}
