import "server-only";

import { AuthenticationError, getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, peekRateLimit } from "@/lib/auth/rate-limit";
import { UserFacingError } from "@/lib/user-error";
import { AI_DAILY_LIMITS, AI_LIMIT_WINDOW_S, type AiBucket } from "./limits";

const aiLimitKey = (bucket: AiBucket, userId: string) => `ai:${bucket}:${userId}`;

/**
 * Last line of defence, run on every paid AI call: a guest request must never reach a paid AI
 * or speech API, and a member's call counts against their daily limit. Admins are not limited.
 */
export async function assertAiAllowed(bucket?: AiBucket): Promise<void> {
  const user = await getCurrentUser();
  if (user?.access === "guest") throw new AuthenticationError("FEATURE_LOCKED");
  if (!bucket || user?.access !== "full") return;
  if (!(await consumeRateLimit(aiLimitKey(bucket, user.id), AI_LIMIT_WINDOW_S, AI_DAILY_LIMITS[bucket]))) {
    throw new UserFacingError("AI_DAILY_LIMIT");
  }
}

/**
 * Up-front check for actions that save work or swallow AI failures: refuse before anything is
 * written, with a message the member understands. Does not count a call.
 */
export async function assertAiBudget(...buckets: AiBucket[]): Promise<void> {
  const user = await getCurrentUser();
  if (user?.access !== "full") return;
  for (const bucket of buckets) {
    if (!(await peekRateLimit(aiLimitKey(bucket, user.id), AI_LIMIT_WINDOW_S, AI_DAILY_LIMITS[bucket]))) {
      throw new UserFacingError("AI_DAILY_LIMIT");
    }
  }
}
