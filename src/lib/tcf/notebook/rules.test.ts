import { test } from "node:test";
import assert from "node:assert/strict";

import { findVocabularyDuplicate, notebookCounts, rankNotesForQuestion, type NoteLine } from "./rules";

let seq = 0;
const note = (over: Partial<NoteLine>): NoteLine => ({
  id: `n${++seq}`,
  kind: "vocabulary",
  point: "point",
  lemma: null,
  comprehensionTag: null,
  sourceLocator: null,
  createdAt: new Date(2026, 0, 1),
  ...over,
});

test("ranks tag matches first, then the same skill, then the rest newest first", () => {
  const tagged = note({ id: "tagged", comprehensionTag: "numbers_time", sourceLocator: "CE-T1-Q1", createdAt: new Date(2026, 0, 1) });
  const listeningNew = note({ id: "co-new", sourceLocator: "CO-T2-Q3", createdAt: new Date(2026, 2, 1) });
  const listeningOld = note({ id: "co-old", sourceLocator: "CO-T2-Q4", createdAt: new Date(2026, 1, 1) });
  const readingNew = note({ id: "ce-new", sourceLocator: "CE-T3-Q1", createdAt: new Date(2026, 5, 1) });
  const readingOld = note({ id: "ce-old", sourceLocator: "CE-T3-Q2", createdAt: new Date(2026, 4, 1) });
  const ranked = rankNotesForQuestion(
    [readingOld, listeningOld, tagged, readingNew, listeningNew],
    { skill: "listening", skillTags: ["numbers_time", "detail"] },
  );
  assert.deepEqual(ranked.map((n) => n.id), ["tagged", "co-new", "co-old", "ce-new", "ce-old"]);
});

test("caps the ranking at the limit and handles null skillTags", () => {
  const notes = Array.from({ length: 10 }, (_, i) => note({ createdAt: new Date(2026, 0, i + 1) }));
  assert.equal(rankNotesForQuestion(notes, { skill: "reading", skillTags: null }).length, 8);
  assert.equal(rankNotesForQuestion(notes, { skill: "reading", skillTags: null }, 3).length, 3);
});

test("finds a vocabulary duplicate by NFC, trimmed, lowercased lemma", () => {
  const verb = note({ id: "v", kind: "vocabulary", lemma: "manquer" });
  const grammar = note({ id: "g", kind: "grammar", lemma: "pourtant" });
  assert.equal(findVocabularyDuplicate([grammar, verb], " Manquer ")?.id, "v");
  assert.equal(findVocabularyDuplicate([grammar, verb], "pourtant"), null);
  const accented = note({ id: "a", kind: "vocabulary", lemma: "été" });
  assert.equal(findVocabularyDuplicate([accented], "été")?.id, "a");
});

test("counts notes by kind and by comprehension tag", () => {
  const counts = notebookCounts([
    { kind: "vocabulary", comprehensionTag: "vocab" },
    { kind: "vocabulary", comprehensionTag: null },
    { kind: "grammar", comprehensionTag: "vocab" },
    { kind: "hearing", comprehensionTag: "numbers_time" },
  ]);
  assert.deepEqual(counts.byKind, { vocabulary: 2, grammar: 1, hearing: 1, comprehension: 0 });
  assert.deepEqual(counts.byTag, { vocab: 2, numbers_time: 1 });
});
