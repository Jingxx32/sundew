/** Who may use what. Pure data: imported by server guards and client UI alike. */
export type Access = "guest" | "full" | "admin";
export type GuestRule = boolean | "sample";

export const FEATURES = {
  tcf: { guest: false, label: "TCF Canada practice" },
  speaking: { guest: false, label: "Speaking lab" },
  quiz: { guest: false, label: "Quiz and cloze sets" },
  writing: { guest: false, label: "Writing feedback" },
  microDrill: { guest: false, label: "Targeted drills" },
  upload: { guest: false, label: "Adding your own texts" },
  lookup: { guest: "sample", label: "Word look-up" },
  enrich: { guest: false, label: "Detailed word entries" },
} as const satisfies Record<string, { guest: GuestRule; label: string }>;

export type FeatureKey = keyof typeof FEATURES;

/** `true` = full use; `"sample"` = only inside the sample workspace; `false` = locked. */
export function canUse(access: Access, key: FeatureKey): GuestRule {
  return access === "guest" ? FEATURES[key].guest : true;
}

export function deriveAccess(role: string | null | undefined, isAnonymous: boolean | null | undefined): Access {
  if (role === "admin") return "admin";
  return isAnonymous ? "guest" : "full";
}
