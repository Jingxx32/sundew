# TCF Practice Flow — Design Spec

> Eleven friction points found by walking `/tcf`, drill rounds, the review
> centre and mock exams (view-only, plus code reading) on 2026-10-09. All are
> fixed by flow and presentation changes; scheduling, grading, persistence of
> attempts and the schema are unchanged. The exam timer (#12) is out of scope.

---

## 1. Problems

| # | Where | Problem |
|---|---|---|
| 1 | Drill | Answering the last unanswered question replaces the page with the summary; that question's explanation is never shown and cannot be reached. |
| 2 | Drill | On desktop, Previous/Next sit between the question card and the explanation, so moving on means scrolling back up. |
| 3 | Drill | Header says "Question 1 de 10" while the side nav highlights "10": the nav groups by test and labels by `orderIndex`; the round is ordered by learning status. |
| 4 | Drill | The summary offers only "Revoir maintenant" / "Retour au niveau"; there is no way to start another round in place. |
| 5 | Drill | The saved position is keyed by the round's exact question list, which the scheduler reorders after answers, so resuming almost never works; `/tcf` has no "continue" entry. |
| 6 | Review | One question at a time with no "next"; every item needs a click in the list. |
| 7 | Review | Every list item reads "A1 Écoute / Non classée": no test/question, no reason, no date. |
| 8 | Review | The single-question view still renders the side nav, "Question 1 de 1" and disabled Previous/Next. |
| 9 | Numbers | The `/tcf` review card says "toutes compétences" but counts (and links to) the current skill only. |
| 10 | Numbers | Level cards count `needsReview` (status) while the review centre counts due-now items; both are labelled "à revoir". |
| 11 | Exam | Answers live in component state only: a reload keeps `?i=` but drops every answer. |

## 2. Design

| # | Change |
|---|---|
| 1 | The summary is opened, not forced: when every question is answered, the end-of-question action becomes **Voir le bilan**. The summary has **Revenir aux questions**. |
| 2 | After an answer, an end-of-question action sits **below the explanation**: **Question suivante →**, or **Voir le bilan** when the round is complete, or **Question non répondue →** at the last position while some remain. Top navigation and keyboard stay. |
| 3 | The side nav lists the round in order, labelled 1…N (status colours unchanged; one strip for every round size). "Test X · n°Y" moves next to the question header. |
| 4 | The summary's primary action is **Encore 10 questions** (same skill and level, fresh round); "Revoir maintenant" and "Retour au niveau" become secondary. |
| 5 | `/tcf` shows **Reprendre : {skill} {level} →** from the user's latest TCF answer (server query, any mode, any skill), linking to a fresh round at that level. The localStorage position restore is removed. |
| 6 | Review centre: after an answer, **Question suivante →** links to the next queue item; at the end, "Plus rien à revoir avec ces filtres." |
| 7 | List items show `Test {n} · n°{k}`, a reason badge — **Ratée** (latest answer wrong) or **Incertaine** (latest answer uncertain) — and the last-answer date. |
| 8 | `DrillRunner` gains a `single` layout for the review centre: no side nav, no "Question x de y", no Previous/Next. |
| 9 | The review card copy names the skill: "Questions ratées ou incertaines · {Compréhension orale / écrite}". |
| 10 | "À revoir" always means **due now** (`isTcfReviewDue`): `getTcfProgressOverview` counts due questions per level, so level counts sum to the review card. |
| 11 | `ExamRunner` saves answers to localStorage (`{owner}:tcf-exam:{skill}:{test}`, with the question ids) on every change, restores them on mount when the ids match, shows "Examen repris · {n} réponses restaurées · Recommencer", and clears them on finish. |

## 3. Pure helpers (unit-tested)

- `src/lib/tcf/drill-nav.ts` — `nextStep(questionIds, completedIds, currentIndex)` → `{ kind: "next", index } | { kind: "unanswered", index } | { kind: "summary" }`.
- `src/lib/tcf/learning.ts` — `reviewReason(summary)` → `"wrong" | "uncertain" | null`.
- `src/lib/tcf/exam-progress.ts` — `encodeExamProgress(questionIds, answers)` / `decodeExamProgress(raw, questionIds)` → answers or `null` when the stored ids differ or the payload is malformed.

## 4. Verification

- Unit tests above; `npm run typecheck`, `npm run lint`, `npm test`.
- View-only as the owner: `/tcf` (Reprendre card, review copy, level counts sum), drill page (nav numbering), review centre (list items, single layout).
- Post-answer behaviour (#1, #2, #4, #6, #11) needs real answers, which write attempts: the user answers 2–3 questions in the browser pane while the result is checked.
