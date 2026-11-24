import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeProposal, validateReviewItem, type Proposal } from "./schemas";
import type { NoteLine } from "../notebook/rules";

const existing: NoteLine[] = [
  { id: "n0", kind: "grammar", point: "bien que + subjonctif", lemma: null, comprehensionTag: null, sourceLocator: null, createdAt: new Date() },
  { id: "n1", kind: "vocabulary", point: "manquer à qqn", lemma: "manquer", comprehensionTag: null, sourceLocator: null, createdAt: new Date() },
];

const card = (over: Partial<NonNullable<Proposal["card"]>> = {}): NonNullable<Proposal["card"]> => ({
  kind: "vocabulary",
  comprehension_tag: "vocab",
  point: "se débrouiller",
  front: "Que veut dire « se débrouiller » ?",
  back: "To manage on one's own",
  lemma: "se débrouiller",
  by_ear: false,
  sentence: "Il se débrouille très bien.",
  ...over,
});
const proposal = (over: Partial<Proposal>): Proposal => ({ result: "card", duplicate_index: null, card: card(), ...over });

test("none stays none", () => {
  assert.deepEqual(normalizeProposal(proposal({ result: "none", card: null }), existing), { type: "none" });
});

test("duplicate resolves through the index; a bad index becomes none", () => {
  assert.deepEqual(normalizeProposal(proposal({ result: "duplicate", duplicate_index: 1, card: null }), existing), {
    type: "duplicate",
    noteId: "n1",
    point: "manquer à qqn",
  });
  assert.deepEqual(normalizeProposal(proposal({ result: "duplicate", duplicate_index: 7, card: null }), existing), { type: "none" });
  assert.deepEqual(normalizeProposal(proposal({ result: "duplicate", duplicate_index: null, card: null }), existing), { type: "none" });
});

test("a card becomes a draft", () => {
  const out = normalizeProposal(proposal({}), existing);
  assert.equal(out.type, "draft");
  if (out.type === "draft") {
    assert.equal(out.draft.lemma, "se débrouiller");
    assert.equal(out.draft.comprehensionTag, "vocab");
    assert.equal(out.draft.byEar, false);
  }
});

test("vocabulary needs a lemma and a repeated lemma is a duplicate", () => {
  assert.deepEqual(normalizeProposal(proposal({ card: card({ lemma: null }) }), existing), { type: "none" });
  assert.deepEqual(normalizeProposal(proposal({ card: card({ lemma: " Manquer " }) }), existing), {
    type: "duplicate",
    noteId: "n1",
    point: "manquer à qqn",
  });
});

test("a grammar card drops lemma, byEar and sentence; an empty point is none", () => {
  const out = normalizeProposal(proposal({ card: card({ kind: "grammar", by_ear: true }) }), existing);
  assert.equal(out.type, "draft");
  if (out.type === "draft") {
    assert.equal(out.draft.lemma, null);
    assert.equal(out.draft.byEar, false);
    assert.equal(out.draft.sentence, null);
  }
  assert.deepEqual(normalizeProposal(proposal({ card: card({ point: "  " }) }), existing), { type: "none" });
});

const item = { stem: "Quel mot avez-vous entendu ?", options: ["un chat", "un chapeau", "un chien", "un champ"], answer: 2, spoken: "J'ai vu un chien." };

test("validateReviewItem accepts a well-formed item", () => {
  assert.deepEqual(validateReviewItem(item, "hearing"), item);
  assert.equal(validateReviewItem(item, "vocabulary")?.spoken, null);
});

test("validateReviewItem rejects malformed items", () => {
  assert.equal(validateReviewItem({ ...item, options: item.options.slice(0, 3) }, "vocabulary"), null);
  assert.equal(validateReviewItem({ ...item, options: ["un chat", "Un Chat", "un chien", "un champ"] }, "vocabulary"), null);
  assert.equal(validateReviewItem({ ...item, answer: 4 }, "vocabulary"), null);
  assert.equal(validateReviewItem({ ...item, stem: "  " }, "vocabulary"), null);
  assert.equal(validateReviewItem({ ...item, spoken: null }, "hearing"), null);
  assert.equal(validateReviewItem(null, "vocabulary"), null);
});
