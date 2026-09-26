import type { TcfPerLevel } from "@/lib/db/schema";

export type ExamQuestion = { id: string; answer: number; options: string[]; level: string };
export type SubmittedExamAnswer = { questionId: string; chosen: number; correct?: boolean };

/** Server-owned exam scoring. The client's claimed verdict is deliberately ignored. */
export function gradeExamAnswers(questions: readonly ExamQuestion[], answers: readonly SubmittedExamAnswer[]) {
  if (questions.length === 0 || questions.length > 100 || answers.length > questions.length) {
    throw new Error("Invalid exam answers");
  }
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer]));
  if (answerMap.size !== answers.length) throw new Error("Duplicate exam answer");
  const questionIds = new Set(questions.map((question) => question.id));
  if (answers.some((answer) => !questionIds.has(answer.questionId))) throw new Error("Answer from another exam");
  const perLevel: TcfPerLevel = {};
  const graded = questions.flatMap((question) => {
    const entry = (perLevel[question.level] ??= { correct: 0, total: 0 });
    entry.total++;
    const answer = answerMap.get(question.id);
    if (!answer) return [];
    if (!Number.isInteger(answer.chosen) || answer.chosen < 0 || answer.chosen >= question.options.length) {
      throw new Error("Invalid exam choice");
    }
    const correct = answer.chosen === question.answer;
    if (correct) entry.correct++;
    return [{ questionId: question.id, chosen: answer.chosen, correct }];
  });
  return { graded, score: graded.filter((answer) => answer.correct).length,
    total: questions.length, perLevel };
}
