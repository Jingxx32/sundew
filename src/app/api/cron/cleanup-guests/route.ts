import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { deleteUserData } from "@/lib/account/delete";
import { GUEST_CLEANUP_BATCH, GUEST_LIFETIME_DAYS } from "@/lib/access/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Hobby caps functions at 300 s; stop well before that. */
const TIME_BUDGET_MS = 240_000;

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Vercel Cron (daily): deletes guests created more than GUEST_LIFETIME_DAYS ago. */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  const cutoff = new Date(Date.now() - GUEST_LIFETIME_DAYS * 86_400_000);
  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
    .orderBy(asc(users.createdAt))
    .limit(GUEST_CLEANUP_BATCH);

  const totals: Record<string, number> = {};
  let deleted = 0;
  let failed = 0;
  let skipped = 0;
  let stoppedEarly = false;
  for (const { id } of expired) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    try {
      // Re-check each row right before deleting: it must still be an anonymous guest past the cutoff.
      const [still] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, id), eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
        .limit(1);
      if (!still) {
        skipped += 1;
        continue;
      }
      for (const [table, n] of Object.entries(await deleteUserData(id))) totals[table] = (totals[table] ?? 0) + n;
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error("Guest cleanup failed", id, error);
    }
  }
  const summary = { deleted, failed, skipped, stoppedEarly, totals };
  console.info("guest cleanup", JSON.stringify(summary));
  return Response.json(summary);
}
