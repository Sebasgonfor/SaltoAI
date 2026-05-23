import { NextResponse } from "next/server";
import { embed } from "@/lib/embeddings";
import { getProfile, upsertProfileWithId } from "@/lib/db";
import { SEED_PROFILES } from "@/lib/seed-data";

export const runtime = "nodejs";

function buildEmbeddingText(p: (typeof SEED_PROFILES)[number]["data"]): string {
  return [
    p.summary,
    "Habilidades: " + p.skills.join(", "),
    "Rasgos: " + p.traits.join(", "),
    "Evidencia: " + p.evidence.map((e) => `${e.skill} — ${e.quote}`).join(" | "),
  ].join("\n");
}

async function runSeed(force: boolean) {
  const results: { id: string; status: "created" | "skipped" }[] = [];
  for (const { id, data } of SEED_PROFILES) {
    const existing = await getProfile(id);
    if (existing && !force) {
      results.push({ id, status: "skipped" });
      continue;
    }
    const embedding = await embed(buildEmbeddingText(data));
    await upsertProfileWithId(id, {
      ...data,
      embedding,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    results.push({ id, status: "created" });
  }
  return results;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const results = await runSeed(force);
  return NextResponse.json({ ok: true, force, results });
}

export async function GET() {
  const results = await runSeed(false);
  return NextResponse.json({ ok: true, force: false, results });
}
