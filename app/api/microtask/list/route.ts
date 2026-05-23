import { NextRequest, NextResponse } from "next/server";
import { listMicroTasksByCompany, listMicroTasksByProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!profileId && !companyId) {
    return NextResponse.json({ error: "profileId o companyId requerido" }, { status: 400 });
  }
  const tasks = profileId
    ? await listMicroTasksByProfile(profileId)
    : await listMicroTasksByCompany(companyId!);
  return NextResponse.json({ tasks });
}
