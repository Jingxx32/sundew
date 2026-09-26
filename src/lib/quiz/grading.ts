export type QuizAnswer = { questionId: string; answer: number | string; uncertain?: boolean };

export type GradableQuizQuestion = {
  id: string;
  type: "single" | "fill_blank";
  answer: unknown;
  options: string[] | null;
};

export function normalizeFillAnswer(value: string): string {
  return value.normalize("NFC").trim().toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function gradeQuizAnswers(questions: readonly GradableQuizQuestion[], answers: readonly QuizAnswer[]) {
  if (questions.length === 0 || questions.length > 200 || answers.length !== questions.length) {
    throw new Error("Invalid quiz submission");
  }
  const byId = new Map(answers.map((item) => [item.questionId, item]));
  if (byId.size !== questions.length) throw new Error("Duplicate or missing answer");
  return questions.map((question) => {
    const item = byId.get(question.id);
    if (!item) throw new Error("Answer does not match this quiz");
    let correct: boolean;
    if (question.type === "single") {
      if (typeof item.answer !== "number" || !Number.isInteger(item.answer) ||
          item.answer < 0 || item.answer >= (question.options?.length ?? 0) ||
          typeof question.answer !== "number") throw new Error("Invalid choice");
      correct = item.answer === question.answer;
    } else {
      if (typeof item.answer !== "string" || item.answer.length > 200) throw new Error("Invalid fill answer");
      const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
      if (!accepted.every((answer) => typeof answer === "string")) throw new Error("Invalid answer key");
      const given = normalizeFillAnswer(item.answer);
      correct = given !== "" && accepted.some((answer) => normalizeFillAnswer(answer) === given);
    }
    return { questionId: question.id, answer: item.answer, correct, uncertain: item.uncertain === true };
  });
}
