# TCF Practice Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eleven TCF practice-flow problems in the spec without touching scheduling, grading or the schema.

**Architecture:** Three pure helpers carry the logic (next step in a round, review reason, exam progress encoding); components consume them. One new server query (latest TCF answer) and one aggregation change (due-now counts).

**Tech Stack:** Next.js 16 App Router, Drizzle, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-09-tcf-practice-flow-design.md`

## Global Constraints

- No change to `getTcfScheduledDrillQuestions`, grading, attempt writes, or the schema.
- TCF UI copy stays French.
- Local dev uses the production DB: never answer a question or submit an exam without the user.
- Commits without `Co-Authored-By` / "Generated with" trailers.
- Each task: `npm run typecheck && npm run lint && npm test`.

### Task 1: Pure helpers (TDD)
- [ ] Tests: `nextStep` (middle → next; last position with gaps → first unanswered; all done → summary); `reviewReason` (latest wrong → "wrong"; latest correct+uncertain → "uncertain"; correct confident → null; never answered → null); `decodeExamProgress` (round-trip; ids differ → null; malformed JSON → null; out-of-range option → dropped).
- [ ] Implement in `drill-nav.ts`, `learning.ts`, new `exam-progress.ts`. Commit `feat(tcf): helpers for round steps, review reasons and exam progress`.

### Task 2: Drill round (#1–#4)
- [ ] `DrillRunner`: `showSummary` state (summary only when requested); end-of-question action below the explanation via `nextStep`; summary gets "Revenir aux questions" and primary "Encore 10 questions" (`router.push` to `/tcf/drill?skill&level&round=10&run=<timestamp>`); remove the localStorage position restore; `layout?: "round" | "single"` prop.
- [ ] Drill page keys `DrillRunner` by `skill:level:round:run`.
- [ ] `LevelNav`: one ordered list labelled 1…N (strip on mobile unchanged); header shows `Test X · n°Y`.
- [ ] Commit `feat(tcf): readable drill rounds with an end-of-question action`.

### Task 3: Review centre (#6–#8)
- [ ] `DrillRunner layout="single"`: hide side nav, "Question x de y", RoundNav; end-of-question action is `nextHref` link or the empty-queue line.
- [ ] Review page passes `nextHref` (next queue item); list items show `Test n · n°k`, reason badge, last-answer date.
- [ ] Commit `feat(tcf): review centre moves to the next question`.

### Task 4: Numbers and resume (#5, #9, #10)
- [ ] `getLastTcfPractice()` in `src/lib/actions/tcf.ts` (`requireFeature("tcf")`; latest `tcf_question_attempts` row for the user joined to question/set → `{ skill, level }` or null).
- [ ] `/tcf`: "Reprendre : {Compréhension orale|écrite} {level} →" card above the review card when present; review card copy names the skill.
- [ ] `getTcfProgressOverview`: `needsReview` counts `isTcfReviewDue(summary, now)`.
- [ ] Commit `feat(tcf): resume card and one meaning for "à revoir"`.

### Task 5: Exam progress (#11)
- [ ] `ExamRunner`: restore on mount via `decodeExamProgress`; save on each answer; notice with count + "Recommencer"; clear on finish.
- [ ] Commit `feat(tcf): keep mock-exam answers across reloads`.

### Task 6: Verify and hand off
- [ ] View-only checks per spec §4 at 375/1280; no console errors.
- [ ] With the user: answer 2–3 drill questions (last-question explanation, end action, summary, Encore 10), one review question (next link), one exam answer + reload (restored notice, then Recommencer).
- [ ] Production build, push, PR or fast-forward per the user.
