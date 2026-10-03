/**
 * Applies drizzle/0037_auth_foundation.sql out of band. The shared database is at
 * 0025 and 0026–0036 are deferred, so `npm run db:init` cannot reach 0037 yet.
 * The file is idempotent and deliberately NOT recorded in drizzle.__drizzle_migrations:
 * the migrator only applies files newer than the last recorded one, so recording 0037
 * would make it skip 0026–0036 forever.
 *
 *   node --import tsx scripts/apply-auth-migration.mts --rehearse   # apply, verify, roll back
 *   node --import tsx scripts/apply-auth-migration.mts --apply      # apply, verify, commit
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import postgres from "postgres";

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rehearse") ? "rehearse" : null;
assert(mode, "Pass --rehearse or --apply");
nextEnv.loadEnvConfig(process.cwd(), true);
assert(process.env.DATABASE_URL, "DATABASE_URL required");

const OWNER = "00000000-0000-4000-8000-000000000001";
const SAMPLE = ["documents", "submissions", "tcf_question_attempts", "user_vocabulary", "errors"];
const file = path.join(process.cwd(), "drizzle", "0037_auth_foundation.sql");
const statements = (await readFile(file, "utf8"))
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: (notice) => console.log("NOTICE", notice.message),
});
const rollback = new Error("REHEARSAL_ROLLBACK");

async function snapshot(tx: postgres.TransactionSql) {
  const [{ users }] = await tx<{ users: number }[]>`select count(*)::int as users from users`;
  const owned: Record<string, number> = {};
  for (const table of SAMPLE) {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)} where user_id = ${OWNER}`;
    owned[table] = n;
  }
  return { users, owned };
}

async function count(query: Promise<{ n: number }[]>) {
  return (await query)[0].n;
}

try {
  await sql.begin(async (tx) => {
    const before = await snapshot(tx);
    console.log("before", JSON.stringify(before));
    for (const statement of statements) await tx.unsafe(statement);
    const after = await snapshot(tx);
    console.log("after ", JSON.stringify(after));
    assert.deepEqual(after.owned, before.owned, "owner data changed");
    assert.equal(await count(tx<{ n: number }[]>`select count(*)::int as n from accounts where user_id = ${OWNER} and provider_id = 'google'`), 1, "owner Google account");
    assert.equal(await count(tx<{ n: number }[]>`select count(*)::int as n from pg_constraint where conname = 'users_email_unique'`), 1, "email unique");
    assert.equal(await count(tx<{ n: number }[]>`select count(*)::int as n from users where status = 'disabled' and not banned`), 0, "bans copied");
    console.log("development users remaining:", await count(tx<{ n: number }[]>`select count(*)::int as n from users where auth_issuer = 'development'`));
    for (const statement of statements) await tx.unsafe(statement);
    assert.deepEqual(await snapshot(tx), after, "a second run changed state");
    console.log("second run: no changes (idempotent)");
    if (mode === "rehearse") throw rollback;
  });
  console.log("APPLIED (committed)");
} catch (error) {
  if (error !== rollback) throw error;
  console.log("REHEARSED (rolled back)");
} finally {
  await sql.end();
}
