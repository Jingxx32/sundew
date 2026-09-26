# Sundew V2 — Stage 2 Development Plan

Status: In development. Core private Task 2 code is present in the working tree; live pilot gates remain open.
Date: 2026-09-15
Parent plan: [Sundew V2](sundew-v2-plan.md)
Prerequisite: [Stage 1](sundew-v2-stage1-plan.md), including its outstanding populated-history acceptance check.

Implementation and deployment status: [Speaking pilot operations](../operations/speaking-pilot.md).

## 1. Delivery objective

Deliver one authenticated TCF Canada Task 2 speaking workflow:

**Prepare → lead a spoken interaction → receive evidence-linked feedback → complete a relevant follow-up → revisit saved history.**

A learner must be able to complete this loop with one original scenario. Reloads, provider failures, and repeat requests must preserve confirmed work without producing duplicate assessments or unbounded charges. The release is a private practice pilot; it does not certify a TCF level or demonstrate learning improvement.

This plan turns the parent Stage 2 scope into implementation decisions, batches, and acceptance gates. Proposed filenames and schema additions may change during implementation if their responsibilities and compatibility guarantees remain intact.

## 2. Scope and product decisions

### Included

- One original, versioned Task 2 scenario, with learner and partner roles.
- Explicit preparation, conversation, completion, assessment, and follow-up screens.
- Short spoken turns: record, submit, hear the AI partner's response, then continue.
- Persistent transcript, authorized recording playback, structured feedback, and history.
- Up to three supported observations and one suggested follow-up drill per assessment.
- Owner checks, private media, bounded paid operations, operational telemetry, and a disable switch.
- Desktop and mobile browser support, with an explicit tested-browser list.

### Deferred

- Tasks 1 and 3, a large scenario library, full TCF writing, and open-ended conversation.
- Full-duplex speech, interruption handling while the partner speaks, and continuous realtime transport.
- CEFR/CLB predictions, official-looking scores, cross-skill mastery claims, and adaptive difficulty.
- The Stage 3 coach, shared learning-signal platform, vector retrieval, and autonomous tools.
- Anonymous paid voice access, broad multi-user rollout, and production deployment changes.

### Interaction choice

Use a turn-based voice pipeline for the first pilot. Reuse the existing French speech stack where the capability spike verifies that it is suitable. Keep transcription, partner response generation, speech synthesis, and pronunciation assessment behind separate server-only adapters. Provider/model selection is finalized in Batch A from measured quality, latency, and cost; this plan makes no claim that an existing model or SDK already supports every required operation.

AI partner responses must be audible in the normal workflow. A text-only exchange can support development and an explicitly labeled degraded experience, but cannot satisfy the voice acceptance gate. Pronunciation analysis is a separate optional capability; its absence must not prevent a supported transcription-and-dialogue workflow.

Use English interface and feedback copy, with French scenario instructions, dialogue, and exercise examples. Preserve the existing Sundew design system and script-practice flow.

## 3. Task format and original scenario

### Official format reference

FEI's indexed TCF Canada guidance and oral sample describe Task 2 as an information-seeking interaction, lasting 5 minutes 30 seconds including 2 minutes of preparation. The sample explicitly allocates 3 minutes 30 seconds to dialogue. Sources: [TCF Canada](https://www.france-education-international.fr/test/tcf-canada), [official oral sample](https://www.france-education-international.fr/document/tcf-tp-qc-ca-exemple-epreuve-eo).

Research note, 2026-09-15: official search-index excerpts were accessible; direct page/document requests returned access-denied responses. Recheck the complete current guidance and [examiner manual](https://www.france-education-international.fr/document/manuel-examinateur-tcf) during Batch A before freezing task behavior or evaluation criteria. The practice rubric below is a Sundew product rubric, not a reproduction of an official scoring grid.

### Pilot scenario: asking about a photography workshop

The learner wants to join a beginner photography workshop at a community center. The AI plays the reception employee. The learner initiates questions to understand the schedule, price, equipment, prerequisites, and registration arrangements.

Author a small scenario package containing:

- Stable scenario ID, version, authorship/rights annotation, and review date.
- French learner instructions and role/register expectations.
- A server-only fact sheet: fixed schedule, fee, location, equipment policy, and registration details.
- Partner behavior rules, allowed clarifications, and examples for evaluation.
- A small set of related follow-up prompts that vary the detail being requested.

The listed information topics guide authoring and review; they are not an official checklist or a mandatory number of questions. Accept relevant alternative questions. Do not copy competitor prompts or import the existing question bank into the pilot without rights review.

The partner answers what was asked, remains consistent with the fact sheet, and allows natural clarification. It does not take over by interviewing the learner, reveal all facts at once, or coach grammar during the assessed conversation. Missing scenario facts receive a consistent in-role response rather than invented policies.

### Timing policy

- Store a format version with 120 seconds of preparation and a nominal 210-second interaction budget.
- Label the initial experience **Task 2 practice**. For usability, exclude server-recorded provider waiting time from the interaction budget; include learner thinking, recording, and partner playback time.
- Store wall-clock duration and excluded waiting separately. The compensated timer is a practice accommodation, not an exact recreation of exam timing.
- Cap the complete session at 10 minutes of wall time after preparation starts. Provider waits cannot extend a session indefinitely.
- Persist server timestamps and accumulated exclusions. Reloading, opening another tab, or changing the local clock cannot reset a timer.
- Leaving the page does not pause learner time. On return, reconcile the persisted deadline and either continue or show the completed/interrupted state.
- At the conversation deadline, accept only the bounded in-flight audio turn that started in time, then finalize; do not start another partner exchange. Record any overrun, capped by the per-turn limit.

Revisit compensation only after latency is measured. A strict exam-timed option is not required for Stage 2.

## 4. Verified repository baseline

These findings describe the inspected working tree, not production behavior.

| Location | Existing behavior | Stage 2 change |
| --- | --- | --- |
| `src/lib/actions/speaking.ts` | Owner-scoped prompts/scripts and script-session start/finish actions | Add simulation-specific actions and mode guards; retain script behavior |
| `src/lib/db/schema.ts` | `simulation` mode already exists; sessions have active/completed/abandoned status, generic report, and pronunciation scores | Add explicit simulation progress, immutable assessment provenance, and follow-up records |
| Same schema | Turns have order, role, transcript, audio path, and Azure assessment | Add idempotent turn identity, timing, provenance, and private asset references |
| Same schema | Deleting a prompt cascades to sessions | Protect new simulation history from scenario removal; migrate deliberately |
| `src/app/api/speaking/assess/route.ts` | Authenticates; checks an optional session owner; stores WAV files in `public/media/speaking` | Close public recording writes and add validated private storage before pilot |
| `src/lib/speech/azure.ts` | Single-utterance pronunciation recognition; code documents roughly 30-second speech scope | Verify short-turn capability; do not send an entire conversation to this helper |
| `use-wav-recorder.ts` | Produces 16 kHz mono PCM16 WAV using a deprecated `ScriptProcessorNode` | Add bounded recording, cancellation, teardown, and browser checks; decide capture upgrade in Batch A |
| `src/lib/storage/r2.ts` | Signs private R2 reads; development fallback returns a media path | Add recording writes/deletes and an owner-aware access layer; private recordings must never use the public fallback |
| `src/app/api/media-url/route.ts` | Authenticates but accepts an arbitrary media path without an owner lookup | Prevent it from signing learner recording keys; authorize recordings through their database owner |
| `src/lib/ai/client.ts` | Lazy server client and configurable existing model roles | Add explicit dialogue/assessment configuration and adapter-level usage reporting |
| `/training`, `/speaking`, `/tcf` | Existing entry points and independent TCF layout | Link to one simulation history and engine from each relevant entry |

Do not store simulation task performance in `SessionScores.overall`: existing lists interpret that value as a pronunciation score. Also ensure legacy `finishScriptSession` cannot finalize a simulation session.

## 5. Learner journey and routes

| Screen | Content and actions | Persistence rule |
| --- | --- | --- |
| Entry | Task 2 description, scenario, estimated time, microphone check, recording policy, Start | Loading the page never starts a paid operation |
| Preparation | French task card, optional private notes, countdown, Begin conversation | Create one owned session on explicit start; save scenario snapshot and deadline |
| Conversation | Role context, remaining time, Record/Stop, processing status, partner playback, Finish | Save each accepted turn and its partner response independently |
| Completion | Saved-turn summary, transcript, interruption details, Generate feedback | End the conversation once; assessment has its own status |
| Feedback | Evidence-linked observations, limitations, improvements, Start follow-up | Display the saved assessment; reload must not regenerate it |
| Follow-up | One focused prompt, spoken attempt, bounded feedback | Link the attempt to its source issue and original assessment |
| History | Date, scenario, completion/assessment state, transcript, playback, follow-up | Owner-scoped reads; expired recordings remain clearly marked |

Proposed routes:

- `/speaking/task-2`: scenario entry and recent simulation sessions.
- `/speaking/sessions/[sessionId]`: preparation/conversation/completion, driven by saved state.
- `/speaking/sessions/[sessionId]/feedback`: assessment and linked follow-up.
- `/speaking/history`: paginated history, with explicit script/simulation labels.

Keep `/speaking/[promptId]/script` and its records accessible. Route choices must be checked against the existing dynamic segment before implementation. TCF and Training link to the same session URLs and do not create duplicate histories.

Keyboard users can operate recording and playback without hold-to-talk. Announce status changes without reading every timer tick. Stop microphone tracks and playback on unmount, cancellation, logout, and session termination. Show unsaved audio honestly: a recording still only in browser memory is not recoverable after reload.

## 6. State and data contracts

### Session and operation state

Keep coarse session status (`active`, `completed`, `abandoned`) compatible with existing records. Add a simulation-only phase (`preparing`, `conversing`, `finished`) and completion reason (`user_finished`, `time_expired`, `interrupted`, `budget_exhausted`). Assessment and follow-up status belong to their own records.

| Transition | Server-side conditions |
| --- | --- |
| Create → preparing | Authenticated eligible owner; scenario enabled; idempotent start key; no conflicting active session |
| Preparing → conversing | Owner and expected revision match; preparation elapsed or learner explicitly begins |
| Conversing → accept turn | Session open; timing/input limits pass; turn key new or replayable; budget reserved |
| Conversing → finished | Explicit finish, expired timer, or terminal interruption; settle/reconcile any in-flight operation |
| Finished → assessment requested | Frozen transcript revision; usable evidence; one logical request per assessment version |
| Assessment ready → follow-up | Valid issue belonging to the same owner/session; eligible approved drill |

Terminal conversation states never reopen through retry. An explicitly restarted practice creates a new session linked to the prior one. A session with no usable speech can be saved as finished, but receives an insufficient-evidence result instead of invented feedback.

### Proposed persistence

| Entity | Minimum fields and invariants |
| --- | --- |
| Existing `speakingSessions` | Simulation phase, revision, scenario/version snapshot, timing policy, preparation/conversation timestamps, deadlines, excluded wait duration, finish reason; new fields nullable for script records |
| Existing `speakingTurns` | Stable turn/request ID, authoritative order, role, original transcript, recognition status, asset reference, timestamps, audio duration, provider/version; user ownership must match the session |
| `speakingAssessments` | Owner/session, transcript revision/hash, rubric/prompt/model/schema versions, status, structured result, evidence references, limitations, creation/completion timestamps |
| `speakingFollowUps` | Owner, assessment/issue ID, drill/version, prompt snapshot, attempt transcript/audio reference, bounded feedback and status; retain each intentional retry |
| `speakingRecordingAssets` | Owner/session/turn or follow-up reference, opaque object key, MIME/size/duration/checksum, retention deadline, deletion state |
| `speakingOperations` | Owner/session, operation kind, idempotency key and request hash, status/lease, provider request ID, reserved/actual usage and cost, pricing version, sanitized failure category |

These are Stage 2 records, not a general agent platform. Reuse existing tables where semantics genuinely match. Keep provider secrets and scenario partner facts out of client DTOs.

Database constraints must enforce unique logical requests and same-owner parent/child relationships. A partial uniqueness rule can apply to new simulation turns; do not impose `(sessionId, orderIndex)` uniqueness on legacy sentence retries. Use a transaction/row lock or revision compare-and-swap for concurrent phase changes and budget reservations.

Protect simulation history with scenario snapshots and a deliberate foreign-key policy, such as nullable prompt reference with `SET NULL`; update affected readers if chosen. Schema migrations must remain compatible with old script rows and be tested on both empty and populated fixtures. Use the repository's Drizzle migration path; do not execute migration scripts against an unidentified database.

### Evidence contract

Each observation contains a stable issue ID, category, plain-language claim, evidence references, confidence/quality limitation, and an optional approved drill ID. Evidence resolves to a user turn and an exact transcript span or a recording asset with a valid time range. Partner speech cannot be cited as learner performance.

Preserve original machine transcription. In Stage 2, let the learner flag a transcription problem; do not silently overwrite it or evaluate a manually corrected transcript as recorded speech. Exclude disputed evidence from new personalized claims. A material source change requires a new explicit assessment version, preserving the earlier result and its provenance.

## 7. Voice pipeline and request behavior

1. Authenticate, resolve the owned session, and validate phase/revision.
2. Validate request key, input length, decoded audio format/duration, and server deadline.
3. Reserve a conservative cost bound and acquire the session operation lease atomically.
4. Persist the accepted recording privately and record its operation identity.
5. Transcribe the short learner turn; persist the result and quality limitations.
6. Generate a concise in-role response using the fixed scenario and bounded conversation history.
7. Save the response text before synthesis, then synthesize and store partner audio for replay.
8. Commit operation results, settle usage, and return minimal updated session state.

Record stage progress so a synthesis failure can retry synthesis without retranscribing or regenerating the reply. Store model output as untrusted data and validate it before persistence/rendering. Scenario instructions and learner transcripts cannot invoke tools, change limits, or change the assessment rubric.

Suggested HTTP boundary: `POST /api/speaking/sessions/[sessionId]/turns` for audio and `GET /api/speaking/recordings/[assetId]` for authorized playback. Keep create/begin/finish/assessment/follow-up commands in simulation actions calling shared server-only services. Every boundary authenticates and authorizes independently; layout authentication is insufficient. Validate same-origin protections for mutating browser routes.

Do not rely on browser polling to start work or on an unawaited promise surviving a request. Initially use bounded awaited operations with persisted progress. Batch A must verify host request limits; if assessment cannot reliably finish within them, use an explicitly managed worker and durable job claim before enabling the pilot. Polling reads state only and stops at terminal states or a defined timeout.

## 8. Assessment and follow-up

### Practice rubric v1

| Dimension | Evidence that may support feedback | Limit |
| --- | --- | --- |
| Information seeking | Relevant questions and obtained details | Do not require a fixed question count or exact wording |
| Interaction management | Initiation, clarification, follow-up, response to partner information | Account for partner failures and incomplete exchanges |
| Language use | Observable question formation, vocabulary, grammar, register | Uncertain transcription cannot establish an error |
| Intelligibility/pronunciation | Valid audio analysis tied to a specific segment | A transcript-only model cannot infer accent, prosody, or pronunciation quality |

Use descriptive outcomes (`supported`, `needs_practice`, `insufficient_evidence`) per dimension, with bounded examples. No overall numeric TCF/CEFR/CLB score. Azure pronunciation outputs, if shown, appear in a separate clearly labeled panel; missing measurements are null/unavailable, never zero.

Structured output includes one short summary, supported positive observations when available, up to three issues, source evidence, suggested improved French examples, one follow-up choice, and explicit limitations. A suggested improved sentence is an example, not a quote of what the learner said.

Reject nonexistent turn IDs, quotes that do not match stored text, invalid audio intervals, unsupported drill IDs, and claims outside available evidence. Permit at most one bounded repair attempt; otherwise save a recoverable failure and show the transcript. Never manufacture a successful result after validation failure.

### Follow-up v1

Use a small authored drill catalog covering question formation, asking for clarification, and responding with a relevant follow-up question. Select one drill only when the assessment evidence supports its category; otherwise offer optional general practice without claiming a diagnosed issue.

Each drill includes one worked example and a new French prompt requiring a spoken response. Save the attempted response before evaluation so feedback failure does not lose the attempt. A deterministic check may verify an unambiguous form; open-ended semantic judgments require the same bounded, evidence-linked assessment rules. Avoid brittle keyword-only grading of valid alternatives.

Show the local outcome as an observation about this attempt. One successful retry does not establish mastery, improvement across contexts, or retention. Keep the source issue and follow-up linked for Stage 3 to consume later.

## 9. Privacy, limits, and recovery

### Private recording boundary

- Store recordings outside `public/` in every environment. Use a private bucket in deployment and a non-public local directory with authenticated streaming in development.
- Resolve recording access by asset ID → owner/session lookup → trusted object key. Do not accept arbitrary filesystem paths or object keys from the browser.
- Prevent the generic `/api/media-url` signer from granting access to recording namespaces. A separate guarded endpoint does not fix an existing alternate access path by itself.
- Prefer authenticated streaming or short-lived signed URLs issued only after owner checks. If using signed URLs, document their bearer-link lifetime and avoid logging them. Set private/no-store responses.
- Before the pilot, stop legacy public recording writes; inventory existing files, back them up, migrate references and objects, verify playback, then remove public copies and verify direct URLs no longer serve them. Do not treat an obscure UUID as authorization.
- Disclose recording, AI processing, and retention before microphone submission. Proposed retention: recordings expire after 30 days; transcript/feedback remain until the learner deletes the session. Provide manual session deletion and an executable, deployed cleanup mechanism; document backup/provider retention separately.
- Deletion first blocks access, then removes assets and dependent learner data with retryable cleanup. Retain only the minimal sanitized usage ledger required for budget integrity.

### Initial engineering limits

These are proposed configurable pilot defaults, not measured provider capabilities or price estimates. Batch A must confirm that they support a usable session and record any revision before live use.

| Limit | Proposed starting value |
| --- | --- |
| Active simulation sessions | 1 per owner |
| In-flight paid operation | 1 per session; 2 globally for the private pilot |
| Learner audio turn | 30 seconds; 2 MiB maximum; decoded format/duration checked |
| Accepted learner turns | 12 per session; silence and failed calls still consume request/usage limits |
| Turn submissions | 24 per session; additionally rate-limited per owner |
| Partner response | At most 2 short sentences; 300 output tokens maximum |
| Provider operation timeout | 20 seconds per turn-stage call; 45 seconds per assessment call |
| Automatic retries | At most 1 for a known retryable operation, within time and cost budgets |
| Assessment output | At most 2,000 output tokens; bounded input from the stored session |
| Follow-up attempt | 30 seconds of audio; at most 3 attempts per source assessment |
| Cost ceilings | Provisional USD 1 per session including follow-up, USD 5 per owner per UTC day, USD 25 total pilot |

Configure explicit input-token limits and a versioned price table once adapters are selected. Fail closed if prices or required budget controls are absent. Reserve the maximum permitted cost before each call, including retries, then reconcile actual usage. Concurrent requests and new sessions cannot bypass owner/global ceilings. SDK automatic retries must be included in the same policy.

Unknown provider outcomes remain conservatively charged/reserved until reconciled; never blindly replay a timed-out paid request. Exactly-once external billing cannot be assumed without provider support. The application must guarantee one committed logical result and bounded exposure to uncertain calls.

The server-side disable switch prevents new paid operations while allowing history reads and deletion. Show which capability is unavailable when credentials, budget, or infrastructure are missing.

### Failure behavior

| Failure | Required outcome |
| --- | --- |
| Microphone denied/unavailable | Explain recovery; no paid request; preparation can be restarted explicitly |
| Silence or unusable audio | No proficiency claim; bounded retry; retain useful prior turns |
| Network loss before acceptance | Mark current recording unsaved; preserve confirmed history |
| Response lost after acceptance | Recover by request key; return saved progress/result without duplicate work |
| Transcription failure | Preserve authorized audio if uploaded; allow a bounded stage-specific retry |
| Partner generation/synthesis failure | Save completed stages; expose text if available; mark degraded/incomplete voice experience |
| Refresh or second tab | Fetch authoritative revision/timer; reject conflicting commands |
| Finish races with a turn | Serialize finalization; freeze the accepted transcript before assessment |
| Budget exhausted | Stop new paid work; retain saved transcript and explain feedback availability |
| Assessment invalid or failed | Keep conversation complete; show feedback failure separately and allow permitted retry |
| Audio expired/deleted | Keep honest evidence status; no broken playback or claim that audio remains reviewable |
| Process crash or stale lease | Reconcile operation state and reservations; prevent blind replay and indefinite lockout |

## 10. Development batches

All items below are open. Complete each gate before progressing to live use of the next dependent batch.

### Batch A — Task contract and technical feasibility

- [ ] Resolve Stage 1's remaining populated-history verification before expanding the product flow.
- [ ] Read `AGENTS.md` and installed Next.js guides for route handlers, server functions, and data security before application edits.
- [ ] Recheck complete official task guidance; record sources, timing policy, and rubric limitations.
- [ ] Author and review the photography-workshop scenario and partner fact sheet.
- [ ] Run a bounded adapter spike using original/synthetic French audio: transcription, dialogue, synthesis, optional pronunciation, usage, timeout, cancellation, and retry behavior.
- [ ] Verify recording capture on target browsers; decide whether to replace the deprecated capture path with AudioWorklet now.
- [ ] Select model/provider settings, validate host execution limits, and freeze tested cost ceilings and input limits.
- [ ] Record choices in a short Stage 2 architecture/decision note, including failed experiments.

**Gate:** Task contract, provider path, timing accommodation, deployment execution model, and conservative cost accounting are explicit and feasible. Mock adapters can support subsequent development when live services are unavailable, but do not count as pilot evidence.

### Batch B — Persistence, ownership, and private media

- [ ] Add schema/migrations, constraints, scenario seed, and versioned DTO schemas.
- [ ] Implement session transitions, request identity, revision checks, and database-backed operation/budget controls.
- [ ] Add private recording upload/read/delete services and close generic-signer bypasses.
- [ ] Update legacy recording writes and add a dry-run migration tool for existing public audio.
- [ ] Add retention/deletion cleanup and crash-recovery behavior for orphan assets and stale operations.
- [ ] Preserve script retries, script scores, existing URLs, and historical session readers.
- [ ] Test migrations, owner isolation, replay/conflict semantics, and budget reservation races against an isolated database.

**Gate:** An owned mock session survives reload; another identity cannot read or mutate it; private media has no public access path; concurrent requests cannot bypass limits.

### Batch C — Complete voice conversation

- [ ] Build entry, device check, preparation, conversation, and completion UI.
- [ ] Implement record/submit/playback with bounded buffers, cancellation, and teardown.
- [ ] Connect the staged voice pipeline, authoritative timing, turn ordering, and persisted response recovery.
- [ ] Enforce learner-led partner behavior and fact-sheet consistency.
- [ ] Add explicit finish, expiry, interruptions, failure states, and resume behavior.
- [ ] Link TCF/Training entry points to the same simulation engine.

**Gate:** One private learner can complete an audible Task 2 interaction and reopen its saved transcript/recordings. Reload, two tabs, network failure, and time expiry behave as specified.

### Batch D — Evidence-linked assessment

- [ ] Implement rubric v1, structured output schema, provenance, and evidence validators.
- [ ] Freeze accepted transcript revision before assessment; implement idempotent generation and recovery.
- [ ] Build feedback UI with linked transcript/audio evidence, examples, limitations, and insufficient-evidence states.
- [ ] Keep pronunciation displays separate and preserve missing/uncertain measurements.
- [ ] Validate feedback against synthetic cases and a competent French reviewer where available.

**Gate:** Every personalized claim resolves to valid learner evidence; insufficient input produces no invented score; duplicate assessment requests do not create duplicate completed reports.

### Batch E — Follow-up and saved learning loop

- [ ] Author the three small drill types and validate their identifiers/versions.
- [ ] Select one supported drill, save its spoken attempt, and provide bounded evidence-linked feedback.
- [ ] Build session history, playback/deletion controls, and source-issue/follow-up navigation.
- [ ] Add verified recent speaking activity to existing surfaces where its meaning is clear; do not count one session and its feedback as two completed conversations.
- [ ] Preserve Today selection semantics; do not automatically add a new daily task after completion or build the Stage 3 recommender.

**Gate:** Conversation → assessment → relevant follow-up → saved history works after reload and re-login, with one canonical history and no mastery claim from a single retry.

### Batch F — Private pilot and release evidence

- [ ] Run the regression, adversarial, accessibility, visual, and build checks below.
- [ ] Verify backup/restore and recording migration in an isolated deployment before any authorized production change.
- [ ] Run the bounded private pilot and document latency, cost, failures, and feedback review.
- [ ] Confirm public demo remains curated/precomputed with separate credentials/data boundaries.
- [ ] Publish repository documentation of implemented scope, limitations, operational controls, and unresolved blockers.

**Gate:** The parent Stage 2 acceptance criteria and the pilot thresholds below pass. No broader rollout or additional scenarios until evidence supports expansion.

## 11. Expected file responsibilities

| Area | Proposed files or existing integration points |
| --- | --- |
| Domain types and validation | `src/lib/speaking/types.ts`, `schemas.ts`, `state.ts`, `timing.ts` |
| Original content and rubric | `src/lib/speaking/scenarios/`, `rubric.ts`, `drills.ts` |
| Server orchestration | `src/lib/speaking/service.ts`, `operations.ts`, `assessment.ts`, `follow-up.ts` |
| Actions | `src/lib/actions/speaking-simulation.ts`; mode guards in existing `speaking.ts` |
| Speech/model adapters | `src/lib/speech/`; bounded AI partner/feedback modules in `src/lib/ai/` |
| Storage | `src/lib/storage/speaking-recordings.ts`; existing R2 helper and media signer |
| Persistence | `src/lib/db/schema.ts`, reviewed `drizzle/` migration files |
| HTTP | Session turn upload and recording playback routes; legacy assess-route remediation |
| UI | New speaking routes and focused components; existing recorder shared only where semantics match |
| Operations | Dry-run recording migration and retention cleanup scripts; deployment runbook |
| Verification | Pure domain tests plus database/route integration tests; browser checks with saved outcomes |

Keep domain rules independent of React and provider SDKs. Avoid adding empty abstractions merely to match this file list.

## 12. Verification and pilot acceptance

### Required checks

| Test group | Minimum coverage |
| --- | --- |
| State/timing | Legal/illegal transitions, early begin, deadline, overrun, reload, local-clock changes, race with finish |
| Ownership | A/B identities for session, turn, assessment, follow-up, recording read/write/delete; generic media signer bypass |
| Idempotency | Repeated keys, same key with changed payload, response loss, simultaneous tabs, crash after provider call |
| Budget | Concurrent reservations, stale lease, unknown usage, per-session/day/global ceilings, retry limits, disable switch |
| Audio | Empty/malformed/oversized/wrong-format audio, duration mismatch, silence, cancellation, private playback and expiry |
| Partner | Role consistency, fixed facts, learner-led exchange, off-topic requests, injection attempts, long input |
| Feedback | Incorrect/missing evidence ID, fabricated quote, partner quote, uncertain transcript, unsupported audio claim, invalid drill |
| Follow-up | Related prompt, valid alternative answer, saved attempt with failed feedback, retry limits, source deletion |
| Compatibility | Old script session scores, repeated sentence recordings, prompt lists, history, deep links, no duplicate Today completion |
| Browser/accessibility | Desktop and mobile, keyboard, focus, screen-reader status, 320/390 px layouts, missing devices, background-tab return |

Use the repository's test runner for pure logic and targeted integration tests against an explicitly isolated test database. Stub provider calls for failure/race tests; use only synthetic or consented audio in live checks. Run `npm run typecheck`, `npm run lint`, relevant tests, and `npm run build`; record environmental blockers and existing failures separately from Stage 2 regressions.

### Small versioned evaluation set

Prepare at least 12 review cases before tuning prompts: competent interaction, basic but understandable speech, question-formation error, successful clarification, repeated irrelevant questions, isolated error, silence, poor transcription, noisy audio, early interruption, partner failure, and prompt injection. Include expected supported observations and prohibited conclusions. Store original/synthetic fixtures and evaluator notes without private production material.

All evidence/ownership/budget adversarial checks must pass. Have a competent French reviewer judge at least 10 of 12 cases appropriate using the frozen rubric, with zero fabricated evidence or severe misleading claims. If only developer review is available, report that limitation and keep language-quality validation pending rather than claiming it passed.

### Live pilot targets

Collect at least 10 consented private sessions, with at least 5 complete conversation → assessment → follow-up loops. These are engineering smoke-test counts, not a learning-outcome study. Record participant count and do not invent users to meet a target.

Provisional acceptance targets, to freeze in Batch A before collecting pilot results:

- At least 90% of valid turn submissions complete without a manual retry; intentional failure-injection cases are reported separately.
- End-of-recording to audible partner response: p95 no more than 8 seconds; assessment ready: p95 no more than 30 seconds. Also record upload, transcription, generation, synthesis, and playback-start components.
- No configured cost ceiling is exceeded; report estimates, reconciled provider usage, and unknown outcomes separately.
- Every finished session remains readable after reload; every completed assessment/drill resolves to its source evidence.
- Zero cross-owner access, public recording exposure, duplicate committed assessments, or unsupported proficiency scores.

Publish sample sizes, raw counts, median/p95/max, known interruptions, and missing observations. Small-sample percentiles are diagnostic only. If latency or quality misses the gate, improve the failing component or narrow the pilot; do not silently redefine the thresholds after observing results.

## 13. Handoff and first implementation slice

Stage 2 handoff consists of the working private flow, migration/retention runbook, architecture decisions, versioned evaluation results, sanitized latency/cost traces, and release notes separating implemented behavior from limitations. Update the parent checklist only for work actually verified.

Start with **Batch A, then a narrow Batch B slice**: original scenario → explicit session creation → saved preparation state → reload → authorized private mock-turn storage/playback. Prove ownership, private storage, state recovery, and operation accounting before connecting paid dialogue calls. Then complete the remaining batches in order.

Implementation has begun, but the new migration has not been applied and no paid
speech session or production access change has been made. See the linked pilot
operations note for current validation and outstanding gates.
