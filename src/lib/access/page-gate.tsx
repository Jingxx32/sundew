import "server-only";

import { FeaturePreview } from "@/components/feature-preview";
import { requirePageUser } from "@/lib/auth/session";
import { canUse, type FeatureKey } from "./features";

/** For pages: null when allowed, otherwise the guest preview to return instead of the page. */
export async function pageGate(key: FeatureKey): Promise<React.ReactElement | null> {
  const user = await requirePageUser();
  return canUse(user.access, key) === true ? null : <FeaturePreview feature={key} />;
}
