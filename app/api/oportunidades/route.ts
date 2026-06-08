import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllNeeds, getNeed, getNeedMatches, getProfile, listDecisionsForProfile } from "@/lib/db";
import { RETURN_SIZE } from "@/lib/ics";
import { isNeedOpen } from "@/lib/need-status";
import { startLog } from "@/lib/logger";
import type { OpportunityMatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/oportunidades — devuelve necesidades compatibles para un joven.
 *
 * Lee los ICS ya calculados al publicar cada necesidad (colección need_matches).
 * No vuelve a llamar a Gemini en cada visita.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "oportunidades");
  try {
    const { profileId } = (await req.json()) as { profileId: string };
    if (!profileId) {
      log.end({ status: 400, extra: { reason: "profileId_required" } });
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const profile = await getProfile(profileId);
    if (!profile) {
      log.end({ status: 404, extra: { profileId } });
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    // El matching usa profile.embedding + los ICS cacheados por necesidad; la
    // página solo necesita estos datos para el encabezado. NO devolvemos el
    // perfil completo (transcript, embedding, evidencia) — es payload de más y
    // expone datos sin razón.
    const profileSummary = {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
    };

    const needs = (await getAllNeeds()).filter(isNeedOpen);
    if (needs.length === 0) {
      log.end({ status: 200, extra: { profileId, note: "no_needs" } });
      return NextResponse.json({ profile: profileSummary, opportunities: [], note: "no_needs" });
    }

    const decisions = await listDecisionsForProfile(profileId);
    const statusByNeed = new Map(
      decisions.map((d) => [
        d.needId,
        d.status === "interested" || d.status === "discarded" ? d.status : null,
      ])
    );

    const shortlistNeeds = needs
      .map((n) => ({ n, sim: cosineSimilarity(profile.embedding, n.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, RETURN_SIZE * 2);

    const opportunities: OpportunityMatch[] = [];
    let cachedCount = 0;
    let missingSnapshotCount = 0;
    let degradedCount = 0;

    for (const { n: need } of shortlistNeeds) {
      if (!need.id) continue;
      const snapshot = await getNeedMatches(need.id);
      if (!snapshot) {
        missingSnapshotCount++;
        continue;
      }
      cachedCount++;
      if (snapshot.rankingMode === "degraded") degradedCount++;

      const ours = snapshot.matches.find((m) => m.profileId === profileId);
      if (!ours) continue;

      opportunities.push({
        needId: need.id,
        companyName: need.companyName,
        role: need.role,
        ics: ours.ics,
        reason: ours.reason,
        breakdown: ours.breakdown,
        redFlag: ours.redFlag,
        topSkills: ours.topSkills,
        companyStatus: statusByNeed.get(need.id) ?? null,
      });
    }

    for (const d of decisions) {
      if (d.status !== "interested") continue;
      if (opportunities.some((o) => o.needId === d.needId)) continue;
      const need = await getNeed(d.needId);
      if (!need?.id) continue;
      opportunities.push({
        needId: need.id,
        companyName: need.companyName,
        role: need.role,
        ics: d.icsAtTime ?? 0,
        reason: "Una empresa marcó interés en tu perfil para esta búsqueda.",
        companyStatus: "interested",
      });
    }

    opportunities.sort((a, b) => {
      const aInt = a.companyStatus === "interested" ? 1 : 0;
      const bInt = b.companyStatus === "interested" ? 1 : 0;
      if (aInt !== bInt) return bInt - aInt;
      return b.ics - a.ics;
    });

    const interested = opportunities.filter((o) => o.companyStatus === "interested");
    const rest = opportunities
      .filter((o) => o.companyStatus !== "interested")
      .slice(0, Math.max(0, RETURN_SIZE - interested.length));
    const top = [...interested, ...rest];

    log.end({
      status: 200,
      extra: {
        profileId,
        needsTotal: needs.length,
        opportunitiesReturned: top.length,
        cachedCount,
        missingSnapshotCount,
        degradedCount,
      },
    });

    return NextResponse.json({
      profile: profileSummary,
      opportunities: top,
      ...(degradedCount > 0 && {
        warning:
          "Algunas oportunidades se calcularon con scoring heurístico. La precisión puede ser menor.",
      }),
    });
  } catch (err) {
    console.error("oportunidades error:", err);
    return NextResponse.json(
      { error: "No pudimos cargar oportunidades." },
      { status: 500 }
    );
  }
}
