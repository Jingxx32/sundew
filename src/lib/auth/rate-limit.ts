import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Fixed-window counter for app endpoints Better Auth does not cover, stored in
 * its rate_limits table under an "app:" key. Returns true when allowed.
 */
export async function consumeRateLimit(key: string, windowSeconds: number, max: number, now = Date.now()): Promise<boolean> {
  const windowStart = now - windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `app:${key}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.lastRequest} < ${windowStart} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${rateLimits.lastRequest} < ${windowStart} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= max;
}
