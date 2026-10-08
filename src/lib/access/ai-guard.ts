import "server-only";

import { AuthenticationError, getCurrentUser } from "@/lib/auth/session";

/** Last line of defence: a guest request must never reach a paid AI or speech API. */
export async function assertAiAllowed(): Promise<void> {
  const user = await getCurrentUser();
  if (user?.access === "guest") throw new AuthenticationError("FEATURE_LOCKED");
}
