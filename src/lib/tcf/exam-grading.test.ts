import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeExamAnswers } from "./exam-grading";

const questions = [
  { id: "q1", answer: 2, options: ["a", "b", "c"], level: "A2" },
  { id: "q2", answer: 0, options: ["a", "b"], level: "B1" },
];

test("exam verdict and totals come from stored questions", () => {
  const result = gradeExamAnswers(questions, [
    { questionId: "q1", chosen: 2, correct: false },
  ]);
  assert.equal(result.score, 1);
  assert.equal(result.total, 2);
  assert.deepEqual(result.perLevel, { A2: { correct: 1, total: 1 }, B1: { correct: 0, total: 1 } });
  assert.deepEqual(result.graded[0], { questionId: "q1", chosen: 2, correct: true });
});

test("rejects unrelated, duplicate, and invalid choices", () => {
  assert.throws(() => gradeExamAnswers(questions, [{ questionId: "other", chosen: 1 }]));
  assert.throws(() => gradeExamAnswers(questions, [
    { questionId: "q1", chosen: 2 }, { questionId: "q1", chosen: 2 },
  ]));
  assert.throws(() => gradeExamAnswers(questions, [{ questionId: "q1", chosen: 3 }]));
});
