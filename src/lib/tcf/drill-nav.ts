import type { TcfQuestionForDrill } from "@/lib/actions/tcf";

export interface DrillNavEntry<Q> {
  question: Q;
  /** Position in the drill session, i.e. what `onSelect` expects. */
  index: number;
}

export interface DrillNavGroup<Q> {
  testNumber: number;
  entries: DrillNavEntry<Q>[];
}

/**
 * Lay a drill session out as one section per test paper.
 *
 * A round puts questions due for review first, so one test's questions are not
 * necessarily contiguous in the session. The nav is a map rather than the
 * running order, so each test gets exactly one section (sorted by test number,
 * then by the question's own number inside that test) and every entry keeps the
 * session index it jumps to.
 */
export function groupQuestionsByTest<Q extends Pick<TcfQuestionForDrill, "testNumber" | "orderIndex">>(
  questions: Q[],
): DrillNavGroup<Q>[] {
  const byTest = new Map<number, DrillNavEntry<Q>[]>();
  questions.forEach((question, index) => {
    const entries = byTest.get(question.testNumber) ?? [];
    entries.push({ question, index });
    byTest.set(question.testNumber, entries);
  });
  return [...byTest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([testNumber, entries]) => ({
      testNumber,
      entries: entries.sort((a, b) => a.question.orderIndex - b.question.orderIndex),
    }));
}
