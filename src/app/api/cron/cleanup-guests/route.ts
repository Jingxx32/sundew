import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { deleteUserData } from "@/lib/account/delete";
import { GUEST_CLEANUP_BATCH, GUEST_LIFETIME_DAYS } from "@/lib/access/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron (daily): deletes guests created more than GUEST_LIFETIME_DAYS ago. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response(null, { status: 401 });

  const cutoff = new Date(Date.now() - GUEST_LIFETIME_DAYS * 86_400_000);
  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
    .orderBy(asc(users.createdAt))
    .limit(GUEST_CLEANUP_BATCH);

  const totals: Record<string, number> = {};
  let failed = 0;
  for (const { id } of expired) {
    try {
      for (const [table, n] of Object.entries(await deleteUserData(id))) totals[table] = (totals[table] ?? 0) + n;
    } catch (error) {
      failed += 1;
      console.error("Guest cleanup failed", id, error);
    }
  }
  const summary = { deleted: expired.length - failed, failed, totals };
  console.info("guest cleanup", JSON.stringify(summary));
  return Response.json(summary);
}
