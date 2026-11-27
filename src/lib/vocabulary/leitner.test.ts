import assert from "node:assert/strict";
import test from "node:test";
import { gapUpsertAction, leitnerAfter } from "./leitner";

const now = new Date("2026-11-23T12:00:00Z");

test("correct moves up one box and waits that box's interval", () => {
  assert.deepEqual(leitnerAfter(1, true, now), { box: 2, status: "active", dueAt: new Date("2026-11-25T12:00:00Z") });
});
test("correct in box 5 masters the card", () => assert.deepEqual(leitnerAfter(5, true, now), { box: 5, status: "mastered", dueAt: null }));
test("wrong returns to box 1, due tomorrow", () => assert.deepEqual(leitnerAfter(3, false, now), { box: 1, status: "active", dueAt: new Date("2026-11-24T12:00:00Z") }));
test("gap upsert rules", () => {
  assert.equal(gapUpsertAction(null, "lookup"), "insert");
  assert.equal(gapUpsertAction("active", "lookup"), "refresh-source");
  assert.equal(gapUpsertAction("active", "tutor"), "reset");
  assert.equal(gapUpsertAction("mastered", "feedback"), "reset");
  assert.equal(gapUpsertAction("dismissed", "lookup"), "noop");
  assert.equal(gapUpsertAction("dismissed", "manual"), "reset");
  assert.equal(gapUpsertAction("dismissed", "tutor"), "reset");
});
test("existing sources keep today's behaviour", () => {
  for (const s of ["lookup", "feedback", "manual"] as const) {
    assert.equal(gapUpsertAction(null, s), "insert");
    assert.equal(gapUpsertAction("active", s), "refresh-source");
    assert.equal(gapUpsertAction("mastered", s), "reset");
  }
  assert.equal(gapUpsertAction("dismissed", "feedback"), "noop");
});
