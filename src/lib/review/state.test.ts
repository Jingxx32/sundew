import test from "node:test";
import assert from "node:assert/strict";
import { deriveReviewState, DAY, managementTransition, availability, vocabularyState, type Evidence } from "./state";
const start = new Date("2026-09-22T10:00:00Z");
const event = (id: string, day: number, correct: boolean, extra: Partial<Evidence> = {}): Evidence =>
  ({ id, at: new Date(+start + day * DAY), correct, valid: true, independent: true, uncertain: false, ...extra });
test("independent due events advance 3/7/14 days, not same-day repetition", () => {
  const rows = [event("wrong", 0, false), event("early", .01, true), event("1", 1, true), event("2", 4, true), event("3", 11, true)];
  const result = deriveReviewState(start, rows);
  assert.equal(result.learningState, "stable"); assert.equal(+result.dueAt, +start + 25 * DAY);
  assert.equal(result.qualifying.length, 3);
  assert.equal(deriveReviewState(start, [...rows, event("reset", 12, true, { uncertain: true })]).successCount, 0);
});
test("unverified, pending, revealed, paused and duplicate evidence cannot manufacture progress", () => {
  const rows = [event("x", 0, true), event("x", 4, true), event("unverified", 4, true, { independent: false }),
    event("pending", 4, true, { correct: null }), event("paused", 4, true, { permitted: false }),
    event("invalid", 4, true, { valid: false }), event("revealed", 4, true, { revealedAt: new Date(+start + 3 * DAY) })];
  assert.equal(deriveReviewState(start, rows).successCount, 1);
  assert.equal(deriveReviewState(start, [event("wrong", 0, false), event("correct", 1, true)], [new Date(+start + .9 * DAY)]).successCount, 0);
});
test("late feedback replay is chronological and timezone independent", () => {
  const rows = [event("a", 1, true), event("b", 4, false), event("c", 5, true)];
  assert.deepEqual(deriveReviewState(start, rows), deriveReviewState(start, [...rows].reverse()));
  assert.equal(+deriveReviewState(start, rows).dueAt, +start + 8 * DAY);
});
test("management and availability remain separate from learning and vocabulary boxes", () => {
  assert.throws(() => managementTransition("archived", "pause"), /INVALID_STATE/);
  assert.equal(managementTransition("archived", "restore"), "active");
  assert.equal(managementTransition("paused", "note"), "paused");
  assert.equal(availability(["disputed", "source_missing"]), "source_missing");
  assert.equal(vocabularyState({ status: "mastered", box: 5, dueAt: start }).dueAt, null);
});
