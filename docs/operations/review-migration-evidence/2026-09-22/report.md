# Review migration execution — 2026-09-22

The focused isolated database rehearsal passed **25 checks, with 0 failures**. Two entries remain explicitly not_run: unified review backfill (M2) and browser/authentication/offline acceptance. The complete review center and study plan are still in development.

## Environment and reproducibility

- Local PostgreSQL 18.4 at `127.0.0.1:55439`, dedicated `sundew_review_test` role; synthetic owners and content only.
- Empty, populated, restored and failure-recovery databases are separate. The app's business database was not connected or migrated. No paid provider call occurred.
- Temporary server binaries came from the fixed `@embedded-postgres/darwin-arm64@18.4.0-beta.17` package ([project](https://github.com/leinelissen/embedded-postgres)). Matching pg_dump/pg_restore were compiled from the [official PostgreSQL 18.4 source archive](https://ftp.postgresql.org/pub/source/v18.4/postgresql-18.4.tar.bz2), all outside the project. No project/runtime dependency was added.
- [Manifest](manifest.json) records database identity, migration hashes, commit and tracked working-tree digest; [results](results.json) records each check; [counts](counts.csv) records fixture table counts. This was an uncommitted working tree, so the commit alone does not identify the tested code.
- [Tested source hashes](tested-source-hashes.json) capture the unchanged final-run harness and affected application files, including untracked files omitted from the Git diff.
- The temporary PostgreSQL server was stopped after verification; synthetic fixture data remains in its temporary cluster directory.
- Migrations 0000–0032 retain exactly the hashes from the pre-fix run. The original 0029–0032 were not rewritten.
- See [runner instructions](../../review-migration-rehearsal.md) for a repeatable command with a fresh database/output directory.

## Findings and fixes

The [pre-fix matrix](before-fixes.json) had 13 passing, 5 failing and 3 not_run checks. Four failures were accepted cross-owner parent links in Quiz item attempts, vocabulary reviews, micro-drills and TCF exam-item attempts. The fifth reproduced an older AI result overwriting a later feedback generation.

- `0033_naive_rafael_vega.sql` adds owner/id candidate keys and composite parent foreign keys, including Quiz attempt → owned set. Referenced unique keys were ordered before foreign keys in the new migration. The migration rejects existing invalid owner links atomically; it does not silently rewrite or delete learner data.
- Micro-drill success and failure publication now requires the saved feedback generation and pending status. Late workers read the current response instead of overwriting it. Both late-success and late-failure races pass.
- `0034_unknown_king_cobra.sql` adds owner-scoped conjugation request keys/hashes. The action rejects changed payloads under the same key. The UI freezes an unconfirmed answer and retries its original request, displaying saved feedback only after confirmation. Legacy null-key history remains readable.
- The fault-injection worker runs in a subprocess: force-closing its database connection reproduced an uncaught callback error in the installed postgres client. The parent survives, verifies schema/ledger rollback, and reruns migration successfully. The client library itself was not changed.

## Verification

- Empty and populated 0029–0032 migration, ledger-aware rerun, pending-DDL failure rollback, connection termination and recovery.
- Actual pg_dump → pg_restore round trip, all preexisting row values and timestamps, logical column order/types/defaults, constraints and indexes. Internal column-number gaps from earlier DROP COLUMN operations are intentionally excluded: logical restore compacts them.
- Additive 0033/0034 migration and rerun; invalid-owner history rejects the migration without partial constraints; delete behavior remains compatible.
- Actual action/transaction code for Quiz, cloze, TCF question/exam, vocabulary, writing and conjugation. Auth identity and cache/provider boundaries are stubbed. Concurrent writers are held by real database lock barriers.
- A post-commit response failure replays the same saved record; vocabulary log failure rolls back its preceding box update; failed AI preserves input; new feedback cannot be overwritten by stale callbacks.
- `npm run typecheck`, `npm run lint`, 94 application tests, one rehearsal safety test, and `npm run build` passed. The application tests used `node --import tsx --test 'src/**/*.test.ts'`, equivalent to the npm test entry without its sandbox-blocked CLI IPC server. The build used the project's existing font download.

## Limits and next work

This verifies the focused M1 database contract, not browser behavior or blanket isolation of every table. Source-content moves, every historical source variant, live authentication, mobile/keyboard behavior, persistent offline queues, provider unknown-cost reconciliation, large-scale latency, and feature rollback remain separate acceptance work. The added parent constraints do not replace action-level checks of question/set ancestry.

Next: shared review state/schema and resumable backfill, followed by fixed review sessions. Do not claim those already exist based on this migration report. Applying migrations to the business database and deployment remain undone.

## Scenario results

| Scenario | Status | Expected | Actual |
| --- | --- | --- | --- |
| empty-migration-rerun | passed | Complete journal through 0032 applies to empty DB; rerun changes no data or ledger | Complete journal through 0032 applies to empty DB; rerun changes no data or ledger |
| baseline-dump-restore | passed | Restore actual pg_dump into a second DB and compare baseline data and ledger | Restore actual pg_dump into a second DB and compare baseline data and ledger |
| populated-migration-rerun | passed | 0029–0032 preserve all old fields and timestamps; new logs are empty; rerun is unchanged | 0029–0032 preserve all old fields and timestamps; new logs are empty; rerun is unchanged |
| migration-failure-rollback | passed | Failure after pending DDL leaves baseline schema and ledger; unmodified retry succeeds | Failure after pending DDL leaves baseline schema and ledger; unmodified retry succeeds |
| migration-connection-termination | passed | Terminate a blocked migrator; inspect rollback and retry successfully | Terminate a blocked migrator; inspect rollback and retry successfully |
| hardening-rejects-invalid-history | passed | New ownership constraints refuse invalid history without partial DDL; repair is explicit | New ownership constraints refuse invalid history without partial DDL; repair is explicit |
| additive-ownership-hardening | passed | Latest additive constraints apply and rerun on both empty and populated databases without changing history | Latest additive constraints apply and rerun on both empty and populated databases without changing history |
| quiz-retry | passed | Concurrent and sequential retries save one parent and two item answers | Concurrent and sequential retries save one parent and two item answers |
| cloze-grading | passed | Cloze grading uses saved per-question answer and rejects malformed selection | Cloze grading uses saved per-question answer and rejects malformed selection |
| committed-answer-lost-receipt | passed | A failure after commit retries to the same answer without duplicate records | A failure after commit retries to the same answer without duplicate records |
| tcf-retry-grading | passed | Two concurrent forged verdicts are graded server-side and deduplicated | Two concurrent forged verdicts are graded server-side and deduplicated |
| tcf-exam-retry | passed | Exam score and child rows are server graded and saved once | Exam score and child rows are server graded and saved once |
| vocabulary-retry | passed | Concurrent reviews log once and increment Leitner once; exact replay works when no longer due | Concurrent reviews log once and increment Leitner once; exact replay works when no longer due |
| conjugation-retry | passed | Concurrent retries save one server-graded conjugation answer; changed payload is rejected | Concurrent retries save one server-graded conjugation answer; changed payload is rejected |
| action-ownership | passed | Actual actions reject foreign resources and unauthenticated calls | Actual actions reject foreign resources and unauthenticated calls |
| vocabulary-atomic-failure | passed | A forced log-insert failure rolls back the preceding box update | A forced log-insert failure rolls back the preceding box update |
| writing-save-before-ai | passed | Failed AI leaves one saved response; same-key retry makes no extra provider call | Failed AI leaves one saved response; same-key retry makes no extra provider call |
| writing-stale-worker-success | passed | An older provider result cannot overwrite a newer feedback generation | An older provider result cannot overwrite a newer feedback generation |
| writing-stale-worker-failure | passed | An older provider result cannot overwrite a newer feedback generation | An older provider result cannot overwrite a newer feedback generation |
| owner-fk-quiz-set | passed | Database rejects a cross-owner parent/child link with foreign-key violation | Database rejects a cross-owner parent/child link with foreign-key violation |
| owner-fk-quiz | passed | Database rejects a cross-owner parent/child link with foreign-key violation | Database rejects a cross-owner parent/child link with foreign-key violation |
| owner-fk-vocabulary | passed | Database rejects a cross-owner parent/child link with foreign-key violation | Database rejects a cross-owner parent/child link with foreign-key violation |
| owner-fk-writing | passed | Database rejects a cross-owner parent/child link with foreign-key violation | Database rejects a cross-owner parent/child link with foreign-key violation |
| owner-fk-tcf | passed | Database rejects a cross-owner parent/child link with foreign-key violation | Database rejects a cross-owner parent/child link with foreign-key violation |
| ownership-fk-delete-compatibility | passed | Deleting an exam retains its item history and owner; deleting a writing source cascades its responses | Deleting an exam retains its item history and owner; deleting a writing source cascades its responses |
| review-backfill | not_run | review-backfill | M2 schema/worker not implemented; no invented backfill claim |
| browser-authentication-and-offline | not_run | browser-authentication-and-offline | Framework authentication/network/UI are outside this database harness |
