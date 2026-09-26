# Review infrastructure — isolated migration and recovery specification

Date: 2026-09-22. Status: isolated M1 rehearsal implemented and executed; 25 focused database checks passed. M2 and browser acceptance remain open.
Parent: [Review center and study plan](../product/sundew-review-study-plan.md).
Related: [Review state](../product/review-state-spec.md), [Practice sessions](../product/review-session-spec.md).

Execution evidence: [2026-09-22 report](review-migration-evidence/2026-09-22/report.md). Migrations 0029–0032 were exercised unchanged; additive 0033 fixes same-owner parent constraints and 0034 adds conjugation request identity. No business database migration or deployment was performed.

## 1. Scope and two separate gates

**M1** verifies the existing migrations 0029–0032 and answer-writing infrastructure against an isolated PostgreSQL database. **M2** verifies the additional review/session schema, resumable backfill, and reconciliation once implemented. Passing M1 does not establish that review backfill or recoverable sessions work.

| Existing migration | Actual change | Required observation |
| --- | --- | --- |
| 0029_late_dazzler | Quiz item attempts; parent attempt request key/hash | One parent and the expected item rows per submission; legacy totals unchanged |
| 0030_green_sue_storm | TCF request key/hash and question grade version | Exact retries add no rows; existing history keeps null version/key |
| 0031_funny_sage | Vocabulary review attempt log | One log and one box change in the same transaction |
| 0032_light_the_executioner | Micro-drill pending/failed feedback, attempts, lease, request identity | Saved input survives feedback failure; legacy feedback remains readable |

These SQL files do not create review items, runs, task credits, or a backfill worker. They also do not fully enforce same-owner child/parent references: separate user and parent foreign keys are insufficient. M1 must expose that gap; later additive constraints must close it before release. Do not edit or renumber existing migrations to hide findings.

## 2. Database isolation contract

The runner is implemented at `scripts/review-db-rehearsal.mts`, exposed as `npm run db:review-rehearsal`. It requires Node >=22.15 or >=23.5 (module boundary hooks), a fresh provisioned local database, and a dedicated test role with CREATE DATABASE privilege on the isolated instance. It leaves fixture databases in place, marked by a run UUID; it never drops a supplied database.

```sh
REVIEW_TEST_DATABASE_URL='postgres://sundew_review_test@127.0.0.1:55439/sundew_review_test_example' \
  npm run db:review-rehearsal -- \
  --expected-database sundew_review_test_example \
  --output /private/tmp/sundew-review-rehearsal/example \
  --pg-bin /path/to/matching-postgresql/bin
```

Provision the example database first on the explicitly isolated instance; the runner creates fresh `_pop`, `_restore`, and `_recovery` siblings. Existing output directories with a `run.lock` are rejected to preserve evidence. `--pg-bin` must contain compatible `pg_dump`/`pg_restore`; omission records restore as not_run. A nonzero exit means a failed check. A zero exit still requires inspecting not_run entries; it does not mean product acceptance.

- Accept only `REVIEW_TEST_DATABASE_URL`, plus `--expected-database <name>` and `--output <directory>`. Never load `.env` or `.env.local`, fall back to `DATABASE_URL`, or import the application database singleton before isolation checks.
- Use a locally provisioned disposable PostgreSQL instance with synthetic data, a dedicated role, and databases prefixed `sundew_review_test_`. The current implementation accepts literal loopback addresses and a non-default port only; remote targets are not supported.
- Check parsed host and database against the allowlist, then check `current_database()`, `current_user`, and `inet_server_addr()` on the live connection. Refuse mismatches, nonempty unknown databases, and any target sharing an available application database endpoint. Environment files are parsed only for this rejection check; their values never enter process.env or a connection. Do not print URLs, passwords, or environment contents.
- Provision independent empty, populated, and recovery databases; record a random fixture marker. Cleanup requires the exact marker and database name and is limited to fixtures created by this run.
- Capture PostgreSQL version, migration file hashes, journal entries, repository revision plus working-tree diff digest, fixture seed, and sanitized host/database identity. A commit alone is insufficient while the migrations are uncommitted.
- Use the installed `postgres`/Drizzle versions. Do not require Azure or speech credentials or make AI calls. Stub feedback at the service boundary, not by changing production content.

The current `db:init` loads environment files and migrates every pending entry. `run-migration.mts` additionally assumes the migration ledger already exists. Neither is the isolated harness. Do not invoke them against an unidentified target.

## 3. Migration sequence and assertions

1. Validate that every journal entry has its SQL file; preserve 0026–0028 (Stage 2) as prerequisites without enabling speaking. Compare ledger hashes, not just counts. Reject a ledger/file mismatch.
2. Empty case: migrate the complete journal through 0032, then rerun it. Assert exact expected ledger entries, required columns/indexes/foreign keys, and no second-run schema or row changes.
3. Populated case: copy a journal prefix through 0028 and its unmodified SQL files into a temporary migration directory. Migrate that baseline, insert the fixtures below, and capture canonical row digests for existing fields.
4. Apply the full journal. Verify precisely 0029–0032 are newly recorded; compare preexisting values and timestamps; check old null request keys remain allowed; confirm new attempt tables are empty until new practice is submitted.
5. Execute source write tests through the same transaction/service functions used by authenticated actions. Inject explicit fixture users at the service boundary; separately test the actions derive identity from authentication. Raw SQL tests alone do not prove application ownership enforcement.
6. Rerun migration and test idempotent requests using fresh connections. Record expected/actual counts and state, not only a green process exit.

The installed Drizzle PostgreSQL dialect runs pending migration statements and their ledger inserts in one transaction; ledger schema/table setup happens before it. Verify that behavior experimentally. SQL containing `IF NOT EXISTS` does not make every statement safe to replay manually: these migrations include unguarded `ADD COLUMN` statements. Always use the ledger-aware migrator.

## 4. Synthetic fixture manifest

Use deterministic IDs and UTC timestamps; never copy real learner writing into artifacts.

| Fixture | Minimum cases |
| --- | --- |
| Owners | A and B sharing public TCF questions and normalized conjugation targets, but separate private quiz sets, writing, and vocabulary |
| TCF | Wrong, uncertain, confident correct, unverified legacy exam verdict, old null keys, a newly server-graded exam |
| Quiz | An old aggregate-only attempt; new single-choice and cloze sets with two or more items; malformed and foreign-owner question IDs |
| Vocabulary | Active due gap, future gap, mastered gap, dismissed gap, missing translation, each with known box/date |
| Writing | Existing completed micro-drill, new response with pending feedback, deterministic provider failure, late provider response |
| Conjugation | Repeated failures for one exact verb/tense/person; distinct person; accepted alternative form |
| M2 additions | Paused/archived/noted/disputed items; revealed answer; partial mixed run; deleted source; expired pause; future and credited plan task when Batch E exists |

## 5. M1 test matrix

| ID | Action | Required result |
| --- | --- | --- |
| M1-01 | Apply empty/populated sequence twice | Ledger and old-row digests match expectations |
| M1-02 | Submit the same Quiz/TCF/vocabulary/micro-drill request serially and concurrently | One logical response; identical saved identity/result; no duplicate item rows or box changes |
| M1-03 | Reuse a request key with changed answer, target, or uncertainty | Conflict; original record unchanged |
| M1-04 | A reads/submits B's private resource or substitutes a parent ID | No data/answer leakage and no mutation; foreign resource behaves as not found |
| M1-05 | Insert cross-owner parent/child association directly | Database rejects after hardening; any current acceptance is a documented failing release gate |
| M1-06 | Forge correct/score/completion or use an invalid option | Server verdict wins or request rejected; no invented credit |
| M1-07 | Interrupt between attempt insert and vocabulary update, or vice versa | Both roll back; retry produces one coherent result |
| M1-08 | Fail AI before response; lose connection after response save | Input persists; pending/failed visible; resubmission does not create another answer |
| M1-09 | Two feedback workers finish out of order | Only current lease/version can publish; existing unfenced implementation is a failing gate until fixed |
| M1-10 | Submit conjugation twice with same logical request | Save once under owner/request uniqueness; reject changed payload; keep legacy null-key history |

Use two real database connections and barriers to force concurrency. A loop of sequential requests does not prove race handling. Where current code fails, preserve the failure evidence and create the targeted fix; do not label the whole milestone passed.

## 6. Failure and restore rehearsal

- Migration failure: in the disposable copy only, inject a failing statement inside the pending batch after at least one DDL statement. Expect no new application schema/ledger entries from that batch, while the baseline remains intact. Restore the unmodified migration files and rerun successfully. Never modify the checked-in journal for fault injection.
- Connection termination: interrupt an active migration in the fixture instance, reconnect, inspect both schema and ledger, then rerun. Do not infer rollback from the client error alone.
- Unknown commit outcome: commit an answer but discard the client response. Retry the same request; expect the original result and one row.
- Restore: take a database dump of synthetic populated baseline, restore it into a second empty fixture database, compare schema/row digests, then apply 0029–0032 there. A successful dump without restore is insufficient.
- Feature rollback (M2): disable new entry points, keep saved attempts and legacy routes usable, and resume after re-enabling. Do not drop tables. An older application binary is a valid rollback only after proving schema compatibility.

## 7. M2 backfill protocol

Implement `scripts/backfill-review-items.mts` after the state schema exists. Required modes: `--dry-run`, `--apply`, `--resume <jobId>`, scoped to an explicit owner or explicit synthetic owner list. Defaults must not select all production users.

1. Dry-run emits counts per owner/source: eligible, existing, history-only, missing, invalid, and unresolved, plus input fingerprint and policy version. No review writes, task credit, or paid calls.
2. Apply creates `review_backfill_jobs` with owner/source, policy version, cutoff, cursor, input fingerprint, status and counters. Source ordering is immutable `(createdAt/answeredAt, primaryKey)`; sources without an immutable timestamp use primary-key order. Store the actual ordering choice in the job.
3. Process 200 source rows per page. Resolve canonical source identity, validate owner, upsert one review item and unique evidence references, replay affected state, and advance the cursor/counters in the same transaction.
4. On conflict, preserve management, notes, disputes, and manual settings. Use the source adapter's validity/provenance rules. Legacy Quiz totals generate no items; vocabulary seeds current box/status/date without fabricated attempts; unverifiable TCF verdicts stay history-only.
5. Acquire review-item locks in sorted ID order. Run live ingestion before starting backfill; new writes beyond the cutoff go through ingestion. For updated/deleted sources, revalidate under lock and reconcile affected targets. The stable resume fingerprint covers schema, adapter/policy versions, owner/source scope, cutoff and ordering; changing it requires a new dry-run/job. Expected live source changes are reconciled, not mistaken for a configuration fingerprint mismatch.
6. Resume after a forced crash before/after page commit; compare with uninterrupted output. A second full job must produce identical item/evidence identities and learning state, without replacing user edits or awarding task credit.

M2 asserts unique source identity, same-owner references, cursor atomicity, history replay, pause/archival preservation, deletion cleanup, zero plan credits, and zero AI calls. Vocabulary type changes/merges require adapter reconciliation rather than matching by wording.

## 8. Evidence and rollout gates

Produce `manifest.json`, `results.json`, `counts.csv`, and a concise `report.md` in the selected output directory. Each scenario records `passed`, `failed`, or `not_run`, expected/actual result, and sanitized failure category. Reports contain synthetic IDs, not secrets or content bodies. Keep dumps outside published reports.

For scale checks, use 10,000 attempts and 1,000 review items per fixture owner; record DB resources, query plans, count/list and submit p50/p95 latency, duplicate outcomes, and reconciliation differences. Report measurements before choosing a performance target.

| Gate | Required evidence | Current status |
| --- | --- | --- |
| M1 migrations | Empty/populated/rerun/failure/restore assertions | Passed on local PostgreSQL 18.4; includes restored logical schema and row comparison |
| M1 answer integrity | Duplicate, ownership, transaction, grading tests; identified gaps fixed | Focused matrix passed, including 0033/0034 and late feedback success/failure; broader source/content acceptance remains open |
| M2 review backfill | Implemented schema/worker; resumability and state reconciliation | Not implemented |
| M2 sessions | Fixed snapshot, resume, concurrent submit, feedback recovery | Not implemented |
| Release | Feature rollback plus browser and source-by-source acceptance | Not run |

Execution order: implement isolated harness → run M1 → fix demonstrated integrity gaps with additive changes → implement state schema/reducer → run M2 backfill → implement sessions → verify rollback and browser flows. Seven-day plan acceptance remains a later gate.

Completed this checkpoint: harness, baseline M1 execution, five observed failing checks fixed, and conjugation request deduplication. Next: shared review state/schema and M2 backfill. Performance-scale measurements, live authentication/UI, cost-unknown provider reconciliation, source snapshot deletion, and feature rollback are not covered by the focused M1 report.
