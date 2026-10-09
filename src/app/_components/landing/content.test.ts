import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import { FEATURE_CARDS, featureTag } from "./content";

test("cards a guest can open say so, unless guest access is off", () => {
  assert.equal(featureTag({ inGuestTour: true }, true), "In the guest tour");
  assert.equal(featureTag({ inGuestTour: true }, false), "For members");
  assert.equal(featureTag({ inGuestTour: false }, true), "Invite only");
  assert.equal(featureTag({ inGuestTour: false }, false), "Invite only");
});

test("guest-visible cards come first", () => {
  const firstLocked = FEATURE_CARDS.findIndex((card) => !card.inGuestTour);
  assert.ok(FEATURE_CARDS.slice(firstLocked).every((card) => !card.inGuestTour));
});

test("the writing card's taxonomy numbers come from the taxonomy itself", () => {
  const categories = Object.values(ERROR_TAXONOMY);
  const types = categories.reduce((n, c) => n + Object.keys(c.subcategories).length, 0);
  const writing = FEATURE_CARDS.find((card) => card.key === "writing");
  assert.ok(writing?.body.includes(`${categories.length}-category`));
  assert.ok(writing?.body.includes(`${types} error types`));
});
