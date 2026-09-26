# Unified review state — implementation specification

Date: 2026-09-22. Status: specified, not implemented or database-accepted.
Parent: [Review center and study plan](sundew-review-study-plan.md).
Related: [Migration rehearsal](../operations/review-migration-rehearsal.md), [Practice sessions](review-session-spec.md).

## 1. Authority and current gaps

This document fixes state transitions and persistence contracts for Batches A–C. The parent remains authoritative for scope; these rules refine its scheduling and management behavior. Seven-day allocation and its UI remain separate implementation work.

Current `actions/review.ts` merges bounded source lists; it has no persistent review identity or management state. `tcf/learning.ts` counts every consecutive confident success, including immediate repeats. `vocabulary/gaps.ts` owns Leitner scheduling, while `setGapStatus(active)` resets the box. These behaviors must be reconciled before unified state can become authoritative.

## 2. Identity and schema contract

Use the following logical table names for new Drizzle definitions; generate additive migrations after inspecting the latest journal. Do not assign migration numbers in advance.

| Table | Required fields and constraints |
| --- | --- |
| `review_items` | UUID id, UUID user_id, source_type, canonical source_key, skill/category, management_state, pause_until, note, disputed_at/reason, availability/reasons, learning_state, due_at, eligible_after, success_count, policy_version, evidence_revision, revision, first/last_observed_at, last_revealed_at. Unique `(user_id, source_type, source_key)` and `(user_id, id)` |
| `review_evidence` | UUID id, user_id, review_item_id, source_attempt_type/id/revision, role, provenance, verdict, uncertain, answered_at, revealed_at, run_id/item_id when present, eligibility context (management/availability/exposure at answer time), due_event_id when eligible, invalidated_at/reason. Unique `(user_id, review_item_id, source_attempt_type, source_attempt_id, source_attempt_revision)`; same-owner composite FK to item |
| `review_item_changes` | UUID id, user_id, review_item_id, command, request_key/hash, before/after revision, changed management fields, timestamp. Unique `(user_id, request_key)`; no copied question or answer bodies |
| `review_backfill_jobs` | UUID id, user_id, source_type, policy_version, cutoff, ordering, cursor, fingerprint, counters, status, updated_at. Same-owner access; page data and cursor commit together |

Management enum: `active | paused | archived`. Learning enum: `needs_practice | consolidating | stable`. Availability summary: `ready | feedback_pending | disputed | source_missing | unsupported`. Add `availabilityReasons` to retain simultaneous reasons; summary precedence is source_missing → unsupported → disputed → feedback_pending → ready. Provider failure is an explicit detail reason under feedback_pending, never a success.

Evidence and derived learning columns are rebuildable. Notes, disputes, management and their revisions are user decisions; replay cannot overwrite them. Source bodies remain in source tables or private run snapshots, not evidence rows. All timestamps are UTC instants. `revision` increments for every item mutation; `evidence_revision` tracks evidence-set changes.

Replay uses recorded management/availability/exposure at the answer time, not today's management state. Evidence lacking those historical facts is conservatively ineligible for an independent due event. A later source invalidation can revoke earlier evidence; changing archive status alone cannot retroactively erase valid practice. Retain reveal timestamps as metadata events in `review_item_changes`, so replay does not depend solely on last_revealed_at. Note edit history stores only changed field names, not copies of old private note text.

Canonical identities:

- TCF and Quiz: exact persisted question ID, never question wording. Private Quiz ancestry must belong to the authenticated owner.
- Writing: exact error ID, preserving submission/span/assessment revision; different errors stay separate.
- Vocabulary: exact gap ID; recognition/listening/production remain separate targets.
- Conjugation: versioned serialized tuple `[normalized infinitive, canonical tense, person]`. Use the existing parser/library; NFC, trim and French lowercase infinitive; preserve pronominal identity and accents. Person is integer 0–5; tense must be in the supported catalog. Never concatenate ambiguous delimiters or accept arbitrary client target keys.

Validate polymorphic attempt references inside adapters. Add composite owner/parent constraints wherever both are persisted; attempt revision changes invalidate/replay existing evidence rather than creating an additional success. Index `(user_id, management_state, availability, due_at, id)` and `(user_id, last_observed_at, id)`.

## 3. Management transition table

Every command requires authenticated owner, `requestKey`, and `expectedRevision`. Exact request replay is resolved before revision checks; changed payload under the same key returns `REQUEST_CONFLICT`.

| Event | From | Result | Learning/scheduling effect |
| --- | --- | --- | --- |
| Collect first wrong/uncertain or manual target | Absent | Create active item | Initialize/replay evidence; manual target has no invented success |
| Observe existing target | Any | Add evidence once; retain management | Replay valid evidence; archived new error sets a restore suggestion |
| Pause | Active/paused | Paused, optional future pauseUntil | Keep due date and progress |
| Resume | Paused | Active, clear pauseUntil | Preserve schedule; past due remains due |
| Pause expires | Paused with elapsed deadline | Active, clear pauseUntil atomically | Same as resume |
| Archive | Active/paused | Archived, clear pauseUntil | Keep history and schedule; never mark stable |
| Restore | Archived | Active | Replay valid evidence; preserve existing schedule |
| Edit note | Any | Same management; note ≤ 2,000 characters | None |
| Flag dispute | Any | Store reason ≤ 1,000 characters | Exclude target from recommendations and learning claims |
| Clear dispute | Any | Recompute availability from remaining reasons | Replay currently valid evidence; does not repair source content |
| Delete source | Any | Remove private content/evidence and executable references | Block affected work; retain only allowed minimal task tombstone |

Unsupported transitions return `INVALID_STATE`, not an inferred alternative. Pausing cannot restore an archive. Repeated archive with a new key may return the current state without adding another change if expectedRevision still matches. Editing a note does not clear a dispute.

Expired pauses are normalized using one owner-scoped transaction helper used by count/list/start/Today/Plan. Use the same captured `now` for normalization and selection. Concurrent explicit archive/extension wins through row locking/revision checks; no unconditional background update may revive it.

For disputes, retain the underlying last-known learning snapshot for audit, but display “Disputed” rather than a stable claim. New answers may be retained as practice history; they cannot advance scheduling while disputed. Clearing a dispute replays eligible evidence, excluding attempts made while disputed unless explicitly revalidated.

## 4. Non-vocabulary scheduling policy v1

Pure reducer input: validated evidence ordered by `(answeredAt, sourceAttemptId)`, reveal events, source validity and policy version. Server assigns saved answer timestamps; a client clock is not scheduling authority. Reducer output includes learningState, dueAt, eligibleAfter, successCount and qualifying evidence IDs.

| Valid event | State effect | Due effect |
| --- | --- | --- |
| Initial wrong or uncertain | needs_practice, successes=0 | dueAt=answeredAt; eligibleAfter=answeredAt + 24h |
| Later wrong or uncertain, including early practice | needs_practice, successes=0 | Reset dueAt and eligibleAfter as above |
| Eligible confident success 1 | consolidating, successes=1 | answeredAt + 3×24h |
| Eligible confident success 2 | consolidating, successes=2 | answeredAt + 7×24h |
| Eligible confident success 3 or later | stable, successes capped at 3 | answeredAt + 14×24h |
| Early/revealed/immediate-repeat success | History only | Do not change dueAt or successes |
| Unverified, invalidated, pending/failed feedback | History only | Cannot establish success or reset verified state |

For manual collection with no evidence, set needs_practice and dueAt=collectedAt, eligibleAfter=collectedAt. For a verified correct-only historical target explicitly added by the user, reconstruct only supported state; never invent separate due events.

Eligibility requires all of:

1. Correct, confident, valid exact-target verdict with matching content/grader revision and no early reveal in this run item.
2. Item was active/ready, and answeredAt ≥ dueAt and ≥ eligibleAfter. After any answer reveal, also require answeredAt ≥ lastRevealedAt + 24h. Viewing correctness/explanations in the details page is a reveal event too.
3. No earlier qualifying success consumed the same due event. Event identity derives from item ID, policy version and predecessor qualifying/reset event ID, not only the wall-clock due timestamp. The item lock serializes concurrent submissions across separate runs.
4. The run is not an immediate retry of that target. A run contains each target once; “try again” creates explicitly linked extra practice that cannot manufacture another due event.

After a qualifying success, eligibleAfter equals the new dueAt. The 24h guard after a wrong answer/reveal is an explicit refinement of the parent's immediate-retry rule: the card is due now and practice remains allowed, but same-day repetition does not prove independent recall. UTC elapsed time controls intervals; the owner's local zone only labels dates. Do not turn midnight or a time-zone change into a new qualifying event.

Example: wrong at Sep 22 10:00Z → due immediately; correct at 10:05Z remains history-only; independent correct Sep 23 10:00Z → due Sep 26; correct Sep 26 → due Oct 3; correct Oct 3 → stable, due Oct 17. Another wrong resets the chain.

Writing uses this cadence only for ready, versioned feedback proving the exact target. Existing micro-drill `ok` feedback is AI-assisted evidence, not objective accuracy. Pending feedback leaves the prior state intact and temporarily prevents another recommended retry for that target; when feedback arrives, replay by original saved response time, not callback arrival time. Prompt identity distinguishes repetition from a fresh drill. Legacy feedback without sufficient target/version provenance remains history-only.

## 5. Vocabulary compatibility

Vocabulary gaps remain the sole authority for box, dueAt, mastered state and existing Leitner intervals `[1, 2, 4, 8, 16]`. The unified index mirrors them; it never applies the non-vocabulary cadence or increments a second box.

- Initial import maps dismissed → archived, active → active, mastered → active with learningState stable and no executable due date. Keep original box/status/date as migration provenance, not a synthetic attempt.
- Map active box 1 → needs_practice; active boxes 2–5 → consolidating; mastered → stable. UI must label vocabulary cycle state and distinguish grading method; this is not a cross-skill mastery measure.
- After import, management commands change review management only. Archive/pause/restore do not call `setGapStatus(active)` or reset boxes. Replace legacy dismiss/restore UI paths with the shared management service.
- “Restart vocabulary cycle” is a separate explicit action that resets mastered to active/box 1/due now. Restoring an archive is not restart.
- Automatic new gap evidence may reactivate the underlying mastered cycle according to existing rules, but must not override a user's review archive; show the restore suggestion. Old automatic dismissed-gap behavior remains respected.
- A session started while a gap is due may submit after another session advances it: save the answer once as non-scheduling practice with unchanged before/after box and `scheduleApplied=false`. Adapt `gradeGap` to participate in the caller transaction and serialize on the gap; its current unconditional future-gap rejection cannot implement this behavior.
- Type changes retain ID only when safe, invalidate incompatible snapshots, and recalculate availability. A merge into another gap explicitly reconciles source references, evidence and blocked runs; never silently transfer task credit.

## 6. Reads, writes and interfaces

Planned service modules: `src/lib/review/state.ts` (pure reducer), `adapters/`, `queries.ts`, `commands.ts`, `reconcile.ts`. Authenticated entry points stay in `actions/review.ts`. These are proposed interfaces, not existing exports.

| Operation | Input | Result |
| --- | --- | --- |
| listReviewItems | view, filters, search, cursor, limit | summaries, nextCursor, matchingCount, asOf, source availability |
| getReviewItem | itemId, history cursor | source metadata, state/revision, redacted history; no answers by default |
| revealReviewItem | itemId, requestKey, expectedRevision | authorized answer/feedback/history; records reveal timestamp |
| changeReviewItem | itemId, command, payload, expectedRevision, requestKey | authoritative item/revision or typed conflict |
| collectReviewTarget | source type/reference, requestKey | canonical item; adapter validates existence/owner |

Due predicate is `effectiveManagement=active AND availability=ready AND dueAt IS NOT NULL AND dueAt<=now`. `eligibleAfter` affects advancement, not list inclusion. Stable items reappear when due. Default view Due; All contains active/paused, Stable contains active/paused stable, Archived only archived. Management filter exposes paused explicitly. Source includes TCF listening/reading, writing, each vocabulary gap type, conjugation, Quiz single-choice/cloze; unsupported sources remain explainable.

Server pagination: default 20, max 100. Due order `(dueAt ASC, id ASC)`; other views `(lastObservedAt DESC, id DESC)`. Opaque validated cursor includes order values and filter fingerprint; changed filters restart pagination. Lists are live, not frozen snapshots; session start fixes the selected set separately. Return count and page from the same DB read snapshot after expired-pause normalization.

Search is NFC-trimmed, max 200 characters, parameterized literal substring matching on owner-accessible prompt/title/category/lemma/note; escape wildcard characters. Do not search prior answers/correct answers or shared private content. Return summaries only. Initial bounded SQL search is acceptable; measure before adding a separate search index.

Typed errors: `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION`, `REVISION_CONFLICT`, `REQUEST_CONFLICT`, `INVALID_STATE`, `SOURCE_UNAVAILABLE`, `TEMPORARY_FAILURE`. Foreign-owner IDs return NOT_FOUND. On revision conflict, return current authorized summary and require UI refresh before another intentional edit; never overwrite newer state automatically.

## 7. Reconciliation, cutover and acceptance

Extract transaction-aware source writers first. Saving an answer, evidence, derived state and eventual task credit must share one transaction. Deleting/invalidation of an attempt replays the affected target and reconciles any credit; deleting a source scrubs all private snapshots, answer copies and feedback before leaving a minimal non-content tombstone. Never migrate by matching similar question text.

Rollout uses a server-side REVIEW_CENTER_ENABLED switch for new UI/commands. Keep capture of saved source answers active when UI is disabled. Before cutover, compare shadow unified state against legacy output and explain intended differences (especially TCF immediate repeats and restored vocabulary). When enabled, old entry points delegate to the shared services; never expose two simultaneous scheduling authorities. If disabled after cutover, legacy UI still uses compatible shared state rather than reviving the old scheduler.

Required pure tests: all transition rows; wrong/uncertain reset; three independent due events; early/revealed success; same-timestamp deterministic ordering; late AI result replay; dispute clear; policy replay; vocabulary projection; clock/time-zone boundaries. Required integration tests: duplicate canonical item/evidence, parallel item edits/submissions, expired pause versus archive, cross-owner FK/action rejection, source/attempt deletion, repeatable backfill. See the migration specification for execution and evidence requirements.

Implement in order: schema/constraints → pure reducer and tests → adapters/transaction writers → backfill/reconciliation → shared queries/commands → UI. Initial vertical slice is TCF reading, but acceptance requires every in-scope source.
