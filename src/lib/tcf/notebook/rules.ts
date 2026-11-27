import type { TcfNoteKind } from "@/lib/db/schema";
import type { ComprehensionTag } from "../tags";

export const NOTE_KINDS: readonly TcfNoteKind[] = ["vocabulary", "grammar", "hearing", "comprehension"];

export type NoteLine = {
  id: string;
  kind: TcfNoteKind;
  point: string;
  lemma: string | null;
  comprehensionTag: string | null;
  sourceLocator: string | null;
  createdAt: Date;
  /** Set by listNoteLines; lets callers count only active cards. */
  status?: "active" | "mastered" | "dismissed";
};

/** CO- locators are listening, CE- are reading (e.g. "CO-T13-Q30"). */
function locatorSkill(locator: string | null): "listening" | "reading" | null {
  if (locator?.startsWith("CO-")) return "listening";
  if (locator?.startsWith("CE-")) return "reading";
  return null;
}

/** Notes that fit this question best: tag match, then same skill, then the rest; newest first within each. */
export function rankNotesForQuestion(
  notes: NoteLine[],
  q: { skill: "listening" | "reading"; skillTags: string[] | null },
  limit = 8,
): NoteLine[] {
  const tags = new Set(q.skillTags ?? []);
  const tier = (n: NoteLine) =>
    n.comprehensionTag && tags.has(n.comprehensionTag) ? 0 : locatorSkill(n.sourceLocator) === q.skill ? 1 : 2;
  return [...notes]
    .sort((a, b) => tier(a) - tier(b) || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

const normalizeLemma = (s: string) => s.normalize("NFC").trim().toLowerCase();

export function findVocabularyDuplicate(notes: NoteLine[], lemma: string): NoteLine | null {
  const key = normalizeLemma(lemma);
  if (!key) return null;
  return notes.find((n) => n.kind === "vocabulary" && n.lemma !== null && normalizeLemma(n.lemma) === key) ?? null;
}

export function notebookCounts(notes: Pick<NoteLine, "kind" | "comprehensionTag">[]): {
  byKind: Record<TcfNoteKind, number>;
  byTag: Partial<Record<ComprehensionTag, number>>;
} {
  const byKind: Record<TcfNoteKind, number> = { vocabulary: 0, grammar: 0, hearing: 0, comprehension: 0 };
  const byTag: Partial<Record<ComprehensionTag, number>> = {};
  for (const n of notes) {
    byKind[n.kind] += 1;
    if (n.comprehensionTag) {
      const tag = n.comprehensionTag as ComprehensionTag;
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }
  return { byKind, byTag };
}
