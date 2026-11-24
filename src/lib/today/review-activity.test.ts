import assert from "node:assert/strict";
import test from "node:test";
import { reviewActivity } from "./review-activity";

test("without TCF access the activity reviews words only", () => {
  const activity = reviewActivity({ canTcf: false, dueWords: 3, dueNotes: 5, activeNotes: 9 });
  assert.equal(activity.key, "notebook");
  assert.equal(activity.title, "Review due vocabulary");
  assert.equal(activity.detail, "3 words are due for review now.");
  assert.equal(activity.href, "/review/session");
  assert.deepEqual(activity.progress, { done: 0, target: 3 });
  assert.equal(activity.done, false);
});

test("an empty notebook keeps the vocabulary title and singular copy", () => {
  const activity = reviewActivity({ canTcf: true, dueWords: 1, dueNotes: 0, activeNotes: 0 });
  assert.equal(activity.title, "Review due vocabulary");
  assert.equal(activity.detail, "1 word is due for review now.");
});

test("due notebook cards join the words", () => {
  const activity = reviewActivity({ canTcf: true, dueWords: 2, dueNotes: 4, activeNotes: 6 });
  assert.equal(activity.title, "Review notebook and words");
  assert.equal(activity.detail, "2 words and 4 notebook cards are due now.");
  assert.equal(activity.href, "/review/session");
  assert.equal(activity.cta, "Start review");
  assert.equal(activity.progress?.target, 6);
});

test("nothing due is a done activity that points to vocabulary", () => {
  const activity = reviewActivity({ canTcf: true, dueWords: 0, dueNotes: 0, activeNotes: 6 });
  assert.equal(activity.done, true);
  assert.equal(activity.href, "/vocabulary");
  assert.equal(activity.cta, "View vocabulary");
  assert.equal(activity.detail, "Nothing is due right now.");
  assert.equal(activity.progress, undefined);
});
