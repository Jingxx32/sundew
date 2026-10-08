import "server-only";

import { FeatureLocked } from "@/components/feature-locked";
import { requirePageUser } from "@/lib/auth/session";
import { canUse, type FeatureKey } from "./features";

/** For pages: null when allowed, otherwise the locked view to return instead of the page. */
export async function pageGate(key: FeatureKey): Promise<React.ReactElement | null> {
  const user = await requirePageUser();
  return canUse(user.access, key) === true ? null : <FeatureLocked feature={key} />;
}
