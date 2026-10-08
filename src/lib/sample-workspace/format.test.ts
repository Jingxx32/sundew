import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_TABLES, columnPlan, decodeFixture, encodeFixture, type FixtureRow } from "./format";

const plan = (name: string) => {
  const entry = SAMPLE_TABLES.find((t) => t.name === name);
  assert.ok(entry, `${name} is not a sample table`);
  return Object.fromEntries(columnPlan(entry.table).map((c) => [c.key, c]));
};

test("sample tables exclude exam, speaking and quiz content and operational tables", () => {
  const names = SAMPLE_TABLES.map((t) => t.name);
  for (const name of ["documents", "writing_tasks", "submissions", "errors", "user_vocabulary", "user_settings"]) assert.ok(names.includes(name), name);
  assert.ok(!names.some((n) => /^(tcf_|speaking_|quiz_)/.test(n)));
  assert.ok(!names.includes("invite_redemptions") && !names.includes("review_backfill_jobs"));
});

test("column plans classify keys, refs, timestamps and forbidden targets", () => {
  assert.equal(plan("documents").id.kind, "pk");
  assert.equal(plan("documents").userId.kind, "user");
  assert.equal(plan("documents").createdAt.kind, "timestamp");
  assert.equal(plan("documents").title.kind, "plain");
  assert.equal(plan("writing_tasks").documentId.kind, "ref");
  assert.equal(plan("practice_run_items").runId.kind, "ref"); // composite (user_id, run_id) foreign key
  assert.equal(plan("practice_run_items").attemptId.kind, "polymorphic");
  assert.equal(plan("user_settings").key.kind, "plain"); // composite natural key, no ref
  assert.equal(plan("vocabulary_occurrences").tcfQuestionId.forbiddenTarget, "tcf_questions");
});

const at = (iso: string) => new Date(iso);

test("round trip keeps relations, shifts timestamps and swaps the owner", () => {
  const rows = new Map<string, FixtureRow[]>([
    ["documents", [{ id: "d-old", userId: "author", title: "Le marché", content: "Texte.", createdAt: at("2026-10-04T12:00:00Z"), lastReadAt: null }]],
    ["writing_tasks", [{ id: "t-old", userId: "author", documentId: "d-old", promptEn: "Describe the market.", targetWords: ["marché"], targetGrammar: [], createdAt: at("2026-10-05T12:00:00Z") }]],
  ]);
  const fixture = encodeFixture(rows, { vocabularyLookups: [] }, at("2026-10-07T12:00:00Z"));
  assert.equal(fixture.tables.documents[0].id, "documents#1");
  assert.equal(fixture.tables.writing_tasks[0].documentId, "documents#1");
  assert.equal(fixture.tables.documents[0].createdAt, -3 * 86_400_000);
  assert.ok(!("userId" in fixture.tables.documents[0]));

  let n = 0;
  const { tables } = decodeFixture(fixture, "guest-1", at("2026-11-01T00:00:00Z"), () => `new-${++n}`);
  const doc = tables.find((t) => t.name === "documents")!.rows[0];
  const task = tables.find((t) => t.name === "writing_tasks")!.rows[0];
  assert.equal(task.documentId, doc.id);
  assert.equal(doc.userId, "guest-1");
  assert.equal((doc.createdAt as Date).toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(doc.lastReadAt, null);
  assert.deepEqual(task.targetWords, ["marché"]);
  assert.ok(tables.findIndex((t) => t.name === "documents") < tables.findIndex((t) => t.name === "writing_tasks"));
});

test("export refuses exam references and dangling refs", () => {
  const occurrence = { id: "o1", userId: "a", lemma: "x", surface: "x", sentenceContext: "", sourceType: "tcf", documentId: null, tcfQuestionId: "q1", createdAt: new Date() };
  assert.throws(() => encodeFixture(new Map([["vocabulary_occurrences", [occurrence]]]), { vocabularyLookups: [] }, new Date()), /tcf_questions/);
  const task = { id: "t1", userId: "a", documentId: "missing", promptEn: "", targetWords: [], targetGrammar: [], createdAt: new Date() };
  assert.throws(() => encodeFixture(new Map([["writing_tasks", [task]]]), { vocabularyLookups: [] }, new Date()), /no exported target/);
});

test("decode reports fixture keys the schema no longer has", () => {
  const fixture = { version: 1 as const, exportedAt: "2026-10-07T12:00:00.000Z", shared: { vocabularyLookups: [] }, tables: { documents: [{ id: "documents#1", title: "t", content: "c", createdAt: 0, droppedColumn: 1 }] } };
  assert.deepEqual(decodeFixture(fixture, "g", new Date(), () => "id").unknownKeys, ["documents.droppedColumn"]);
});
