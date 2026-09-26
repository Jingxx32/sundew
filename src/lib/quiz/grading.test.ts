import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeQuizAnswers } from "./grading";

const questions = [
  { id: "choice", type: "single" as const, answer: 1, options: ["a", "b", "c"] },
  { id: "blank", type: "fill_blank" as const, answer: ["école", "ecole"], options: null },
];

test("grades submitted quiz answers against stored answer keys", () => {
  const graded = gradeQuizAnswers(questions, [
    { questionId: "choice", answer: 0, uncertain: true },
    { questionId: "blank", answer: "École." },
  ]);
  assert.deepEqual(graded.map(({ correct, uncertain }) => ({ correct, uncertain })), [
    { correct: false, uncertain: true },
    { correct: true, uncertain: false },
  ]);
});

test("rejects omitted, duplicated, unrelated, or invalid choices", () => {
  assert.throws(() => gradeQuizAnswers(questions, [{ questionId: "choice", answer: 1 }]));
  assert.throws(() => gradeQuizAnswers(questions, [
    { questionId: "choice", answer: 1 }, { questionId: "choice", answer: 1 },
  ]));
  assert.throws(() => gradeQuizAnswers(questions, [
    { questionId: "choice", answer: 1 }, { questionId: "other", answer: "école" },
  ]));
  assert.throws(() => gradeQuizAnswers(questions, [
    { questionId: "choice", answer: 99 }, { questionId: "blank", answer: "école" },
  ]));
});
