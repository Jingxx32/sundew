import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeExamProgress, encodeExamProgress } from "./exam-progress";

const ids = ["q1", "q2", "q3"];

test("saved exam answers come back for the same questions", () => {
  assert.deepEqual(decodeExamProgress(encodeExamProgress(ids, { 0: 2, 2: 1 }), ids), { 0: 2, 2: 1 });
});

test("answers saved for a different question set are ignored", () => {
  assert.equal(decodeExamProgress(encodeExamProgress(["x", "y", "z"], { 0: 1 }), ids), null);
});

test("malformed or out-of-range entries never crash the exam", () => {
  assert.equal(decodeExamProgress("not json", ids), null);
  assert.equal(decodeExamProgress(null, ids), null);
  const raw = JSON.stringify({ ids, answers: { 0: 1, 1: 9, 7: 0, 2: "a" } });
  assert.deepEqual(decodeExamProgress(raw, ids), { 0: 1 });
});
