# Recoverable review sessions — implementation specification

Date: 2026-09-22. Status: specified; fixed practice runs are not implemented.
Parent: [Review center and study plan](sundew-review-study-plan.md).
Related: [Review state](review-state-spec.md), [Migration rehearsal](../operations/review-migration-rehearsal.md).

## 1. Session boundary

One run fixes an ordered set of distinct targets and their content/grader versions. It can contain TCF, supported Quiz/cloze, vocabulary, conjugation, and writing micro-drills. Common navigation wraps type-specific runners; it does not replace their grading semantics. A completed run means every effective item has a saved response, not that every answer is right or every AI assessment is ready.

Explicit selection accepts 1–20 items. Queue mode accepts 5/10/20, defaults to 10, and reports the actual available count before starting. A zero-item result creates no run. Start resolves all selected sources first; if any explicit selection is unavailable, return the unavailable IDs and revised preview rather than silently dropping them. Queue mode selects only eligible available targets using the shared stable ordering.

No persistent runs are created on GET or page visits. Free-practice start is allowed without Plan. Later plan tasks bind to the same run and response contracts; Plan must not introduce a second attempt store.

## 2. Persistence and constraints

| Table | Required fields and constraints |
| --- | --- |
| `practice_runs` | UUID id, user_id, optional plan_task_id (added with plan schema), activity_type, state, revision, scope_revision, requested/effective count, start request_key/hash, created/started/paused/completed/cancelled timestamps. Unique `(user_id,id)` and `(user_id,start_request_key)` |
| `practice_run_items` | UUID id, user_id, run_id, review_item_id, slot, generation, effective flag, source_type/key, snapshot_version/hash, content_version, grader_version, private snapshot, state, revealed_at, draft_revision, response attempt reference, submitted_at, superseded_by. Unique effective `(run_id,slot)` and `(run_id,review_item_id)`; same-owner composite FKs |
| `practice_requests` | UUID id, user_id, run_id/item_id, command, request_key/hash, outcome reference, created_at. Unique `(user_id,request_key)`; saved response identity is recoverable without the request body |
| `practice_operations` | UUID id, user_id, run_id/item_id, operation kind, generation, state, lease_token/until, provider request ID, reserved/actual usage, failure category, request key/hash, created/updated_at. Same-owner FKs, unique logical operation generation |
| `practice_run_changes` | UUID id, user_id, run_id, command, before/after revision and scope_revision, affected non-content IDs/counts, timestamp |

Each source attempt gains a nullable `run_item_id` and a unique index where present; add same-owner FK to run item. Legacy attempts remain readable with null links. A new run item accepts exactly one response. Different intentional answers require a new run item/run, never overwriting the saved answer.

When plan tables exist, add a same-owner FK and partial unique index for one nonterminal run per task. If the previous run completed, return its result instead of creating another completion. Cancellation/replacement requires explicit scope reconciliation and preserves saved evidence. Do not add a dangling plan foreign key before its table exists.

## 3. Snapshot and adapter contract

Snapshot JSON is a versioned discriminated union, validated at both creation and read. Common fields: source identity, content revision/hash, locale, prompt, media asset references, adapter/grader versions, and target identity. Store answer keys/rubrics privately in the server snapshot. Public prompt DTOs are explicit allowlists; never serialize the private snapshot into HTML, RSC payloads, client props, logs, or cached responses.

| Adapter | Fixed public prompt | Private grading material |
| --- | --- | --- |
| TCF | Passage, options with stable IDs/order, question and media references | Expected choice, explanation, validated question revision |
| Quiz single-choice/cloze | Passage/audio, fixed choices or exact blank positions and answer slots | Correct choice or accepted blank forms; per-question grade version |
| Vocabulary | Exact gap type and prompt; fixed choices for recognition/listening | Accepted forms/translation and authoritative gap ID; box itself remains live |
| Conjugation | Fixed infinitive/tense/person | Accepted forms from versioned deterministic library |
| Writing micro-drill | Exact drill prompt, target error reference and original/fresh prompt marker | Original error/correction, target rubric and assessment revision |

If source tables lack content revisions, compute a canonical content hash of all grading-relevant fields when starting; persist the actual private grading snapshot. Media uses immutable asset ID/version/hash, never a long-lived signed URL. If the storage cannot prove an asset version, block when its content changes. Source deletion revokes and scrubs snapshots even though old content was fixed.

Ordinary edits can leave an existing verified snapshot runnable. Explicit invalidation/dispute, missing media, revoked source, or unavailable historical grader blocks it and offers replacement. Never silently grade an old response against the latest answer key.

Adapter service contract: `resolveTarget`, `buildSnapshot`, `toPromptDto`, `validateAnswer`, `saveAndGrade(tx, context)`, `readFeedback`, `reconcileDeletion`. Context carries server owner/run/item, snapshot, server time and persisted request identity. No adapter calls a top-level action or starts an independent nested transaction. Source grading libraries are reused after extracting transaction-aware writers.

Existing runners that receive answer keys (including vocabulary answerIndex) cannot be reused unchanged. Reuse their controls, but source their props from redacted DTOs. Existing Quiz full-set recording also needs a distinct single-item writer: retrying one item must not create a completed whole-set score.

## 4. Run and item state machines

Run state is `active | paused | completed | cancelled`. Blockage is derived from item states and displayed as “Needs attention”; it does not erase whether the user paused the run.

| Command/event | Preconditions | Result |
| --- | --- | --- |
| Start | Valid fixed set; active management and runnable sources | active run and pending items, committed together |
| Pause | active | paused; all saved answers/drafts retained |
| Exit to review | active or paused | Explicit UI action pauses, then navigates; abrupt tab close requires no server pause to remain recoverable |
| Resume | paused | active after source checks; surface blocked items |
| Submit last outstanding item | active, all effective items saved | completed with summary; AI feedback may remain pending |
| Cancel | active/paused | cancelled; no further submissions; saved attempts stay in history |
| Feedback arrives | any | Update feedback/evidence under version check; no reopening solely for feedback |

Item response state is `pending | blocked | saved | superseded`. Feedback state is separate: `not_required | pending | ready | failed | unknown`. Network “saving” and “retrying” are client states, never evidence of a saved answer.

- `pending → saved`: one committed response. `pending → blocked`: content/management unavailable. `blocked → pending`: same verified snapshot becomes available again after explicit resume/check.
- `pending/blocked → superseded`: explicit replacement; create a new generation in that slot and increment scope_revision. Only unanswered items may be replaced; saved answers are never silently removed.
- Source deletion redacts saved items and marks their evidence invalid; reconciliation revokes affected learning/task credit. If required evidence is deleted, change that effective item to blocked and reopen an affected completed run as paused, clearing current completedAt while retaining the original completion event in change history. This invalidated item is the explicit exception to the unanswered-only replacement rule; its old response reference remains only as a non-content audit tombstone. Never claim a missing response is still complete.
- A blocked item does not count toward completion. There is no “skip counts as saved”. Leave the run paused/cancelled or explicitly edit its scope with preview and record the change; a linked plan task must approve that same scope revision.

Resume position is derived from the first effective unsaved item in order. The user can navigate saved results separately. Blocked items may be bypassed to answer later available items, but remain outstanding. No random shuffle on reload.

Deletion makes review_item_id and deleted source-attempt links nullable on the run item; use composite FKs with explicit cleanup before deleting their targets. Clear source keys, private snapshots, server drafts, copied feedback and answer content, retaining only the minimal slot/state/change identifiers. A deleted target cannot transition back to pending by a routine availability check; it requires explicit replacement. Client outbox entries for a revoked item are removed on the next authenticated synchronization; already-offline devices cannot be remotely scrubbed until they reconnect.

## 5. Command protocol and atomic submit

All commands authenticate on the server. Proposed actions: `startReviewRun`, `getReviewRun`, `saveReviewDraft`, `revealRunItem`, `submitRunItem`, `pauseReviewRun`, `resumeReviewRun`, `cancelReviewRun`, `previewRunReplacement`, `applyRunReplacement`, `retryRunFeedback`.

Mutations carry a UUID requestKey and expected run revision; item operations also carry item ID, snapshot hash and relevant draft/scope revision. Server canonicalization validates the discriminated answer shape and computes SHA-256 over command, normalized semantic input, target and versions. Request identity excludes mutable client display state. A changed payload requires a new key.

Submit transaction:

1. Authenticate; find any prior `(owner,requestKey)` result. Same hash returns that saved result even if the run is now paused/completed; a different hash returns REQUEST_CONFLICT. Deleted/redacted content stays redacted on replay.
2. Lock rows in the common order: optional plan task → run → run item → review item → source/gap; sort IDs when locking more than one. Source-only writers join at their applicable point and never acquire a run lock after a source lock. Validate owner, active run, revisions, snapshot, source availability and unsaved item.
3. Register request identity using a unique insert/conflict check. If another transaction won, resolve its saved result. Two distinct keys for one item yield one response and ALREADY_ANSWERED for the loser, even for different answers.
4. Validate/grade from server snapshot. Persist source attempt, review evidence, state update, saved run item and any task credit in the same transaction. For writing persist input/pending feedback and a queued operation, then commit without contacting AI.
5. Derive run completion from effective saved items, increment revisions, and store the response reference. Commit. Only then may the UI show “Saved” and advance.
6. Invalidate Review, Today, Progress, Plan when present, and relevant legacy route caches. Revalidation failure does not undo the committed answer; return/read the saved result on retry.

When task credits are introduced, uniqueness is `(user_id, source_attempt_type, source_attempt_id)`. Credit validates exact target, mode and run scope. Practice completion accepts a wrong answer and pending writing feedback; improvement claims do not. Free-practice attachment later uses the same credit transaction, with no copying/regrading of attempts.

Errors extend the review-state errors with `ALREADY_ANSWERED`, `SNAPSHOT_UNAVAILABLE`, `RUN_PAUSED`, `RUN_CLOSED`, `FEATURE_DISABLED`. Conflict responses include only authorized current state. Failed validation creates no attempts or credit. Batch scope edits are all-or-nothing; normal answer saves are one item at a time.

## 6. Drafts, offline handling and answer reveal

- Save drafts in a separate owner/run/item scoped draft record (or private item field), with monotonically checked draftRevision, max answer length per adapter, and no grade/evidence/credit. Debounce 750ms and flush on explicit pause. Store writing drafts up to the existing 1,000-character micro-drill limit; objective payloads use bounded option/blank schemas.
- Keep an IndexedDB outbox scoped by authenticated user and run for unconfirmed submissions/drafts. Entries hold immutable requestKey/hash/input/snapshot and their local state. Clear on sign-out/account switch and confirmed synchronization; expire abandoned local drafts after seven days. This is recovery convenience, never completion authority.
- If local storage is unavailable, retain the current draft in memory and show that unsaved input cannot survive closing the tab. Do not block already-confirmed progress.
- Offline: allow editing the current cached prompt; show “Not saved”. Do not reveal server answers or advance to another question as if submitted. Reconnect reads server state before replay. If committed already, reconcile the receipt; if revision changed, surface the conflict rather than generating a new request key automatically.
- The server accepts a reveal command before submission, records revealedAt transactionally, then returns prior answers/correction/explanation. Submit/reveal races serialize on item locks. A pre-submit reveal makes the answer ineligible for independent recall; it can still count as saved practice.
- Details-page reveal also records exposure under the shared state policy. After a confirmed answer, feedback may be displayed automatically; record exposure for subsequent sessions. Do not treat merely viewing a redacted detail page as reveal.

Reload offers “Continue” with confirmed saved count and any local unconfirmed answer. Saved versus unsaved drafts must be visually distinct. Expired authentication retains local input only for the same user; resuming as another account must not reveal it.

## 7. AI operation recovery

Micro-drills persist answers before AI; the 2026-09-22 execution checkpoint added compare-and-set publication against feedbackAttempts and pending status, with stale success/failure tests. The full operation ledger, cost-unknown reconciliation and versioned session snapshots are still unimplemented. New operations use `queued → running → succeeded | failed | unknown`, with independent saved-response state.

- Begin paid work only following the user's answer/feedback request. Commit input plus queued operation first. A worker claims via compare-and-set, increments generation and obtains a random lease token. A scheduled worker must not call AI merely because a list page opened.
- Default request timeout 60s, lease 120s, at most two provider attempts per response (initial plus one explicitly requested retry), at most one active operation per response, and per-owner concurrency/usage reservation before dispatch. Apply the configured owner budget; missing budget configuration disables paid dispatch rather than implying unlimited spend. These defaults are versioned server configuration.
- Persist provider request identity when available. Success/failure publication requires matching operation generation, lease token, source version and current assessment revision. A stale worker result cannot overwrite a later result or revive deleted content.
- Known success returns the existing assessment. Definite no-dispatch or definite failed requests may permit the bounded retry. Timeout after possible dispatch is unknown, not automatically failed/retryable; preserve cost reservation until reconciliation or an explicit bounded retry acknowledging possible duplicate cost. Lease expiry alone does not authorize another provider call.
- Retry affects feedback only; it never creates another answer, plan credit or run completion. Pending/failed/unknown appears in the summary; learner can continue other items.
- Isolated tests use stubs for successful, rejected, timed-out, delayed and out-of-order feedback. Teaching quality requires separate qualified review; a schema-valid `ok` is not that acceptance evidence.

## 8. UI and acceptance contract

`/review/sessions/[sessionId]` shows current position, saved/total count, source label, prompt, uncertainty control for supported objective types, Save answer, Show previous answer, Pause and exit, and keyboard-accessible navigation. Save is disabled only while that submission is in flight. Failure keeps the input and offers Retry with the same request key.

Focus moves to the new prompt heading after confirmed advance. Saving/results use a polite live region. A reveal or conflict dialog returns focus to its trigger. All batch selection, replacement and pause/resume work without drag gestures. At 320px/390px and 200% zoom, controls remain reachable without clipped prompt/media or horizontal page scrolling.

The summary separates saved/unanswered, objective right/wrong, uncertain (which may overlap correctness), self-rated, AI pending/failed, blocked/replaced, and next due date. Counts explain overlaps. Cancellation and edited scopes are labeled explicitly. A completed run with feedback pending stays completed as practice.

| Test | Expected observation |
| --- | --- |
| Mixed run refresh/back/close after each answer | Fixed IDs/order/prompts; one saved answer per item; correct resume point |
| Disconnect before commit / after commit before response | No false completion / exact saved receipt on retry |
| Two tabs submit different answers; pause versus submit | One winner; recoverable conflict; no duplicate state or credits |
| Reveal before submit, including detail-page exposure | Practice saves; no independent recall advancement |
| Content edit/deletion, missing audio, expired media URL | Preserved valid snapshot or explicit block; refreshed authorized URL only; no false wrong answer |
| Vocabulary advanced elsewhere while run open | Saved non-scheduling response; box advances at most once |
| AI hangs or stale worker finishes later | Input/credit remain; bounded cost state; current generation wins |
| Source/attempt deletion after completion | Redaction and state/credit reconciliation; no private snapshot leak |
| Feature switch off during run | New commands disabled with saved data retained; exact receipts/status readable; re-enable resumes |
| Mobile, keyboard, expired login, account switch | Accessible controls and no cross-owner local/server leakage |

Implementation order: adapters/private DTOs → run schema and service → atomic objective submit → resume/outbox/reveal → writing operations → mixed UI → browser/failure acceptance. Start with a TCF reading run, then add all in-scope adapters before marking Batch C complete.
