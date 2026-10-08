import "server-only";

import { AuthenticationError, requireUser, type AuthenticatedUser } from "@/lib/auth/session";
import { canUse, type FeatureKey } from "./features";

/** For actions and route handlers: the user, or FEATURE_LOCKED unless they have full use. */
export async function requireFeature(key: FeatureKey): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (canUse(user.access, key) === true) return user;
  throw new AuthenticationError("FEATURE_LOCKED");
}
