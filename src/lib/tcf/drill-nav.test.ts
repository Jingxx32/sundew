import { test } from "node:test";
import assert from "node:assert/strict";

import { groupQuestionsByTest } from "./drill-nav";

const q = (testNumber: number, orderIndex: number) => ({ testNumber, orderIndex });

test("groups a session into one section per test, in test order", () => {
  const groups = groupQuestionsByTest([q(1, 9), q(1, 10), q(2, 5), q(3, 5)]);
  assert.deepEqual(
    groups.map((group) => [group.testNumber, group.entries.map((entry) => entry.question.orderIndex)]),
    [
      [1, [9, 10]],
      [2, [5]],
      [3, [5]],
    ],
  );
});

test("keeps the session index each entry jumps to", () => {
  const groups = groupQuestionsByTest([q(3, 5), q(1, 9), q(1, 10)]);
  assert.deepEqual(
    groups.map((group) => [group.testNumber, group.entries.map((entry) => entry.index)]),
    [
      [1, [1, 2]],
      [3, [0]],
    ],
  );
});

test("merges one test's questions even when the round scattered them", () => {
  // A review-due question is scheduled first, ahead of unseen ones from its own test.
  const groups = groupQuestionsByTest([q(2, 30), q(1, 9), q(2, 5), q(2, 6)]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1], {
    testNumber: 2,
    entries: [
      { question: q(2, 5), index: 2 },
      { question: q(2, 6), index: 3 },
      { question: q(2, 30), index: 0 },
    ],
  });
});

test("sorts test numbers numerically, not as strings", () => {
  const groups = groupQuestionsByTest([q(10, 1), q(9, 1), q(2, 1)]);
  assert.deepEqual(groups.map((group) => group.testNumber), [2, 9, 10]);
});

test("returns nothing for an empty session", () => {
  assert.deepEqual(groupQuestionsByTest([]), []);
});
