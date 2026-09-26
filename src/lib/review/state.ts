export const REVIEW_POLICY_VERSION = 1;
export const DAY = 86_400_000;
export const SOURCES = ["tcf", "quiz", "writing", "vocabulary", "conjugation"] as const;
export type ReviewSource = typeof SOURCES[number];
export type Management = "active" | "paused" | "archived";
export type Learning = "needs_practice" | "consolidating" | "stable";
export type Availability = "ready" | "feedback_pending" | "disputed" | "source_missing" | "unsupported";
export type Evidence = { id: string; at: Date; correct: boolean | null; uncertain: boolean; valid: boolean;
  independent: boolean; revealedAt?: Date | null; permitted?: boolean };

export function deriveReviewState(collectedAt: Date, evidence: readonly Evidence[], reveals: readonly Date[] = []) {
  let dueAt = collectedAt;
  let eligibleAfter = collectedAt;
  let successes = 0;
  const qualifying: string[] = [];
  let predecessor = "collected";
  const ordered = [...evidence].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  for (const event of ordered) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (!event.valid || event.correct === null || event.permitted === false) continue;
    if (!event.correct || event.uncertain) {
      successes = 0; dueAt = event.at; eligibleAfter = new Date(+event.at + DAY); predecessor = event.id;
      continue;
    }
    const lastReveal = Math.max(0, ...reveals.filter(date => +date <= +event.at).map(Number), event.revealedAt ? +event.revealedAt : 0);
    if (!event.independent || event.revealedAt || +event.at < +dueAt || +event.at < +eligibleAfter ||
      (lastReveal && +event.at < lastReveal + DAY)) continue;
    successes = Math.min(3, successes + 1);
    qualifying.push(`${predecessor}:${event.id}`); predecessor = event.id;
    dueAt = new Date(+event.at + [0, 3, 7, 14][successes] * DAY); eligibleAfter = dueAt;
  }
  return { learningState: (successes === 0 ? "needs_practice" : successes < 3 ? "consolidating" : "stable") as Learning,
    dueAt, eligibleAfter, successCount: successes, qualifying };
}

export function vocabularyState(gap: { box: number; status: string; dueAt: Date }) {
  return { learningState: (gap.status === "mastered" ? "stable" : gap.box === 1 ? "needs_practice" : "consolidating") as Learning,
    dueAt: gap.status === "mastered" ? null : gap.dueAt, eligibleAfter: null, successCount: 0 };
}

export function availability(reasons: readonly Availability[]): Availability {
  return (["source_missing", "unsupported", "disputed", "feedback_pending"] as const).find(s => reasons.includes(s)) ?? "ready";
}

export type ReviewCommand = "pause" | "resume" | "archive" | "restore" | "note" | "dispute" | "clear_dispute" | "reveal";
export function managementTransition(current: Management, command: ReviewCommand): Management {
  if (command === "pause") { if (current === "archived") throw new Error("INVALID_STATE"); return "paused"; }
  if (command === "resume") { if (current !== "paused") throw new Error("INVALID_STATE"); return "active"; }
  if (command === "restore") { if (current !== "archived") throw new Error("INVALID_STATE"); return "active"; }
  return command === "archive" ? "archived" : current;
}
