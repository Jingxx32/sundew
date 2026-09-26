import assert from "node:assert/strict";
import test from "node:test";
import { calendarDayDifference, startOfLocalWeek, zonedDateKey, zonedStartOfDay } from "./time-zone";

test("uses the learner's local date around UTC midnight", () => {
  const instant = new Date("2026-09-15T02:00:00Z");
  assert.equal(zonedDateKey(instant, "America/Toronto"), "2026-09-14");
  assert.equal(zonedDateKey(instant, "Asia/Shanghai"), "2026-09-15");
});

test("converts local midnight across daylight-saving offsets", () => {
  assert.equal(zonedStartOfDay("2026-01-15", "America/Toronto").toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(zonedStartOfDay("2026-07-15", "America/Toronto").toISOString(), "2026-07-15T04:00:00.000Z");
});

test("starts the local week on Monday", () => {
  assert.equal(startOfLocalWeek("2026-09-20", "America/Toronto").toISOString(), "2026-09-14T04:00:00.000Z");
});

test("compares calendar dates without daylight-saving drift", () => {
  assert.equal(calendarDayDifference("2026-03-07", "2026-03-09"), 2);
});
