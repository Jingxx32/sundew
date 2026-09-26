import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getPrivateMediaUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns a short-lived R2 URL only after the request passes app authentication. */
export async function GET(request: NextRequest) {
  await requireUser();

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing media path." }, { status: 400 });
  // Speaking recordings require an asset-ID lookup and owner check. Do not sign
  // arbitrary paths, including legacy recordings once migrated from public/.
  if (/^\/?(?:media\/)?(?:private\/)?speaking\//.test(path)) {
    return NextResponse.json({ error: "Use authorized recording playback." }, { status: 403 });
  }

  try {
    const url = await getPrivateMediaUrl(path);
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Failed to create private media URL", error);
    return NextResponse.json({ error: "Media is unavailable." }, { status: 404 });
  }
}
