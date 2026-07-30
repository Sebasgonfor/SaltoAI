import { NextRequest, NextResponse } from "next/server";
import { listMicroTasksByCompany, listMicroTasksForProfileIds } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId")?.trim() ?? "";
  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  const aliasesParam = req.nextUrl.searchParams.get("aliases")?.trim() ?? "";

  if (!profileId && !companyId) {
    return NextResponse.json({ error: "profileId o companyId requerido" }, { status: 400 });
  }

  if (companyId) {
    const tasks = await listMicroTasksByCompany(companyId);
    return NextResponse.json({ tasks });
  }

  const aliases = aliasesParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const tasks = await listMicroTasksForProfileIds([profileId, ...aliases]);
  return NextResponse.json({ tasks });
}
