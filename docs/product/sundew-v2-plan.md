# Sundew V2 Implementation Plan

Status: Stage 1 implemented in the working tree; Stage 2 in development; Stage 3 planned.
Date: 2026-09-15

## 1. Purpose and scope

Build a personal French-learning workspace that helps a learner understand their
recent practice and choose a useful next activity. TCF Canada is an exam goal
within that workspace. Daily learning and exam preparation share evidence while
retaining distinct tasks, timing, and assessment expectations.

V2 also serves as a portfolio project: demonstrate a reliable learning workflow,
bounded AI tool use, privacy controls, and measured engineering decisions.
Completion means a small, demonstrable release with documented limitations;
competitor feature parity is not a release requirement.

This plan specifies the target release; implementation status is recorded in each
stage plan and must not be confused with validated live capability. It refines the product
direction in [Product vision](vision.md) and remains subject to
[Deployment and security](../operations/deployment-security.md). It does not
authorize changing production settings, publishing new learner data, or enabling
anonymous paid AI access.

## 2. Lessons from BonTCF

Reference: five user-provided BonTCF page PDFs and a dictionary screenshot,
captured on 2026-09-15. These show navigation and advertised capabilities, not a
verified implementation or an evaluation of their quality.

| Observation | Decision for Sundew |
| --- | --- |
| Listening, reading, writing, and speaking have clear entry points. | Make the four skills visible on Today and in Training. |
| Listening and reading connect practice, review, mistakes, and progress. | Make existing review flows easier to find and continue. |
| Writing and speaking are organized by TCF task. | Preserve task-specific exam flows inside the TCF area. |
| The account page includes an exam date and a weekly report entry. | Surface an optional exam goal and a concise practice recap. |
| Multiple content sources and many historical sets are available. | Prioritize a small, verified, appropriately licensed content set. |
| Subscriptions, referral rewards, communities, and seat alerts are prominent. | Defer commercial and community expansion. |

Do not infer that BonTCF lacks persistent memory or agents from these pages.
Likewise, do not claim that Sundew is unique or produces better outcomes without
evidence. Differentiate through an implemented, inspectable learning loop.

## 3. Verified starting point

The following baseline comes from repository inspection, not a production audit.

| Area | Existing foundation | V2 gap |
| --- | --- | --- |
| Today | Heuristic daily blocks, target CLB, exam countdown, completion state | General-learning framing and four-skill navigation |
| Navigation | Separate library, vocabulary, practice, quiz, TCF, speaking, conjugation, progress, settings | Clear grouping and mobile navigation |
| TCF | Listening and reading drills, exams, review, explanations | Unified exam entry and an interactive speaking task |
| Writing | Source-based tasks, structured feedback, stored errors, micro-drills | General writing must not be relabeled as TCF writing |
| Speaking | Prompts, generated scripts, sentence recording, Azure pronunciation assessment | Live examiner dialogue and evidence-based task assessment |
| Learner profile | Stored writing errors and heuristic summaries | Evidence-backed signals spanning practice modes |
| Public demo | Original reading question, fixed explanation, fixed follow-up, local state | Clearly distinguish illustration from implemented adaptation |
| Security | Authentication helpers, owner checks, private-media infrastructure | Verify coverage, recording storage, budgets, and deployment boundaries |

Relevant code: `src/app/(main)/today/page.tsx`, `src/components/sidebar.tsx`,
`src/lib/actions/today.ts`, `src/lib/actions/learner-profile.ts`,
`src/lib/actions/speaking.ts`, `src/app/api/speaking/assess/route.ts`, and
`src/app/demo/`.

Two specific review items precede stronger claims:

- The learner-profile heuristic currently treats grammar categories absent from
  recent errors as strong. Lack of observed errors is not evidence of mastery.
  Error counts also need practice exposure context before indicating improvement.
- The pronunciation endpoint currently writes recordings under
  `public/media/speaking`. Verify the deployed serving behavior and move private
  recordings behind the approved private-media boundary before the new voice pilot.

## 4. Target information architecture

| Navigation | Responsibility |
| --- | --- |
| Today | Current goal, one recommended action, four skills, recent learning evidence |
| Training | Listening, speaking, reading, writing and their available practice modes |
| TCF Canada | Exam-specific tasks, existing listening/reading exams, speaking simulation |
| Library | Personal documents and source-based reading |
| Review | Existing vocabulary and error-review entry points |
| Progress | Practice history and evidence-supported changes |
| Settings | Profile, goals, account preferences |

Place Quiz and Conjugation within relevant Training or Review sections. Keep
existing deep links working. A training hub and TCF hub may point to the same
activity; do not create duplicate histories. New hub routes are implementation
choices to finalize after checking existing layouts and navigation matching.

### Today content order

1. **Current goal:** general French or TCF preparation; show a countdown only for
   a configured exam date. Keep goal editing easy to find.
2. **Today's focus:** one actionable recommendation, an explanation grounded in
   recent work, an estimated duration, and the primary start button.
3. **Four skills:** Listening, Speaking, Reading, Writing; show available actions
   and recent activity rather than unsupported proficiency percentages.
4. **Recent focus areas:** up to three observed issues, each linked to evidence
   and a relevant follow-up action.
5. **TCF module:** exam entry, with extra goal context for learners preparing for TCF.
6. **Weekly recap:** a few real activity measures and a link to Progress.

Use the existing Sundew fonts, semantic colors, logo, and shared components.
New users get a first-practice action. Missing data appears as insufficient
evidence, never as a fabricated score. Preserve English interface copy and French
exercise content.

## 5. Delivery stages

Checkboxes below record implementation tasks; stage acceptance remains separate.
Finish dependency gates before enabling behavior that relies on their results.
The separately scoped review center and study plan increment below may proceed
without Stage 2 pilot validation. Set calendar estimates after sizing each stage.

### Stage 1: Personal learning home and navigation

Detailed delivery plan: [Stage 1 development plan](sundew-v2-stage1-plan.md).
It refines the Today hierarchy above: keep goal context inline, use one primary
activity, and show the TCF shortcut in exam-goal context rather than a duplicate
large module. Delivery proceeds through navigation/goals, the Today workflow,
then evidence/recap and verification.

Deliverables:

- [x] Restructure Today using the hierarchy above and existing data where possible.
- [x] Add clear four-skill entry points and group desktop/mobile navigation.
- [x] Represent general learning and TCF goals without forcing a CLB target.
- [x] Keep unavailable modes explicit; do not introduce dead-end primary buttons.
- [x] Link existing review, library, pronunciation, writing, and TCF flows.
- [x] Preserve the public demo as a focused TCF introduction with honest feature status.

Acceptance gate:

- A new visitor to the private app can locate all four skills, TCF, and today's action.
- General learners receive a usable home without an exam date or target CLB.
- Existing deep links and records remain accessible; goals persist under the owner.
- Mobile layout, keyboard focus, empty states, and populated states are checked.
- No new headline metric implies an assessment the product has not performed.

### Stage 2: One complete TCF speaking workflow

Detailed delivery plan: [Stage 2 development plan](sundew-v2-stage2-plan.md).
It specifies the original scenario, turn-based voice workflow, evidence contracts,
private media and budget controls, implementation batches, and pilot acceptance gates.

Scope: one original or cleared TCF Task 2 scenario, initially in authenticated
private use. Read current official task guidance before encoding timing or a rubric.

Deliverables:

- [ ] Implement explicit preparation, conversation, completion, and feedback states.
- [ ] Let the learner lead the information-seeking exchange with an AI role partner.
- [ ] Preserve a transcript and authorized recording references across reloads.
- [ ] Produce a structured practice assessment with transcript/audio evidence,
  rubric version, limitations, and concrete examples to improve.
- [ ] Distinguish pronunciation assessment from task performance and language ability.
- [ ] Record a small number of supported issues and offer a relevant follow-up drill.
- [ ] Persist the follow-up attempt so later practice can revisit the same issue.
- [ ] Handle microphone denial, silence, interrupted sessions, provider failures,
  timeout, duplicate submissions, and budget exhaustion.
- [ ] Add owner checks, private recording storage, input/duration limits, bounded
  retries, concurrency limits, usage accounting, and a disable switch.

Acceptance gate:

- One learner can finish conversation -> assessment -> follow-up -> saved history.
- Feedback cites observable evidence; silence or poor transcription does not receive
  an invented proficiency score. Estimates are not presented as official TCF results.
- Another identity cannot access the session, transcript, recording, or assessment.
- Retried requests do not duplicate completed assessments or bypass spending limits.
- A small pilot records actual latency, usage/cost, failures, and feedback quality.
  Document results and limitations before expanding scenarios.

Public demo gate: keep anonymous use on curated/precomputed content. An interactive
paid voice demo requires a separately reviewed access and spending design consistent
with the security policy. A private pilot does not automatically enable public access.

### Stage 3: Bounded learning coach agent

Build on recorded evidence from Stage 2 and existing writing/review activity.
Start with deterministic recommendation rules as a baseline. Introduce model-driven
tool selection only where it can be evaluated against that baseline.

Deliverables:

- [ ] Define a shared learning-signal contract with owner, skill, mode, task context,
  source attempt/evidence reference, category, timestamp, confidence, and provenance.
- [ ] Keep observation, interpretation, recommendation, and later outcome separate.
- [ ] Retrieve relevant recent/repeated evidence instead of resending entire history.
- [ ] Implement narrow tools for goal/history lookup and approved exercise retrieval.
- [ ] Let the agent choose one next activity and explain its evidence and goal fit.
- [ ] Validate structured output; permit only existing or validated exercise IDs.
- [ ] Allow saving a proposed activity after user acceptance, with an idempotent,
  owner-scoped write. Keep history correction/deletion out of autonomous tools.
- [ ] Limit tool calls, execution time, returned data, and total usage; fall back to
  rules when tools fail or evidence is insufficient.
- [ ] Treat exercise text and learner uploads as data, not tool instructions.
- [ ] Record redacted tool traces, versions, usage, recommendation, and acceptance.

Acceptance gate:

- Repeated observations link to their source attempts; one error does not establish
  a recurring weakness, and one successful retry does not establish mastery.
- The coach can select an appropriate follow-up using tools and stored evidence.
- No cross-skill transfer is assumed without supporting attempts in those contexts.
- A learner can decline a recommendation and choose another activity.
- Invalid tool arguments, prompt injection, missing evidence, and provider failure
  produce a safe, useful fallback within the configured budget.
- Recommendations pass the evaluation gate below. If they offer no demonstrable
  advantage, retain the rule-based recommender and document the experiment.

### Independent increment: complete review center and study plans

The [review center and study plan development plan](sundew-review-study-plan.md)
(2026-09-18) adds a unified error/review center, recoverable review sessions,
editable seven-day plans, and completion tied to source attempts. It is in
development but not accepted. Stage 1's entry points and Stage 3's next-activity recommender do
not already fulfill this scope.

Its non-speaking scope can be developed and accepted while Stage 2 validation
is pending. Existing stage numbers and their acceptance gates remain intact;
speaking integration waits for validated Stage 2 evidence. Stage 3 may later
reuse the activity catalog and rule baseline, but requires its own evaluation.

## 6. Evaluation and release evidence

Create a small versioned evaluation set before claiming adaptive quality. Suggested
initial size: 20 synthetic or consented, de-identified learner histories. Include
new users, isolated errors, repeated errors, recent successful practice, changed
goals, insufficient evidence, conflicting signals, and tool failures.

Compare agent and rule baseline on the same inputs:

| Measure | Initial acceptance criterion |
| --- | --- |
| Evidence grounding | Every personalized claim resolves to supplied evidence |
| Exercise validity | Every selected activity exists and is accessible |
| Goal/task fit | At least 16 of 20 recommendations rated appropriate against a predefined review rubric |
| Owner isolation and bounded execution | All adversarial checks pass; limits cannot be bypassed |
| Fallback behavior | Every defined missing-data/tool-failure case yields a valid fallback |
| Latency and cost | Record observed distributions and meet explicit budgets selected before the pilot |

The 16/20 target is a proposed engineering gate, not an achieved result or proof
of learning improvement. Prefer review by a competent French speaker or teacher
for language and assessment quality. Record evaluator and disagreement notes.
Measure follow-up completion and performance on fresh related tasks; a retry on
the identical question alone does not establish transfer or retention.

For each stage, run relevant type/lint checks, targeted behavior tests, and visual
checks for changed interfaces. For the final release, verify the production build
and authorized deployment paths. Keep test fixtures free of private learner material.

## 7. Portfolio handoff and stop condition

- [ ] A short demonstration covers goal -> practice -> evidence -> next activity.
- [ ] An architecture note explains routes, data ownership, AI boundaries, and storage.
- [ ] A decision log explains why rules or an agent were used at each step.
- [ ] Evaluation results include measured failures, latency, and usage/cost.
- [ ] Redacted example traces show useful tool calls and fallback behavior.
- [ ] Release notes distinguish implemented features, previews, and unresolved limits.
- [ ] Real-user feedback is summarized where available; no invented usage statistics.

V2 is complete when the three stage gates and this handoff are satisfied, including
the rule-based outcome if the agent experiment does not improve recommendations.
Use that release for demonstrations and applications. Expand only in response to
observed learner needs, not a competitor's feature count.

## 8. Explicitly deferred

- Large-scale question-bank expansion or copying competitor resources.
- Full TCF writing implementation, all speaking tasks, and broad scenario coverage.
- A separate open-ended conversation product.
- Subscriptions, referral rewards, community features, and exam-seat monitoring.
- Native mobile applications and broad multi-user rollout.
- Multiple cooperating agents, vector infrastructure without demonstrated retrieval
  needs, or autonomous long-running study campaigns.
- Uncalibrated CEFR/CLB predictions or unsupported claims of learning improvement.

## 9. First implementation slice

Start with Stage 1: map existing routes and owner-scoped data to the Today sections,
adjust navigation, and validate the home in empty and populated states. Keep goal
and activity data changes minimal. Review that concrete result before starting the
voice workflow. This document itself makes no application or deployment changes.
