import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeEvent, parseEvents } from "./ndjson";

test("round trip", () => {
  const line = encodeEvent({ type: "delta", text: "Tu me manques\n— «ok»" });
  assert.deepEqual(parseEvents(line), { events: [{ type: "delta", text: "Tu me manques\n— «ok»" }], rest: "" });
});

test("a chunk split mid-line keeps the tail", () => {
  const all = encodeEvent({ type: "delta", text: "a" }) + encodeEvent({ type: "done", messageId: "m1" });
  const cut = all.length - 5;
  const first = parseEvents(all.slice(0, cut));
  assert.deepEqual(first.events, [{ type: "delta", text: "a" }]);
  assert.deepEqual(parseEvents(first.rest + all.slice(cut)).events, [{ type: "done", messageId: "m1" }]);
});

test("a malformed line is skipped, not fatal", () => {
  const out = parseEvents(`not json\n${encodeEvent({ type: "error" })}`);
  assert.deepEqual(out, { events: [{ type: "error" }], rest: "" });
});
