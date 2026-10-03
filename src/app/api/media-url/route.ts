import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { quizPassages, quizSets, tcfQuestions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getPrivateMediaUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns a short-lived R2 URL only after the request passes app authentication. */
export async function GET(request: NextRequest) {
  const user = await requireUser();

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing media path." }, { status: 400 });
  // Speaking recordings require an asset-ID lookup and owner check. Do not sign
  // arbitrary paths, including legacy recordings once migrated from public/.
  if (/^\/?(?:media\/)?(?:private\/)?speaking\//.test(path)) {
    return NextResponse.json({ error: "Use authorized recording playback." }, { status: 403 });
  }

  if (!path.startsWith("/media/") || path.includes("..") || path.length > 1000) {
    return NextResponse.json({ error: "Media is unavailable." }, { status: 404 });
  }
  // Shared exam assets are available to approved learners; personal Quiz audio
  // must belong to the caller. Never sign an arbitrary private bucket object.
  const [shared, owned] = await Promise.all([
    db.select({ id: tcfQuestions.id }).from(tcfQuestions)
      .where(or(eq(tcfQuestions.audioPath, path), eq(tcfQuestions.imagePath, path))).limit(1),
    db.select({ id: quizSets.id }).from(quizSets)
      .innerJoin(quizPassages, eq(quizPassages.setId, quizSets.id))
      .where(and(eq(quizSets.userId, user.id), eq(quizPassages.audioUrl, path))).limit(1),
  ]);
  if (!shared.length && !owned.length) {
    return NextResponse.json({ error: "Media is unavailable." }, { status: 404 });
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
