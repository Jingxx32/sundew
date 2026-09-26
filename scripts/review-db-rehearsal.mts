/**
 * Real PostgreSQL rehearsal. No environment loading or application DB singleton.
 * Requires a fresh, explicitly provisioned local database and dedicated test role.
 * Run: node --import tsx scripts/review-db-rehearsal.mts --expected-database NAME --output DIR [--pg-bin DIR]
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { parse as parseEnv } from "dotenv";
import { validateTarget, failureCategory } from "./review-rehearsal/safety.mjs";
import { seed, seedLexicon, A, B, GAP_A, LEGACY_EXAM, TCF_Q } from "./review-rehearsal/fixtures.mjs";
import { actionChecks, type Check } from "./review-rehearsal/actions.mjs";

const { values } = parseArgs({ options: {
  "expected-database": { type: "string" }, output: { type: "string" }, "pg-bin": { type: "string" },
} });
assert(values["expected-database"] && values.output, "--expected-database and --output are required");
const expected = values["expected-database"];
const target = validateTarget(process.env.REVIEW_TEST_DATABASE_URL, expected, process.env.DATABASE_URL);
// Read only configured URLs to refuse a business endpoint; never load them into process.env.
for (const filename of [".env", ".env.local"]) {
  const text = await readFile(filename, "utf8").catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return ""; throw e; });
  const configured = parseEnv(text).DATABASE_URL;
  if (configured) validateTarget(target.href, expected, configured);
}
const output = path.resolve(values.output);
await mkdir(output, { recursive: true, mode: 0o700 });
// Refuse report overwrite so every attempted run retains its own evidence.
await writeFile(path.join(output, "run.lock"), randomUUID(), { flag: "wx", mode: 0o600 });
const scratch = await mkdtemp(path.join(tmpdir(), "sundew-review-migrations-"));
const marker = randomUUID();
const connections: postgres.Sql[] = [];
type Result = { id: string; expected: string; status: "passed" | "failed" | "not_run"; actual: string; elapsedMs?: number };
const results: Result[] = [];
const counts: Array<{ database: string; table: string; count: number }> = [];
const manifest: Record<string, unknown> = { marker, fixtureVersion: 1, startedAt: new Date().toISOString(),
  host: target.hostname, port: target.port, database: expected, databaseRole: decodeURIComponent(target.username),
  boundaryStubs: ["authentication identity (not middleware)", "Next cache invalidation", "AI provider", "unused PDF/import/lookup"],
  productionDatabaseAccess: false };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function connect(database: string, label: string, max = 4) {
  const url = new URL(target); url.pathname = `/${database}`;
  const client = postgres(url.href, { max, connect_timeout: 5, idle_timeout: 5, onnotice: () => {},
    connection: { application_name: `review-test-${label}`, statement_timeout: 15000, lock_timeout: 10000, timezone: "UTC" } });
  connections.push(client); return client;
}
const primary = connect(expected, "empty");
function failureDetail(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown failure";
  return `${failureCategory(error)}: ${message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").replace(/\s+/g, " ").slice(0, 600)}`;
}
async function checkpoint() {
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
const check: Check = async (id, expectedResult, work) => {
  const start = Date.now();
  try { await work(); results.push({ id, expected: expectedResult, status: "passed", actual: expectedResult, elapsedMs: Date.now() - start }); }
  catch (error) { results.push({ id, expected: expectedResult, status: "failed", actual: failureDetail(error), elapsedMs: Date.now() - start }); }
  await checkpoint();
  console.log(`${results.at(-1)!.status}: ${id}`);
};
const notRun = (id: string, reason: string) => results.push({ id, expected: id, status: "not_run", actual: reason });

async function assertFresh(sql: postgres.Sql, name: string) {
  const [identity] = await sql`select current_database() as db, current_user as role, inet_server_addr()::text as address, version() as version`;
  assert.equal(identity.db, name); assert.equal(identity.role, decodeURIComponent(target.username));
  assert(["127.0.0.1/32", "127.0.0.1", "::1/128", "::1"].includes(identity.address));
  const objects = await sql`select nspname from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%'
    union all select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')
    union all select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d')`;
  assert.equal(objects.length, 0, "Target must be empty");
  manifest.postgresVersion = identity.version;
}
async function mark(sql: postgres.Sql) {
  await sql`create schema review_rehearsal`;
  await sql`create table review_rehearsal.marker (value uuid primary key)`;
  await sql`insert into review_rehearsal.marker values (${marker})`;
}
async function createSibling(suffix: string) {
  const name = `${expected}_${suffix}`;
  await primary`create database ${primary(name)}`;
  const client = connect(name, suffix);
  await assertFresh(client, name);
  return { name, sql: client };
}
async function snapshot(sql: postgres.Sql) {
  const tables = await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  const data: Record<string, Array<Record<string, unknown>>> = {};
  for (const { tablename } of tables) {
    const rows = await sql`select to_jsonb(t) as data from ${sql(tablename)} t order by to_jsonb(t)::text`;
    data[tablename] = rows.map(row => row.data);
  }
  return data;
}
async function schemaSnapshot(sql: postgres.Sql) {
  return {
    // pg_dump compacts physical attnum gaps left by DROP COLUMN. Compare live
    // column order and definitions, not those internal storage slot numbers.
    columns: await sql`select table_schema,table_name,column_name,data_type,udt_schema,udt_name,is_nullable,column_default
      from information_schema.columns where table_schema in ('public','drizzle') order by table_schema,table_name,ordinal_position`,
    constraints: await sql`select n.nspname,c.relname,con.conname,pg_get_constraintdef(con.oid) as definition
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','drizzle') order by n.nspname,c.relname,con.conname`,
    indexes: await sql`select schemaname,tablename,indexname,indexdef from pg_indexes
      where schemaname in ('public','drizzle') order by schemaname,tablename,indexname`,
  };
}
function assertPreserved(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
  for (const [table, rows] of Object.entries(before)) {
    const fields = rows[0] ? Object.keys(rows[0]) : [];
    const normalize = (items: Array<Record<string, unknown>>) => items.map(row => JSON.stringify(Object.fromEntries(fields.map(k => [k,row[k]])))).sort();
    assert.deepEqual(normalize(after[table]), normalize(rows), `Legacy values changed: ${table}`);
  }
}
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: Array<{ idx: number; tag: string; when: number }> };
async function migrationCopy(name: string, last: number, injected?: string) {
  const folder = path.join(scratch, name); await mkdir(path.join(folder, "meta"), { recursive: true });
  const entries = journal.entries.filter(entry => entry.idx <= last);
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) await cp(`drizzle/${entry.tag}.sql`, path.join(folder, `${entry.tag}.sql`));
  if (injected) {
    const filename = path.join(folder, `${entries.find(e => e.idx === 30)!.tag}.sql`);
    await writeFile(filename, `${await readFile(filename, "utf8")}\n--> statement-breakpoint\n${injected}`);
  }
  return folder;
}
async function ledger(sql: postgres.Sql, folder: string) {
  const rows = await sql`select hash,created_at from drizzle.__drizzle_migrations order by created_at`;
  const files = readMigrationFiles({ migrationsFolder: folder });
  assert.deepEqual(rows.map(r => ({ hash: r.hash, when: Number(r.created_at) })), files.map(f => ({ hash: f.hash, when: f.folderMillis })));
}
async function waitFor(sql: postgres.Sql, predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, "Barrier timeout");
    await sql`select pg_sleep(0.02)`;
  }
}

try {
  assert(journal.entries.some(e => e.idx === 32), "Missing migration 0032");
  await assertFresh(primary, expected); await mark(primary);
  manifest.commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  manifest.trackedDiffSha256 = digest(execFileSync("git", ["diff", "HEAD"], { encoding: "utf8", maxBuffer: 20_000_000 }));
  manifest.untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n");
  manifest.migrations = await Promise.all(journal.entries.map(async e => ({ ...e, sha256: digest(await readFile(`drizzle/${e.tag}.sql`, "utf8")) })));
  const baseline = await migrationCopy("baseline", 28);
  const full = await migrationCopy("full", 32);
  const hardened = await migrationCopy("hardened", journal.entries.at(-1)!.idx);
  const faulty = await migrationCopy("fault", 32, "SELECT 1 / 0;");
  const blocked = await migrationCopy("blocked", 32, "SELECT pg_advisory_xact_lock(91922);");
  await check("empty-migration-rerun", "Complete journal through 0032 applies to empty DB; rerun changes no data or ledger", async () => {
    await migrate(drizzle(primary), { migrationsFolder: full }); await ledger(primary, full);
    const before = await snapshot(primary);
    await migrate(drizzle(primary), { migrationsFolder: full }); await ledger(primary, full);
    assert.deepEqual(await snapshot(primary), before);
  });
  const populated = await createSibling("pop"); await mark(populated.sql);
  await migrate(drizzle(populated.sql), { migrationsFolder: baseline });
  await seedLexicon(populated.sql); await seed(populated.sql);
  const before = await snapshot(populated.sql);
  const baselineSchema = await schemaSnapshot(populated.sql);
  manifest.baselineDataSha256 = digest(JSON.stringify(before));
  manifest.baselineSchemaSha256 = digest(JSON.stringify(baselineSchema));
  const restore = await createSibling("restore");
  const dump = path.join(scratch, "baseline.dump");
  if (values["pg-bin"]) {
    await check("baseline-dump-restore", "Restore actual pg_dump into a second DB and compare baseline data and ledger", async () => {
      const options = { env: { NODE_ENV: "test" as const, PATH: process.env.PATH, PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: "5" }, stdio: "pipe" as const };
      const common = ["--host", target.hostname, "--port", target.port, "--username", decodeURIComponent(target.username), "--no-password"];
      execFileSync(path.join(values["pg-bin"]!, "pg_dump"), [...common, "--format=custom", "--file", dump, populated.name], options);
      execFileSync(path.join(values["pg-bin"]!, "pg_restore"), [...common, "--exit-on-error", "--no-owner", "--dbname", restore.name, dump], options);
      assert.deepEqual(await snapshot(restore.sql), before); await ledger(restore.sql, baseline);
      assert.deepEqual(await schemaSnapshot(restore.sql), baselineSchema);
      await migrate(drizzle(restore.sql), { migrationsFolder: full }); await ledger(restore.sql, full);
      assertPreserved(before, await snapshot(restore.sql));
    });
  } else notRun("baseline-dump-restore", "Provide --pg-bin containing matching pg_dump and pg_restore");
  await check("populated-migration-rerun", "0029–0032 preserve all old fields and timestamps; new logs are empty; rerun is unchanged", async () => {
    await migrate(drizzle(populated.sql), { migrationsFolder: full }); await ledger(populated.sql, full);
    const after = await snapshot(populated.sql); assertPreserved(before, after);
    assert.equal(after.quiz_question_attempts.length, 0); assert.equal(after.vocabulary_review_attempts.length, 0);
    assert(after.micro_drills.every(r => r.feedback_status === "ready" && r.request_key === null));
    assert(after.tcf_question_attempts.every(r => r.grade_version === null));
    await migrate(drizzle(populated.sql), { migrationsFolder: full }); await ledger(populated.sql, full);
    assert.deepEqual(await snapshot(populated.sql), after);
  });
  const recovery = await createSibling("recovery"); await mark(recovery.sql);
  await migrate(drizzle(recovery.sql), { migrationsFolder: baseline });
  await check("migration-failure-rollback", "Failure after pending DDL leaves baseline schema and ledger; unmodified retry succeeds", async () => {
    await assert.rejects(migrate(drizzle(recovery.sql), { migrationsFolder: faulty }));
    await ledger(recovery.sql, baseline);
    assert.equal((await recovery.sql`select to_regclass('public.quiz_question_attempts') as name`)[0].name, null);
  });
  await check("migration-connection-termination", "Terminate a blocked migrator; inspect rollback and retry successfully", async () => {
    const locker = connect(recovery.name, "migration-lock", 1);
    await locker`select pg_advisory_lock(91922)`;
    const workerUrl = new URL(target); workerUrl.pathname = `/${recovery.name}`;
    const worker = spawn(process.execPath, ["--import", "tsx", "scripts/review-rehearsal/migration-worker.mts", recovery.name, blocked], {
      env: { ...process.env, REVIEW_TEST_DATABASE_URL: workerUrl.href }, stdio: "ignore",
    });
    const pending = new Promise<number | null>((resolve, reject) => { worker.once("exit", resolve); worker.once("error", reject); });
    try {
      await waitFor(recovery.sql, async () => (await recovery.sql`select pid from pg_stat_activity where datname=${recovery.name} and application_name='review-test-migration-worker' and wait_event='advisory'`).length === 1);
      await recovery.sql`select pg_terminate_backend(pid) from pg_stat_activity where datname=${recovery.name} and application_name='review-test-migration-worker'`;
      assert.notEqual(await pending, 0);
    } finally { await locker`select pg_advisory_unlock(91922)`; if (worker.exitCode === null) worker.kill(); await pending; }
    await ledger(recovery.sql, baseline);
    assert.equal((await recovery.sql`select to_regclass('public.quiz_question_attempts') as name`)[0].name, null);
    await migrate(drizzle(recovery.sql), { migrationsFolder: full }); await ledger(recovery.sql, full);
  });
  await check("hardening-rejects-invalid-history", "New ownership constraints refuse invalid history without partial DDL; repair is explicit", async () => {
    await seedLexicon(recovery.sql); await seed(recovery.sql);
    await recovery.sql`insert into micro_drills (id,user_id,error_id,prompt_text,response_fr) values ('invalid-history',${B},'error-a','Synthetic','Synthetic')`;
    await assert.rejects(migrate(drizzle(recovery.sql), { migrationsFolder: hardened }), (error: unknown) => failureCategory(error) === "23503");
    await ledger(recovery.sql, full);
    assert.equal(Number((await recovery.sql`select count(*) as n from pg_constraint where conname='errors_user_id_id_key'`)[0].n), 0);
    await recovery.sql`delete from micro_drills where id='invalid-history'`;
    await migrate(drizzle(recovery.sql), { migrationsFolder: hardened }); await ledger(recovery.sql, hardened);
  });
  await check("additive-ownership-hardening", "Latest additive constraints apply and rerun on both empty and populated databases without changing history", async () => {
    for (const sql of [primary, populated.sql]) {
      const before = await snapshot(sql);
      await migrate(drizzle(sql), { migrationsFolder: hardened }); await ledger(sql, hardened);
      const after = await snapshot(sql); assertPreserved(before, after);
      assert(after.conjugation_attempts.every(row => row.request_key === null));
      await migrate(drizzle(sql), { migrationsFolder: hardened }); await ledger(sql, hardened);
      assert.deepEqual(await snapshot(sql), after);
    }
  });
  // Real cross-connection barrier: a DB trigger blocks the first writer while another is in flight.
  const locker = connect(populated.name, "answer-lock", 1);
  await populated.sql`create function review_test_barrier() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(91921); return NEW; end $$`;
  async function barrier(table: string, work: () => Promise<unknown>) {
    await populated.sql`create trigger review_test_barrier before insert on ${populated.sql(table)} for each row execute function review_test_barrier()`;
    await locker`select pg_advisory_lock(91921)`;
    const pending = work().then(value => ({ value }), error => ({ error }));
    let barrierError: unknown;
    try {
      await waitFor(primary, async () => Number((await primary`select count(*) as n from pg_stat_activity where datname=${populated.name} and wait_event_type='Lock' and state='active'`)[0].n) >= 2);
    } catch (error) { barrierError = error; }
    finally { await locker`select pg_advisory_unlock(91921)`; }
    try { const result = await pending; if ("error" in result) throw result.error; if (barrierError) throw barrierError; }
    finally { await populated.sql`drop trigger review_test_barrier on ${populated.sql(table)}`; }
  }
  await actionChecks(populated.sql, check, barrier);
  for (const [id, query] of [
    ["owner-fk-quiz-set", () => populated.sql`insert into quiz_attempts (id,user_id,set_id,score,total) values ('cross-owner-quiz',${B},'quiz-a',1,2)`],
    ["owner-fk-quiz", () => populated.sql`insert into quiz_question_attempts (user_id,attempt_id,question_id,answer,correct) values (${B},'legacy-quiz-a','q-a-1','0',true)`],
    ["owner-fk-vocabulary", () => populated.sql`insert into vocabulary_review_attempts (user_id,gap_id,correct,grading_method,box_before,box_after,status_after) values (${B},${GAP_A},true,'objective',1,2,'active')`],
    ["owner-fk-writing", () => populated.sql`insert into micro_drills (id,user_id,error_id,prompt_text,response_fr) values ('cross-owner-drill',${B},'error-a','Synthetic','Synthetic')`],
    ["owner-fk-tcf", () => populated.sql`insert into tcf_question_attempts (user_id,question_id,mode,exam_attempt_id,chosen,correct) values (${B},${TCF_Q},'exam',${LEGACY_EXAM},0,true)`],
  ] as const) {
    // Dedicated fixture DB; inspect then delete deliberately invalid probes in finally.
    await check(id, "Database rejects a cross-owner parent/child link with foreign-key violation", async () => {
      let code: string | undefined;
      try { await query(); } catch (e) { code = failureCategory(e); }
      assert.equal(code, "23503");
    });
  }
  await populated.sql`delete from quiz_question_attempts where user_id=${B} and attempt_id='legacy-quiz-a'`;
  await populated.sql`delete from quiz_attempts where id='cross-owner-quiz'`;
  await populated.sql`delete from vocabulary_review_attempts where user_id=${B} and gap_id=${GAP_A}`;
  await populated.sql`delete from micro_drills where id='cross-owner-drill'`;
  await populated.sql`delete from tcf_question_attempts where user_id=${B} and exam_attempt_id=${LEGACY_EXAM}`;
  await populated.sql`drop function review_test_barrier()`;
  await check("ownership-fk-delete-compatibility", "Deleting an exam retains its item history and owner; deleting a writing source cascades its responses", async () => {
    await populated.sql`delete from tcf_attempts where id=${LEGACY_EXAM}`;
    const rows = await populated.sql`select user_id,exam_attempt_id from tcf_question_attempts where user_id=${A} and request_key is null and mode='exam'`;
    assert.equal(rows.length, 2); // Legacy and new exam question history.
    assert(rows.some(row => row.exam_attempt_id === null && row.user_id === A));
    await populated.sql`delete from errors where id='error-b'`;
    assert.equal(Number((await populated.sql`select count(*) as n from micro_drills where error_id='error-b'`)[0].n), 0);
  });
  notRun("review-backfill", "M2 schema/worker not implemented; no invented backfill claim");
  notRun("browser-authentication-and-offline", "Framework authentication/network/UI are outside this database harness");
  for (const { name, sql } of [{ name: expected, sql: primary }, populated, restore, recovery]) {
    for (const [table, rows] of Object.entries(await snapshot(sql))) counts.push({ database: name, table, count: rows.length });
  }
  manifest.fixtureOwnerIds = [A, B];
} catch (error) {
  results.push({ id: "harness", status: "failed", expected: "Rehearsal setup and scenario execution", actual: failureDetail(error) });
  // Do not emit raw query objects, connection URLs, or child-process stderr.
  console.error(`Rehearsal stopped: ${failureDetail(error)}`);
} finally {
  await Promise.allSettled(connections.map(client => client.end({ timeout: 3 })));
  manifest.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(path.join(output, "counts.csv"), "database,table,count\n" + counts.map(r => `${r.database},${r.table},${r.count}`).join("\n") + "\n");
  const summary = ["passed", "failed", "not_run"].map(status => `${results.filter(r => r.status === status).length} ${status}`).join(", ");
  await writeFile(path.join(output, "report.md"), `# Isolated review migration rehearsal\n\n${summary}\n\nSynthetic data only. Authentication identity, cache and AI boundaries are stubbed; actual action/transaction code runs against PostgreSQL. This is not browser or production acceptance.\n\n| Scenario | Status | Expected | Actual |\n| --- | --- | --- | --- |\n${results.map(r => `| ${r.id} | ${r.status} | ${r.expected} | ${r.actual} |`).join("\n")}\n`);
  await rm(scratch, { recursive: true, force: true });
  console.log(summary);
  process.exitCode = results.some(r => r.status === "failed") ? 1 : 0;
}
