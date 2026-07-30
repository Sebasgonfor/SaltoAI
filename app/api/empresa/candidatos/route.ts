import { NextRequest, NextResponse } from "next/server";
import { listProfilesBySourceRecruiter } from "@/lib/db";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/empresa/candidatos?uid=<recruiterUid>
 *
 * Lista los candidatos que hicieron la entrevista a través del link de marca
 * de esta reclutadora (`sourceRecruiterUid`). Devuelve un subset SEGURO — solo
 * lo necesario para la lista, sin embedding, transcript ni contacto.
 *
 * Auth: igual que el resto del piloto (uid por query, sin verificación de ID
 * token). El scoping por `sourceRecruiterUid` ya limita a "sus" candidatos.
 */
export async function GET(req: NextRequest) {
  const log = startLog(req, "empresa.candidatos");
  const uid = req.nextUrl.searchParams.get("uid")?.trim() || req.headers.get("x-salto-uid") || "";

  if (!uid) {
    log.end({ status: 200, extra: { reason: "no_uid", count: 0 } });
    return NextResponse.json({ candidates: [], note: "no_uid" });
  }

  const profiles = await listProfilesBySourceRecruiter(uid);
  const candidates = profiles
    .map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      skills: Array.isArray(p.skills) ? p.skills.slice(0, 8) : [],
      createdAt: p.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  log.end({ status: 200, extra: { uid, count: candidates.length } });
  return NextResponse.json({ candidates });
}
