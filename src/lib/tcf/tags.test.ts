import assert from "node:assert/strict";
import test from "node:test";
import { COMPREHENSION_TAG_IDS, COMPREHENSION_TAGS, isComprehensionTag } from "./tags";

test("the seven comprehension tags of the 2026-07-06 spec, in order", () => {
  assert.deepEqual([...COMPREHENSION_TAG_IDS], ["vocab", "syntax", "inference", "detail", "connectors", "numbers_time", "register_intent"]);
});

test("every tag has a label and a prompt", () => {
  for (const id of COMPREHENSION_TAG_IDS) {
    assert.ok(COMPREHENSION_TAGS[id].label.length > 0, id);
    assert.ok(COMPREHENSION_TAGS[id].prompt.length > 0, id);
  }
});

test("isComprehensionTag accepts ids only", () => {
  assert.equal(isComprehensionTag("inference"), true);
  assert.equal(isComprehensionTag("grammar"), false);
  assert.equal(isComprehensionTag(null), false);
});
