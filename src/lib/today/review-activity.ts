export type ReviewActivity = {
  key: "notebook";
  title: string;
  detail: string;
  href: string;
  cta: string;
  estimatedMinutes: number;
  done: boolean;
  progress?: { done: number; target: number };
};

/** What one review session loads: `getDueGapCards()` and `getDueNotebookCards()`. */
export const SESSION_WORD_LIMIT = 20;
export const SESSION_NOTE_LIMIT = 15;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line naming only the queues that have something due. */
export function reviewDueDetail(words: number, notes: number): string {
  if (words === 0 && notes === 0) return "Nothing is due right now.";
  if (notes === 0) return `${plural(words, "word is", "words are")} due for review now.`;
  if (words === 0) return `${plural(notes, "notebook card is", "notebook cards are")} due now.`;
  return `${plural(words, "word", "words")} and ${plural(notes, "notebook card", "notebook cards")} are due now.`;
}

/**
 * Today's review activity: due words, then due notebook cards, in one session.
 * Without TCF access, or with no notebook card due, it is the words-only review it always was.
 */
export function reviewActivity(input: { canTcf: boolean; dueWords: number; dueNotes: number; activeNotes: number }): ReviewActivity {
  const words = input.dueWords;
  const notes = input.canTcf ? input.dueNotes : 0;
  const due = words + notes;
  // Matches the session's heading; a notebook with nothing due still names itself once all is done.
  const withNotebook = notes > 0 || (due === 0 && input.canTcf && input.activeNotes > 0);
  const target = Math.min(words, SESSION_WORD_LIMIT) + Math.min(notes, SESSION_NOTE_LIMIT);
  return {
    key: "notebook",
    title: withNotebook ? "Review notebook and words" : "Review due vocabulary",
    detail: reviewDueDetail(words, notes),
    href: due > 0 ? "/review/session" : "/vocabulary",
    cta: due > 0 ? "Start review" : "View vocabulary",
    estimatedMinutes: notes > 0 ? 12 : 8,
    done: due === 0,
    progress: due > 0 ? { done: 0, target } : undefined,
  };
}
