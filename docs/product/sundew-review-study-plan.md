# Sundew — Complete Review Center and Study Plan Development Plan

Status: In development. Batch A is partly implemented; Batch B has a source-linked list. The complete review center and seven-day plan are not accepted.
Date: 2026-09-18.
Basis: current working-tree code, [Product vision](vision.md), the [V2 plan](sundew-v2-plan.md), and the current request.

Implementation specifications added 2026-09-22:

- [Isolated migration and recovery rehearsal](../operations/review-migration-rehearsal.md): separates existing 0029–0032 verification (M1) from future state/session backfill (M2), with fixtures, failure injection, and evidence requirements.
- [Unified review state](review-state-spec.md): fixes management transitions, canonical identities, due-event eligibility, vocabulary compatibility, queries, and command contracts.
- [Recoverable review sessions](review-session-spec.md): fixes snapshots, run/item states, transaction ordering, request replay, reveal rules, local recovery, and feedback operation fencing.

These are implementation contracts. A subsequent [isolated migration rehearsal](../operations/review-migration-evidence/2026-09-22/report.md) now supplies execution evidence for 0029–0034 and 25 focused database checks. The next step is the shared review state/schema and M2 backfill. Business database migration, review backfill, browser acceptance, and deployment remain unverified. Seven-day allocation parameters and Plan-specific APIs/UI still need their own implementation specification before Batch D.

This plan makes unified error review and multi-day practice planning explicit deliverables. Stage 1 implemented a learning home and review entry points; Stage 3 plans a next-activity recommendation. Neither already delivers this complete workflow. The non-speaking scope can be built and accepted while the Stage 2 speaking pilot remains unverified. Speaking evidence joins only after Stage 2 validation.

## 1. Goal, scope, and definition of done

The learner can **answer → collect an incorrect or uncertain item → inspect its source → retry → save the result and next review date → add it to a plan → see the saved completion in Today, Plan, and Progress**.

This increment must deliver:

- [ ] A searchable, filterable review center for TCF listening/reading, writing, vocabulary, conjugation, and runnable Quiz/cloze types.
- [ ] Original question or writing excerpt, prior answer, correct answer or feedback, explanation, history, and source link for each reviewable item.
- [ ] Single-item and batch review sessions that survive reloads and distinguish wrong, uncertain, due, and manually added items.
- [ ] Preferences for study days, daily minutes, and skills; a previewable, editable seven-day plan that becomes active only after acceptance.
- [ ] Task addition, replacement, rescheduling, pause/resume, and overdue handling without erasing completed history.
- [ ] Completion based on saved source attempts, with one consistent state across Today, Plan, and Progress.
- [ ] Passing evidence for behavior, ownership, migration, failure recovery, and interface acceptance.

The scope excludes new question banks, a full TCF writing exam, model-driven scheduling, external calendar sync, and notifications. General writing exercises remain labeled as general writing. A stable review state describes one item or target, not overall language mastery.

## 2. Verified baseline and missing capabilities

| Area | Existing code | Required work |
| --- | --- | --- |
| Review | /review links to vocabulary, TCF, and writing | Unified list, filters, details, management, sessions, and planning |
| TCF | Per-question attempts include correct/uncertain and drill/review/exam mode | Collect verifiable exam errors, grade exam answers server-side, deduplicate requests, unify due logic |
| TCF scheduling | deriveTcfLearningSummary calculates 3/7/14-day dates, while the review query still requires needsReview | Include confidently correct items after their next due date; align count and list |
| Writing | errors preserve correction, category, span, and source; microDrills store follow-ups | Management state, next review, disputes, versioning; save the response before requesting AI feedback |
| Vocabulary | vocabularyGaps has type, Leitner box, due date, and status | Log each new review, distinguish self-rating from objective grading, prevent duplicate box changes |
| Conjugation | Attempts store verb, tense, person, entered form, and expected form | Group exact targets into a persistent, targeted retry queue |
| Quiz/cloze | quizAttempts stores a client-submitted total score only | Per-question answers and server grading; label old total scores as lacking item detail |
| Today | A rule chooses one activity; today_focus stores date and key; daily aggregates infer completion | Multi-day plan records, fixed task scope, exact run/attempt credit |
| Settings/Progress | Goals, exam date, time zone, writing errors, TCF history | Plan preferences, execution history, consistent measures |

Source code inspected: src/lib/actions/today.ts, tcf.ts, errors.ts, vocab-gaps.ts, conjugation.ts, quiz.ts; src/lib/tcf/learning.ts; src/lib/vocabulary/gaps.ts; and src/lib/db/schema.ts. The currently runnable Quiz types are single choice and podcast cloze. Stub types cannot appear in a startable plan. These are code findings, not production acceptance results.

## 3. Page structure and behavior

| Route | Responsibility |
| --- | --- |
| /review | Due, All, Stable, and Archived views; source/skill/category/difficulty/date/state filters, search, batch retry, add to plan, pause, archive |
| /review/[itemId] | Source, feedback, chronological attempts, next due date, note, dispute flag, restore action; keep prior answers hidden until a retry attempt |
| /review/sessions/[sessionId] | Fixed item set, type-specific response controls, saved progress, pause/resume, completion summary |
| /plan | Today and the coming seven days, time estimates, task progress, overdue actions, edits, history, next-week entry |
| /plan/setup | Study days, time budget, skill preferences, goal summary, draft preview and acceptance |
| /today | Accepted plan's primary task, other tasks, completion and plan link; retain existing choice flow without a plan |
| /progress | Planned versus actual work, retries, and source-linked outcomes, separating new from repeated questions |
| /settings | Plan preference editing and a preview prompt when goal changes affect future tasks |

Preserve /tcf/review, /vocabulary/review, writing-feedback links, and existing Progress query links. Old and new entry points use the same state and scheduling services. Add Plan to desktop navigation; mobile retains Today/Training/Review/More with Plan linked from Today and More. Use English interface copy, French exercise content, and the existing design system.

Review cards state why an item is present: wrong, correct but uncertain, manually added, or feedback awaiting confirmation. A vocabulary gap is not automatically a wrong answer. Empty states distinguish no records, no due work, and no filter matches. A source failure is shown as unavailable rather than zero.

## 4. Source identity and legacy history

| Source | Stable identity | Collection and retry |
| --- | --- | --- |
| TCF | Owner + questionId | Wrong, uncertain, or manually added; retain media/passage; collect new exam errors without changing original exam score |
| Writing | Owner + errorId | Ready feedback with a valid original span; existing or new micro-drill tied to that error |
| Vocabulary | Owner + gapId | Active gap; recognition, listening, and production remain distinct with their existing practice formats |
| Conjugation | Owner + normalized verb/tense/person | Wrong or manually added; grade through the deterministic conjugation library |
| Quiz/cloze | Owner + questionId | New per-question wrong/uncertain attempts; retain material/audio; a single retry does not complete a whole set |

Repeated wrong answers add history to one card. Different writing errors keep distinct evidence, even when grouped by category. "Repeated across work" counts distinct submissions, not errors within one submission. No cross-skill mastery score.

Backfill TCF, writing, and conjugation per owner in pages, preserving timestamps and original verdicts. Older TCF exam writes accepted client-provided verdicts; use them for learning state only if the relevant question version can be verified. Otherwise show history without an inferred stable state. Seed vocabulary from the existing box/status/due date as a labeled migration state; never invent past successful attempts. Old Quiz/cloze totals remain visible but cannot generate guessed question-level errors. Backfill does not count toward new plans or call paid AI.

Before writing, produce a dry-run count of imported and unresolved sources. Make backfill repeatable and cursor-resumable, protected by owner/source uniqueness. On source deletion, remove executable work and private content copies. A plan may retain only a minimal "source deleted" state. Never match reimported questions by similar wording alone.

## 5. Review states, scheduling, and sessions

Separate three dimensions:

- **Management:** active, paused, archived. Pause may have an end date. Archive is reversible and is not mastery; a later error prompts a restore choice.
- **Learning:** needs_practice, consolidating, stable. Derive this from valid attempts for the exact target, with a policy version and evidence link.
- **Availability:** ready, feedback_pending, disputed, source_missing, unsupported. Unavailable evidence remains explainable but cannot support a recommendation or resolution claim.

A learner can flag and unflag disputed feedback; disputed evidence stops contributing to personalization. Changing a shared answer or rerunning assessment is explicit and preserves prior results and versions. Follow [Data quality](../operations/data-quality.md) instead of guessing source corrections.

Initial policy:

1. TCF, Quiz, and conjugation use inspectable 0/3/7/14-day intervals. Wrong or uncertain responses reset to needs_practice. Valid confident success extends the interval. Stable items can later become due again.
2. An optional immediate retry after a wrong answer is recorded but cannot repeatedly extend the interval or manufacture stability. Require three successful reviews across separate due events for stable. Early practice stays in history without counting as another due event.

   Implementation refinement (2026-09-22): non-vocabulary independent recall requires at least 24 elapsed hours after a wrong/uncertain answer or answer reveal, in addition to the due date. The item remains due and practice is allowed immediately. Details-page reveals count too. See the [exact reducer rules and example](review-state-spec.md#4-non-vocabulary-scheduling-policy-v1). Vocabulary retains its existing Leitner intervals.
3. Writing follows the same broad cadence only when feedback for the exact target is valid. Submission completion and feedback completion remain separate. Missing AI, timeout, or insufficient evidence cannot prove resolution. A fresh prompt and repetition of the original prompt are distinct.
4. Vocabulary keeps its current Leitner engine as the sole scheduling authority. The review index reads it rather than maintaining another box. Historical mastered means the current vocabulary cycle ended.
5. Due means active + ready + nextReviewAt at or before now. This includes formerly correct consolidating or stable items when their interval expires. Count, list, Today, and Plan use one predicate. Timed pauses resume through a common query/transaction path; archives do not.
6. Store due instants in UTC and interpret today/week/plan dates in the owner's IANA time zone. Changing time zone preserves past dates and previews future unstarted task changes.

For non-vocabulary sources, a shared pure function replays valid history and updates derived learning state/dueAt. Existing TCF entry points move to that service. Vocabulary's existing gap state remains authoritative; its review index is rebuildable. Do not run two schedulers for one source.

A review session fixes item IDs, order, content versions, and count on start. Default to 10, offer 5/10/20, and show the actual number when fewer exist. Explicit multiselection is limited to 20 and never silently includes an entire search result. Answer before revealing old results; revealing early is recorded and cannot count as independent successful recall. Save and confirm each response before advancing. Network retries use the same request identity, and reload continues after the last confirmed item without reshuffling. Reuse type-specific runners under common navigation. A missing prompt/media item is blocked and replaceable, not wrong. Session summaries separate saved, unanswered, right, wrong, uncertain, feedback pending, and next due dates. Completing a session means answers were saved, not that all were correct.

## 6. Seven-day study plan rules

### 6.1 Preferences, creation, and allocation

Reuse general/TCF goal, exam date, and time zone. Add studyDays, minutesPerDay, and skill preferences. Suggest weekdays and 20 minutes initially; allow 5–120 minutes and at least one study day. Generate seven consecutive local calendar days, visibly including rest days. Provide past plans and an explicit next-week action; page visits never create plans.

The baseline generator is deterministic and requires no speech service or model. Generate a new AI writing prompt only on activity start; if generation fails, offer an existing task or another available activity. A draft shows concrete tasks, item/response counts, estimated minutes, recommendation reasons, and sources. Acceptance activates it. Only one active schedule may cover a user's given date; replacing overlapping future work requires a preview.

Bind existing question sets to IDs at acceptance. A future due-queue task may bind source/filter/limit, show an estimated due count, and fix actual IDs at start with an explanation if the count changed. Stable ordering and a versioned rule make identical inputs yield identical drafts. Do not allocate the same question to several unstarted tasks or assume a future successful attempt.

Allocation order:

1. Preserve locked, started, and completed tasks.
2. Prefer due review, initially targeting about half of the daily budget, and honor manually scheduled items.
3. Use remaining time for goal-relevant new questions or output practice, rotating selected skills. Repeated errors may influence category choice but do not lower all difficulty.
4. Auto-schedule at most three tasks per day within the chosen estimated-time budget. Store the estimate version; never label estimated time as actual time.
5. Substitute a short exercise for a writing task that cannot fit. With unavailable content, schedule fewer tasks and explain why.
6. Show due backlog honestly; do not overflow the budget or dump all missed work onto the next day.
7. With no history, rotate available goal-relevant content and disclose missing skill coverage. Exam date may influence priority, not promise a score or pass.

Manually adding work beyond the budget shows the overage and offers replacement or another date; the learner can explicitly accept an over-budget day. Automatic generation cannot exceed the budget.

### 6.2 Task completion

| Task | Required saved evidence |
| --- | --- |
| Review N error/vocabulary targets | First valid saved response for N distinct fixed targets in the run; self-rating is marked; AI feedback may be pending |
| TCF listening/reading N questions | One saved response per fixed question, source, mode, skill, and level; a wrong answer still counts as practice |
| One writing response | Submission saved for the exact writingTaskId; feedback failure does not undo submission or prove improvement |
| Targeted micro-drill | Saved response tied to errorId and prompt version; feedback status remains separate |
| N conjugation targets | Saved verdicts for a fixed verb/tense/person set; repeating one target cannot increase count |
| Quiz/cloze | Saved answers for the whole fixed set or an explicit subset; subset work cannot complete the full set |
| Full TCF mock exam | Explicit addition with adequate budget; saved complete exam submission; later review never changes original score |

Do not automatically put a full mock exam into a 20-minute plan. Aggregate-only old scores, opening pages, reading explanations, and manually ticking a box do not complete tasks. Skipped and cancelled are distinct from completed.

### 6.3 Editing, overdue work, and Today

Allow move, replace, remove, lock, start, and resume. Pause/resume preserves records and previews rescheduling. Task states: scheduled, in_progress, completed, skipped, cancelled, blocked. Overdue is derived from the local planned date and lack of completion. Keep, reschedule, or skip overdue tasks. Rescheduling previews differences and applies them atomically against a revision; late completion retains planned and actual dates.

Goal, budget, and time-zone changes propose edits only for future unstarted tasks. Started/completed snapshots and a minimal change log remain. Today reads the accepted plan and lets the learner select a primary task. When all tasks finish, show completion and optional extra practice without adding work silently. Without a plan, keep Today's existing rule. Existing today_focus data is linked to the first plan only if its exact task/run can be verified; daily totals alone cannot prove completion.

Free practice remains in history and may be attached to a matching plan task after the server checks content, mode, time window, and unallocated attempts. One attempt credits one plan task. If a due queue empties before start, explain it and offer eligible work or explicit skip/replacement; absent items cannot count as complete. Missing sources after start keep a task blocked until explicit replacement or scope change.

Progress shows planned tasks completed, actual items attempted, and review outcomes separately. The execution denominator includes completed, pending, overdue, and skipped; cancelled stays in change history. Objective accuracy includes only graded answers with sample size and new/repeated status. Self-rating and pending AI feedback are separate. Estimated time is not actual time; a falling error count does not prove language improvement.

## 7. Data design and invariants

These are required responsibilities rather than fixed table names. Use PostgreSQL/Drizzle without adding a new database, vector index, or general agent platform.

| Entity | Minimum fields and role |
| --- | --- |
| reviewItems | Owner, sourceType/sourceKey, skill/category, managementState, pauseUntil, note, disputedAt/reason, availability, learningState, dueAt, policyVersion, revision, first/last observation. Unique owner + sourceType + sourceKey. Learning stats are rebuildable; user choices and notes are not overwritten. |
| reviewEvidence | Owner, reviewItemId, sourceAttemptType/ID/revision, role (error/retry/self-rating), confidence/provenance; unique resolvable linkage without copied body text. One response may support several observations but not advance one target twice. |
| quizQuestionAttempts | Owner, questionId, runItemId, optional quizAttemptId, answer, verdict, uncertainty, question/grader version, timestamp, request key; whole-set totals reconcile with item answers. |
| vocabularyReviewAttempts | Owner, gapId, runItemId, answer or self-rating, grading method, old/new box, policy version, timestamp, request key; saved in the same transaction as gap state. |
| practiceRuns / practiceRunItems | Owner, optional planTaskId, activity type, fixed targets/prompt snapshot and version, start and state; item order, saved answer reference, and resume position. |
| studyPlans / studyPlanTasks | Owner, period and time-zone snapshot, goal/preference snapshot, ruleVersion/revision; task date/order/type, fixed targets or bounded selection, estimated minutes, reason/evidence, lock, state, completion/reschedule timestamps. |
| studyPlanTaskCredits | Owner, taskId, sourceAttemptType/ID, target, link time; unique owner + attempt type + attempt ID so one answer credits one task and credits can be reconciled. |
| studyPlanChanges | Owner, plan/task, operation, before/after revision, timestamp, minimal changed fields; no duplicate private practice body. |
| practiceOperations | Owner, run/item, operation kind, request key/hash, lease/status, provider request ID, reserved/actual usage, failure category. Paid writing work cannot depend on a Stage 2 speaking-session foreign key. |
| Existing attempts / microDrills | Optional runItemId, request key, grader version; pending/ready/failed micro-drill feedback and save-before-AI response. Old data stays readable. |
| userSettings | Versioned plan preferences; compatible today_focus reads; active plans use planTaskId for the primary task. |

Invariants:

- Derive owner ID from authentication in every action. Enforce same-owner parent/child records with composite constraints. Validate polymorphic source references by source type, existence, and deletion behavior.
- Objective questions submit answers, server-issued run items, and request keys. The server loads questions and valid options and grades them. Client score, correct, and completed values are never authoritative. Label vocabulary self-rating.
- A unique logical request key plus content hash returns the first result for an exact retry and rejects a changed request. Retries cannot add attempts, scores, or Leitner increments; intentional extra practice gets a new identity.
- Commit the answer, review update, and task credit in a transaction. Save input and pending AI state before an external call; never hold a long DB transaction over that call. Bound AI time and cost, write results against an expected version, do not recall known successful operations, and preserve unknown provider outcomes/cost for safe recovery.
- A task has at most one active run; pause/resume reuses it. Replacing a run explicitly accounts for saved responses. An answer can credit at most one task, including attachment from free practice.
- Use revisions or row locks for plan edits, review changes, and run start. Old tabs cannot overwrite new decisions. An accepted target set/count changes only through explicit edit.
- Preserve content and grader versions. If an old session cannot be checked against its version, block regrading and offer a fresh or replacement session.
- Deleting an attempt replays review state and reconciles task completion. Pending feedback is not a success. Source deletion covers indexes, run snapshots, and evidence, retaining only minimal non-content plan changes where necessary.

Index owner + state/dueAt, sourceKey, and planDate. Use server pagination (default 20, maximum 100). Bound search input and search only owner-accessible text using parameterized queries. Lists fetch summaries; details load body/history. Limit candidate count for seven-day generation.

## 8. Service boundaries and code locations

| Suggested location | Responsibility |
| --- | --- |
| src/lib/review/ | Source adapters, evidence validation, pure state/scheduling rules, unified queries and DTOs |
| src/lib/study-plan/ | Preferences, seven-day rules, activity catalog, estimates, completion checks, reschedule diff |
| src/lib/practice/ | Fixed runs, type-specific execution, deduplication, save/resume without pretending grading is uniform |
| src/lib/actions/review.ts and study-plan.ts | Authenticated reads, edits, run commands, plan acceptance/rescheduling |
| Existing tcf.ts, quiz.ts, errors.ts, vocab-gaps.ts, conjugation.ts, tasks.ts | Reuse grading, add evidence/idempotency, connect old and new entry points |
| src/app/(main)/review/ and plan/ | Center, details, sessions, plan, setup; reuse type-specific components |
| Today, navigation, Settings, Progress | Accepted tasks, completion display, links, preferences |
| schema.ts, drizzle/, scripts/ | Additive migrations, backfill, index rebuild, consistency checks |

The server-owned activity catalog whitelists runnable types with input schema, availability, estimate, launch, and completion verifier. A model or URL argument cannot provide arbitrary page URLs, owner IDs, or completion results. Before implementation, consult installed Next.js docs again. This planning pass checked node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md, 07-mutating-data.md, and 01-app/03-api-reference/04-functions/revalidatePath.md. Authenticate each write entry point and refresh Review, Plan, Today, Progress, and relevant legacy routes.

## 9. Delivery batches

These batches do not replace V2 Stage 1/2/3. Sizes are relative effort, not dates.

Implementation checkpoint (2026-09-18): Quiz/cloze now submits per-question answers for server grading and saves item attempts; new TCF exam submissions are server graded and queued requests carry stable retry keys; TCF due selection includes previously confident answers when their interval expires; vocabulary review saves objective, deduplicated attempt records; micro-drill responses are persisted before AI feedback; /review shows recent source-linked items from TCF, writing, vocabulary, conjugation, and Quiz. Migrations 0029–0032 are generated but have not been applied to a database. The list is bounded and is not yet the complete center. Backfill, source management, fixed review runs, seven-day planning, and end-to-end acceptance remain open.

Checkpoint verification (2026-09-18): type checking, lint, all 94 tests, and the production build passed. The build required network access for the project's existing Google Fonts. At that checkpoint, no migration, isolated-database integration test, or live browser acceptance test had been run for this increment.

Design checkpoint (2026-09-22): the three linked implementation specifications now cover the first migration/state/session work. Code inspection identified follow-up gaps: cross-owner composite constraints, TCF immediate-repeat stability, vocabulary restore resetting boxes, answer-key exposure in existing runner DTOs, and micro-drill writes without lease-generation fencing. These are implementation/verification gates, not claims of tested exploitability. Quiz's current review list already reads per-question attempts; stable unified review identity and full item retry remain open. The earlier automated-check results above were not rerun during this documentation-only checkpoint.

Execution checkpoint (2026-09-22, after design): 0029–0032 passed empty/populated/rerun, failure/connection termination, and real dump/restore tests in an isolated local PostgreSQL instance. Initial integration checks reproduced missing same-owner parent constraints and stale micro-drill feedback overwrite. Additive 0033 and feedback-generation compare-and-set fix those failures; 0034 plus the conjugation action/UI preserve one request identity on retry. Final focused matrix: 25 passed, 0 failed, 2 not_run (M2 backfill and browser/auth/offline acceptance). Typecheck, lint, 94 application tests, the harness safety test, and production build passed. The test CLI's sandbox IPC restriction was bypassed with the equivalent `node --import tsx --test 'src/**/*.test.ts'` invocation. No existing migration files were rewritten, no paid AI was called, and no business database was migrated. TCF independent-due-event policy, vocabulary management compatibility, fixed runs, plans, and rollout acceptance remain open.

| Batch | Size | Work | Exit gate |
| --- | --- | --- | --- |
| A — Evidence and state | Large | Additive schema, identities, server grading, Quiz/vocabulary attempt logs, save-before-AI micro-drills, idempotency, ownership, common scheduling | Synthetic answers across sources collect correctly; retries do not duplicate; states and due dates agree |
| B — Review center | Medium | Pagination, search/filters, details/history, notes/disputes/pause/archive/restore, backfill preview | Traceable sources, matching counts/lists, labeled old Quiz limitations, owner isolation |
| C — Retry loop | Large | Fixed runs, type-specific response, mixed queues, media, resume, pending/failed AI, schedule write-back, old entry points | Error → retry → result → next due works; reload/disconnect preserves confirmed answers |
| D — Seven-day plans | Large | Preferences, catalog, draft/preview/accept, edits, lock/pause, overdue rescheduling, revision conflicts | Runnable plan without Stage 2 or speech credentials; budget and availability respected |
| E — Completion integration | Medium | Task → run → attempt credit, Today/Progress, free-practice attachment, old Today compatibility, refreshes | One answer credits one task; Today/Plan agree; submission and feedback remain distinct |
| F — Migration and acceptance | Medium | Empty/populated migration, repeatable backfill, owner/concurrency checks, browser/build checks, docs and demo | Evidence for the acceptance matrix; remaining unverified items listed honestly |

Dependencies: A → B → C; after A, D's pure rules and pages can start, while executable launches need C. C + D → E → F. Stage 2 pilot validation is not required for A–F.

First vertical slice: a TCF reading error → Review → retry → completed Plan task. This proves interfaces but is only a milestone. All in-scope sources must pass to finish the plan.

## 10. Acceptance matrix and checks

| Scenario | Required result |
| --- | --- |
| Wrong, uncertain, and manual additions across all in-scope sources | Correct card and source; repetition adds history, not another card |
| TCF correct but uncertain or confidently correct after its interval | Applicable item becomes due; count, list, Today, and Plan agree |
| Exam error followed by retry | Original exam score and item history remain unchanged |
| Client tampers with correct, score, question, or owner | Server grading/ownership rejects fabricated result or completion |
| Same-session correct repeats or answer revealed before retry | History persists without manufactured stable status |
| Concurrent/repeated vocabulary submission | Box changes once; self-rating differs from graded answer; missing content cannot become success |
| Several writing errors in one submission vs across submissions | One observation vs supported recurrence across work |
| AI failure, timeout, retry | Answer saved; known success not recalled; unknown cost/retries bounded; feedback pending visible |
| Old and new Quiz records | New records support item retry; old totals create no fictional error |
| Corrected/missing content or dispute | Explain unavailability, exclude affected recommendations, retain earlier versions |
| Archive/pause/restore | Preserve history; archive is not mastery; restore does not duplicate |
| Five-minute budget, empty content, rest day, backlog | Executable plan within automatic budget and honest constraints |
| Goal/time-zone/budget change | Preview future unstarted work; retain completed facts |
| Same-type tasks, repeated question, midnight continuation | Exact run/item credit, no double count, correct actual completion date |
| Two tabs edit/start simultaneously | Recoverable revision conflict; no duplicate active schedule or run |
| Overdue day or every task complete | No automatic pile-up; Today does not invent another task |
| Source/attempt deletion or content reimport | No private snapshot leak or broken executable link; dependent state reconciled |
| Owners A/B, expired login, partial source failure | No cross-owner access; failure is not zero; healthy sources remain available |
| Backfill rerun, interrupted migration, feature rollback | No duplicates, source counts reconcile, saved answers survive |

Test pure grouping, scheduling, plan allocation, calendar dates, and completion rules. Use an explicitly isolated PostgreSQL database for constraints, transactions, and backfill. Browser checks cover submit, reload/back, interruption/resume, and page agreement. Stub AI failures; record separate qualified-language review before claiming teaching quality.

Inspect desktop 1280px, mobile 390px/320px, 200% zoom, keyboard, and focus return. Selection, date change, and rescheduling need non-drag controls. Cover empty/populated history, disputed/missing content, feedback failure, in-progress, and completed states. Run relevant tests, npm run typecheck, npm run lint, npm run test, and npm run build during implementation. Planning does not run migrations or paid calls, and automation does not require immediate Stage 2 user testing.

## 11. Migration, rollout, and handoff

- Add nullable compatible fields and indexes before backfill/activation. Inspect the Drizzle journal and do not rewrite pending Stage 2 migrations.
- Isolated tests may include Stage 2 tables without enabling speech. Independent feature work still needs schema compatibility verification.
- Identify the target database explicitly. Existing operations notes say the available environment points to Azure; never run npm run db:init against an unidentified target. Rehearse empty/populated migrations, repeated backfill, and restore in isolation first.
- Add server-side REVIEW_CENTER_ENABLED and STUDY_PLAN_ENABLED switches initially, adapting names to project conventions. Turning off a feature preserves saved answers and legacy routes. Rollback does not delete new data.
- Record sanitized failure types, save/list latency, duplicate-request counts, and completion reconciliation discrepancies. Set test scale/environment in Batch A; an initial benchmark can use 10,000 attempts, 1,000 review items, and seven-day plans per owner. Report measured results, not assumed performance.
- Call paid AI only after the learner starts a model-requiring activity or requests feedback. Bound input, time, retries, concurrency, and spending. Listing, search, backfill, and baseline planning never call AI.
- Handoff includes schema/rules, migration/backfill/rollback instructions, status by source, automated/browser evidence, and a repeatable error → weekly task → saved completion demo.

Track coded, automated checks passed, integration/UI accepted, and deployed as separate states. Mark the complete review center and study plans delivered only after A–F and every in-scope source pass.

## 12. Stage 2 and Stage 3 boundary

After Stage 2 validation, add a speaking adapter for versioned assessments, issue IDs, original evidence, and follow-up attempts. Exclude disputed transcriptions, invalid media, and incomplete assessments. Apply the same item identity, queue, task completion, and ownership rules without redesigning the plan core.

Stage 3 may reuse the activity catalog, evidence references, rule baseline, and acceptance-before-save workflow. It still needs a shared learning-signal contract, bounded model tools, and a separate recommendation evaluation. An agent proposal must pass the same plan validation and user acceptance before saving. This increment alone does not complete Stage 3.

Recommended order: implement A–F while the Stage 2 pilot waits for validation; later validate speaking, integrate its adapter, and evaluate whether Stage 3 model recommendations outperform the rules.
