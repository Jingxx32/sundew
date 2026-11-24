/** Comprehension tags — what a TCF question tests (2026-07-06 error-loop spec §3.3). */
export const COMPREHENSION_TAGS = {
  vocab: { label: "Vocabulary gap", prompt: "The answer depends on knowing a particular word or phrase." },
  syntax: { label: "Complex sentence", prompt: "The key information sits inside a complex construction (subordinate clause, passive, inversion)." },
  inference: { label: "Inference / implied meaning", prompt: "The answer is not stated outright and must be inferred from context." },
  detail: { label: "Detail lookup", prompt: "The information is stated explicitly; the task is to locate and match it quickly." },
  connectors: { label: "Logical connectors", prompt: "The question tests the logic of connectors such as pourtant, donc or bien que." },
  numbers_time: { label: "Numbers / time / dates", prompt: "The question tests hearing or reading numbers, times, dates or prices." },
  register_intent: { label: "Register / speaker intent", prompt: "The question tests who is speaking, to whom and why (the function of a notice, message or advert)." },
} as const satisfies Record<string, { label: string; prompt: string }>;

export type ComprehensionTag = keyof typeof COMPREHENSION_TAGS;

export const COMPREHENSION_TAG_IDS = Object.keys(COMPREHENSION_TAGS) as ComprehensionTag[];

export function isComprehensionTag(v: unknown): v is ComprehensionTag {
  return typeof v === "string" && (COMPREHENSION_TAG_IDS as readonly string[]).includes(v);
}
