/**
 * Exports the sample author's account to src/lib/sample-workspace/fixtures/workspace.json.
 *   npm run sample:export -- --email <sample author email>
 * Read-only. Aborts on exam, speaking or quiz data, or on any email address in the output.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const emailIndex = process.argv.indexOf("--email");
const email = emailIndex > -1 ? process.argv[emailIndex + 1] : undefined;
assert(email && !email.startsWith("--"), "Pass --email <sample author email>");

const { and, eq, inArray, sql } = await import("drizzle-orm");
const { db } = await import("../../src/lib/db");
const { users, vocabularyLookups } = await import("../../src/lib/db/schema");
const { OWNED_TABLES } = await import("../../src/lib/account/owned-tables");
const { FORBIDDEN_TABLE, SKIPPED_TABLES, encodeFixture } = await import("../../src/lib/sample-workspace/format");

const [author] = await db
  .select({ id: users.id })
  .from(users)
  .where(and(eq(sql`lower(${users.email})`, email.toLowerCase()), eq(users.isAnonymous, false)));
assert(author, `No account for ${email}`);

const rowsByTable = new Map<string, Record<string, unknown>[]>();
const blocked: string[] = [];
for (const { name, table, scope } of OWNED_TABLES) {
  const rows = await db.select().from(table).where(scope(author.id));
  if (FORBIDDEN_TABLE.test(name)) {
    if (rows.length) blocked.push(`${name}: ${rows.length}`);
  } else if (!SKIPPED_TABLES.has(name)) rowsByTable.set(name, rows);
}
assert(!blocked.length, `The sample author has exam, speaking or quiz data (${blocked.join(", ")}). Use a clean account.`);

const lemmaTables = ["user_vocabulary", "user_vocabulary_aliases", "vocabulary_occurrences", "vocabulary_gaps"];
const lemmas = [...new Set(lemmaTables.flatMap((name) => (rowsByTable.get(name) ?? []).map((row) => String(row.lemma))))];
const shared = {
  vocabularyLookups: lemmas.length
    ? await db.select({ lemma: vocabularyLookups.lemma, surface: vocabularyLookups.surface }).from(vocabularyLookups).where(inArray(vocabularyLookups.lemma, lemmas))
    : [],
};

const fixture = encodeFixture(rowsByTable, shared, new Date());
const text = JSON.stringify(fixture, null, 2) + "\n";
const leaked = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
assert(!leaked, `The export contains an email address (${leaked?.[0]}); remove it from the author's data first.`);

await writeFile(path.join(process.cwd(), "src/lib/sample-workspace/fixtures/workspace.json"), text);
console.table(Object.fromEntries(Object.entries(fixture.tables).map(([name, rows]) => [name, rows.length])));
console.log(`shared lemmas: ${shared.vocabularyLookups.length}`);
process.exit(0);
