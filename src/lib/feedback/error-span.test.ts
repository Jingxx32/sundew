import assert from "node:assert/strict";
import test from "node:test";
import { locateErrorSpan } from "./error-span";

const TEXT = "J'ai acheté des pommes. Il y avait beaucoup des gens.";
const SECOND_DES = TEXT.lastIndexOf("des ");

test("keeps a span that already matches the original", () => {
  const start = TEXT.indexOf("des ");
  assert.deepEqual(locateErrorSpan(TEXT, "des ", start, start + 4), {
    start,
    end: start + 4,
  });
});

test("resolves a repeated short original through its context sentence", () => {
  const span = locateErrorSpan(TEXT, "des ", 0, 3, "Il y avait beaucoup des gens");
  assert.deepEqual(span, { start: SECOND_DES, end: SECOND_DES + 4 });
});

test("finds a unique original when the offsets are wrong", () => {
  const start = TEXT.indexOf("pommes");
  assert.deepEqual(locateErrorSpan(TEXT, "pommes", 40, 46), {
    start,
    end: start + "pommes".length,
  });
});

test("falls back to the occurrence nearest the reported start without context", () => {
  const first = TEXT.indexOf("des ");
  assert.deepEqual(locateErrorSpan(TEXT, "des ", 0, 4), { start: first, end: first + 4 });
  assert.deepEqual(locateErrorSpan(TEXT, "des ", SECOND_DES - 2, SECOND_DES + 1), {
    start: SECOND_DES,
    end: SECOND_DES + 4,
  });
});

test("returns null when the original is not in the text", () => {
  assert.equal(locateErrorSpan(TEXT, "bananes", 0, 7), null);
});

test("returns the clamped span for an empty original", () => {
  assert.deepEqual(locateErrorSpan(TEXT, "", 10, 9999), { start: 10, end: TEXT.length });
});

test("ignores a context that is not in the text", () => {
  const start = TEXT.indexOf("pommes");
  assert.deepEqual(locateErrorSpan(TEXT, "pommes", 0, 1, "absent sentence"), {
    start,
    end: start + 6,
  });
});
