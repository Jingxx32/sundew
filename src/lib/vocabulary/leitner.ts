/**
 * Pure Leitner scheduling and gap-upsert rules. No db or server-only imports,
 * so node:test can load it directly.
 */

/** Days until next review for box 1..5. Box 5 answered correctly → mastered. */
export const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;

export type GapSource = "lookup" | "feedback" | "manual" | "tutor";
type GapStatus = "active" | "mastered" | "dismissed";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `dueAt: null` means "keep the current value" (the card just became mastered). */
export function leitnerAfter(
  box: number,
  correct: boolean,
  now: Date,
): { box: number; status: "active" | "mastered"; dueAt: Date | null } {
  if (!correct) return { box: 1, status: "active", dueAt: new Date(now.getTime() + DAY_MS) };
  if (box >= 5) return { box: 5, status: "mastered", dueAt: null };
  const next = box + 1;
  return { box: next, status: "active", dueAt: new Date(now.getTime() + LEITNER_INTERVAL_DAYS[next - 1] * DAY_MS) };
}

/**
 * What an incoming gap signal does to the existing row:
 * - no row     → insert
 * - active     → refresh source only (repeat signals never reset progress); a tutor card resets
 * - mastered   → reset (forgot it)
 * - dismissed  → manual and tutor signals revive it; automatic ones respect the dismissal
 */
export function gapUpsertAction(
  status: GapStatus | null,
  source: GapSource,
): "insert" | "refresh-source" | "reset" | "noop" {
  if (status === null) return "insert";
  if (source === "tutor") return "reset";
  if (status === "active") return "refresh-source";
  if (status === "mastered") return "reset";
  return source === "manual" ? "reset" : "noop";
}
