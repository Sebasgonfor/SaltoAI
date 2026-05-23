import { NextRequest, NextResponse } from "next/server";
import { cosineSimilarity } from "@/lib/embeddings";
import { getAllNeeds, getProfile } from "@/lib/db";
import { ICS_WEIGHTS } from "@/lib/types";
import type { CompanyNeed, ICSBreakdown, OpportunityMatch, Profile } from "@/lib/types";

export const runtime = "nodejs";

function clamp(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function computeICS(b: ICSBreakdown): number {
  const raw =
    ICS_WEIGHTS.skillsFit * b.skillsFit +
    ICS_WEIGHTS.behavioralFit * b.behavioralFit +
    ICS_WEIGHTS.learningSignal * b.learningSignal +
    ICS_WEIGHTS.contextFit * b.contextFit -
    b.penalties;
  return Math.round(clamp(raw));
}

function heuristicOpportunity(profile: Profile, need: CompanyNeed): OpportunityMatch {
  const norm = (s: string) => s.toLowerCase().trim();
  const reqSet = new Set(need.requiredSkills.map(norm));
  const traitSet = new Set(need.desiredTraits.map(norm));

  const skillMatches = profile.skills.filter((s) => {
    const n = norm(s);
    for (const r of reqSet) if (n.includes(r) || r.includes(n)) return true;
    return false;
  });
  const traitMatches = profile.traits.filter((t) => {
    const n = norm(t);
    for (const r of traitSet) if (n.includes(r) || r.includes(n)) return true;
    return false;
  });

  const skillsFit = clamp((skillMatches.length / Math.max(reqSet.size, 1)) * 100);
  const behavioralFit = clamp((traitMatches.length / Math.max(traitSet.size, 1)) * 100);
  const evText = profile.evidence.map((e) => e.quote).join(" ").toLowerCase();
  const learningSignal = clamp(/(aprend|sol[oa]|autodidacta|por mi cuenta)/.test(evText) ? 70 : 45);
  const contextFit = clamp(traitMatches.length > 0 ? 65 : 45);

  const ics = computeICS({
    skillsFit,
    behavioralFit,
    learningSignal,
    contextFit,
    penalties: 0,
  });

  const reason =
    skillMatches.length > 0
      ? `Encajas por ${skillMatches.slice(0, 2).join(" y ")} — alineado con lo que ${need.companyName} busca.`
      : `Buen encaje conductual con el contexto de ${need.companyName}; vale profundizar en entrevista.`;

  return {
    needId: need.id!,
    companyName: need.companyName,
    role: need.role,
    ics,
    reason,
  };
}

const RETURN_SIZE = 8;

export async function POST(req: NextRequest) {
  try {
    const { profileId } = (await req.json()) as { profileId: string };
    if (!profileId) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const profile = await getProfile(profileId);
    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    const needs = await getAllNeeds();
    if (needs.length === 0) {
      return NextResponse.json({ profile, opportunities: [], note: "no_needs" });
    }

    const ranked: OpportunityMatch[] = needs
      .map((need) => {
        const sim = cosineSimilarity(profile.embedding, need.embedding);
        const opp = heuristicOpportunity(profile, need);
        const simBoost = Math.round(sim * 15);
        return { ...opp, ics: clamp(opp.ics + simBoost) };
      })
      .sort((a, b) => b.ics - a.ics)
      .slice(0, RETURN_SIZE);

    return NextResponse.json({ profile, opportunities: ranked });
  } catch (err) {
    console.error("oportunidades error:", err);
    return NextResponse.json({ error: "No pudimos cargar oportunidades." }, { status: 500 });
  }
}
