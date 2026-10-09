/** Mock-exam answers by question position, as ExamRunner keeps them. */
export type ExamAnswers = Record<number, number>;

/** Stored with the question ids so answers never land on a re-imported or different test. */
export function encodeExamProgress(questionIds: string[], answers: ExamAnswers): string {
  return JSON.stringify({ ids: questionIds, answers });
}

/** Answers saved for exactly these questions, keeping only in-range choices; otherwise null. */
export function decodeExamProgress(raw: string | null, questionIds: string[]): ExamAnswers | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { ids, answers } = parsed as { ids?: unknown; answers?: unknown };
    if (!Array.isArray(ids) || ids.join("\n") !== questionIds.join("\n")) return null;
    if (typeof answers !== "object" || answers === null) return null;
    const restored: ExamAnswers = {};
    for (const [key, value] of Object.entries(answers)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < questionIds.length && Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3) {
        restored[index] = value as number;
      }
    }
    return restored;
  } catch {
    return null;
  }
}
