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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Today's review activity: due words, then due notebook cards, in one session.
 * Without TCF access, or with an empty notebook, it is the words-only review it always was.
 */
export function reviewActivity(input: { canTcf: boolean; dueWords: number; dueNotes: number; activeNotes: number }): ReviewActivity {
  const words = input.dueWords;
  const notes = input.canTcf ? input.dueNotes : 0;
  const due = words + notes;
  const withNotebook = input.canTcf && input.activeNotes > 0;
  const detail =
    due === 0
      ? "Nothing is due right now."
      : notes === 0
        ? `${plural(words, "word is", "words are")} due for review now.`
        : words === 0
          ? `${plural(notes, "notebook card is", "notebook cards are")} due now.`
          : `${plural(words, "word", "words")} and ${plural(notes, "notebook card", "notebook cards")} are due now.`;
  return {
    key: "notebook",
    title: withNotebook ? "Review notebook and words" : "Review due vocabulary",
    detail,
    href: due > 0 ? "/review/session" : "/vocabulary",
    cta: due > 0 ? "Start review" : "View vocabulary",
    estimatedMinutes: notes > 0 ? 12 : 8,
    done: due === 0,
    progress: due > 0 ? { done: 0, target: due } : undefined,
  };
}
