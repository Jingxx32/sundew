import { test } from "node:test";
import assert from "node:assert/strict";

import { hasExplanationDetails, transcriptPanel } from "./reveal";

const REWRITTEN = "## Transcript\n- **A:** Bonjour.";

test("no transcript means no raw panel", () => {
  assert.equal(transcriptPanel({ transcript: null, explanation: REWRITTEN, explanationOpen: true }), "none");
});

test("a transcript without a rewritten section stays raw, open or closed", () => {
  for (const explanationOpen of [true, false]) {
    assert.equal(transcriptPanel({ transcript: "Bonjour.", explanation: "## Translation\nHello.", explanationOpen }), "raw");
    assert.equal(transcriptPanel({ transcript: "Bonjour.", explanation: null, explanationOpen }), "raw");
  }
});

test("a rewritten transcript replaces the raw one only once the explanation is open", () => {
  assert.equal(transcriptPanel({ transcript: "Bonjour.", explanation: REWRITTEN, explanationOpen: false }), "raw");
  assert.equal(transcriptPanel({ transcript: "Bonjour.", explanation: REWRITTEN, explanationOpen: true }), "none");
});

test("details exist only when there is meta content or an explanation", () => {
  assert.equal(hasExplanationDetails(null, null), false);
  assert.equal(hasExplanationDetails({ keyPoint: null, options: [null, "x"] }, null), true);
  assert.equal(hasExplanationDetails({ keyPoint: "k", options: [] }, null), true);
  assert.equal(hasExplanationDetails(null, "## Translation\nHi."), true);
});
