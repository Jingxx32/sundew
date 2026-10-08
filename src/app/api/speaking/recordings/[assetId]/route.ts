import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingAssets } from "@/lib/db/schema";
import { AuthenticationError, authErrorStatus } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";
import { getRecording } from "@/lib/storage/speaking-recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  let user;
  try { user = await requireFeature("speaking"); }
  catch (error) {
    if (error instanceof AuthenticationError) return new Response(null, { status: authErrorStatus(error.code) });
    throw error;
  }
  const { assetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return new Response(null, { status: 404 });
  const [asset] = await db.select().from(speakingAssets).where(and(
    eq(speakingAssets.id, assetId),
    eq(speakingAssets.userId, user.id),
    isNull(speakingAssets.deletedAt),
    gt(speakingAssets.expiresAt, new Date()),
  )).limit(1);
  if (!asset) return new Response(null, { status: 404 });
  try {
    const body = await getRecording(asset.objectKey);
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
