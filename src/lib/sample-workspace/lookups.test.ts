import assert from "node:assert/strict";
import test from "node:test";
import { sampleLookupKey, tokenizeForLookups } from "./lookups";

test("keys normalize what a reader selects", () => {
  assert.equal(sampleLookupKey("L'École,"), "école");
  assert.equal(sampleLookupKey("« marché »"), "marché");
  assert.equal(sampleLookupKey("aujourd'hui"), "aujourd'hui");
  assert.equal(sampleLookupKey("Qu’il"), "il");
  assert.equal(sampleLookupKey("peut-être."), "peut-être");
});

test("the tokenizer yields distinct keys with the surface and its paragraph", () => {
  const items = tokenizeForLookups("Le marché ouvre à 8 h.\n\nL'école est près du marché.");
  assert.deepEqual(items.map((i) => i.key), ["le", "marché", "ouvre", "école", "est", "près", "du"]);
  const ecole = items.find((i) => i.key === "école")!;
  assert.equal(ecole.surface, "école");
  assert.equal(ecole.context, "L'école est près du marché.");
});
