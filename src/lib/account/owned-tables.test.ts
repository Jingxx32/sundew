import assert from "node:assert/strict";
import test from "node:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { EXCLUDED_TABLES, OWNED_DELETE_ORDER, OWNED_TABLES, ownedEdges, parentsFirst } from "./owned-tables";

const owned = new Set(OWNED_TABLES.map((t) => t.name));
const allTables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));

test("every table that references an owned table is owned or excluded", () => {
  for (const table of allTables) {
    const { name, foreignKeys } = getTableConfig(table);
    if (owned.has(name) || name in EXCLUDED_TABLES) continue;
    for (const fk of foreignKeys) {
      const parent = getTableConfig(fk.reference().foreignTable).name;
      assert.ok(!owned.has(parent), `${name} references owned table ${parent}: add it to the registry or EXCLUDED_TABLES`);
    }
  }
});

test("every table with user_id is owned or excluded", () => {
  for (const table of allTables) {
    const { name, columns } = getTableConfig(table);
    if (columns.some((c) => c.name === "user_id")) assert.ok(owned.has(name) || name in EXCLUDED_TABLES, name);
  }
});

test("the registry covers personal data and quiz children, not shared or auth tables", () => {
  for (const name of ["documents", "submissions", "errors", "user_vocabulary", "quiz_sets", "quiz_passages", "quiz_questions", "invite_redemptions", "tcf_question_attempts", "speaking_turns"]) {
    assert.ok(owned.has(name), name);
  }
  for (const name of ["users", "sessions", "accounts", "invite_codes", "tcf_questions", "vocabulary_lookups", "rules"]) {
    assert.ok(!owned.has(name), name);
  }
});

test("delete order removes children before parents", () => {
  const position = new Map(OWNED_DELETE_ORDER.map((t, i) => [t.name, i]));
  for (const [child, parent] of ownedEdges(OWNED_TABLES)) {
    assert.ok(position.get(child)! < position.get(parent)!, `${child} must be deleted before ${parent}`);
  }
});

test("parentsFirst rejects a cycle", () => {
  assert.throws(() => parentsFirst(["a", "b"], [["a", "b"], ["b", "a"]]), /cycle/);
});
