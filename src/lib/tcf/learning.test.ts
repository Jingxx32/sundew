import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveTcfLearningSummary, isTcfReviewDue, reviewReason } from "./learning";

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00Z`);
const attempt = (id: string, day: number, correct: boolean, uncertain = false) => ({ id, answeredAt: at(day), correct, uncertain });

test("counts an uncertain correct answer in accuracy but routes it to review", () => {
  const summary = deriveTcfLearningSummary([attempt("a", 18, true, true)]);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.uncertainCount, 1);
  assert.equal(summary.needsReview, true);
  assert.equal(summary.status, "needs_review");
  assert.equal(summary.nextReviewAt?.toISOString(), at(18).toISOString());
});

test("a confident streak becomes stable after three answers", () => {
  const summary = deriveTcfLearningSummary([
    attempt("a", 1, true),
    attempt("b", 5, true),
    attempt("c", 13, true),
  ]);
  assert.equal(summary.consecutiveConfidentCorrect, 3);
  assert.equal(summary.status, "stable");
  assert.equal(summary.nextReviewAt?.toISOString(), at(27).toISOString());
});

test("a wrong or uncertain latest answer breaks a prior confident streak", () => {
  const summary = deriveTcfLearningSummary([
    attempt("a", 1, true),
    attempt("b", 5, true),
    attempt("c", 13, false),
  ]);
  assert.equal(summary.consecutiveConfidentCorrect, 0);
  assert.equal(summary.status, "needs_review");
});

test("confidently correct questions become due after their scheduled interval", () => {
  const summary = deriveTcfLearningSummary([attempt("a", 1, true)]);
  assert.equal(summary.needsReview, false);
  assert.equal(isTcfReviewDue(summary, at(3)), false);
  assert.equal(isTcfReviewDue(summary, at(4)), true);
});

test("a review item says why it is there: the latest answer was wrong or a guess", () => {
  const base = { attemptCount: 1, correctCount: 0, uncertainCount: 0, lastAnsweredAt: new Date(), consecutiveConfidentCorrect: 0, nextReviewAt: null, status: "needs_review" as const, needsReview: true };
  assert.equal(reviewReason({ ...base, latestCorrect: false, latestUncertain: false }), "wrong");
  assert.equal(reviewReason({ ...base, latestCorrect: false, latestUncertain: true }), "wrong");
  assert.equal(reviewReason({ ...base, latestCorrect: true, latestUncertain: true }), "uncertain");
  assert.equal(reviewReason({ ...base, latestCorrect: true, latestUncertain: false }), null);
  assert.equal(reviewReason({ ...base, attemptCount: 0, lastAnsweredAt: null, latestCorrect: null, latestUncertain: null }), null);
});
