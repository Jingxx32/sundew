"use client";

import { createContext, useContext } from "react";
import { canUse, type Access, type FeatureKey } from "@/lib/access/features";

// Defaults to "full": the server enforces access; this only shapes the UI.
const AccessContext = createContext<Access>("full");

export function AccessProvider({ access, children }: { access: Access; children: React.ReactNode }) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  return useContext(AccessContext);
}

/** True when this control should be disabled with an "Invite only" note. */
export function useFeatureLocked(key: FeatureKey): boolean {
  return canUse(useContext(AccessContext), key) !== true;
}
