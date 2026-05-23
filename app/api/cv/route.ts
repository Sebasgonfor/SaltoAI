import { NextRequest, NextResponse } from "next/server";
import { buildAtsCvHtml, buildAtsCvText, cvDownloadFilename } from "@/lib/cv-ats";
import { getProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const format = req.nextUrl.searchParams.get("format") || "txt";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const profile = await getProfile(id);
  if (!profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const filename = cvDownloadFilename(profile);

  if (format === "html") {
    const html = buildAtsCvHtml(profile);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename.replace(".txt", ".html")}"`,
      },
    });
  }

  const text = buildAtsCvText(profile);
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
