# TCF Tutor Dock Implementation Plan

**Goal:** Move the TCF tutor chat from the bottom of the page into a collapsible chat dock.

**Spec:** `docs/superpowers/specs/2026-11-27-tcf-tutor-dock-design.md`

**Execution:** native (one component plus two mount points). Commit without trailers; push the
branch `feat/tcf-tutor-notebook` to GitHub when done (the user asked).

## Task 1: TutorPanel reports its state and lays out as a chat body

- Modify `src/app/tcf/_components/tutor-panel.tsx`:
  - Add `onStatus?: (s: { answers: number; streaming: boolean }) => void`, called from an
    effect when the number of assistant turns or `streaming` changes.
  - Root becomes `flex h-full min-h-0 flex-col`: a scroll region (`flex-1 overflow-y-auto`)
    holding turns, the streaming partial and the failure line, then the textarea pinned below.
  - The scroll region follows new content (scroll to bottom when turns or partial text change).
  - Empty thread and no partial: muted hint "Posez une question sur un mot, une phrase ou une
    option de cette question."

## Task 2: TutorDock

- Create `src/app/tcf/_components/tutor-dock.tsx`:
  `TutorDock({ questionId, chosen, aboveNav }: { questionId: string; chosen: number | null; aboveNav: boolean })`.
  - State: `open` (false), `answers`, `streaming`, `unread`.
  - Collapsed bar (button, `aria-expanded`, `aria-controls`): Sundew symbol, "Tuteur",
    "· {n} réponse(s)" or "· Posez une question", "…" while streaming, unread dot, chevron up.
  - Window always mounted, hidden with `hidden` when collapsed (keeps the stream alive).
    Header: symbol, "Tuteur", collapse button (`aria-label="Réduire"`). Body: `TutorPanel`.
  - Escape inside the window collapses and focuses the bar; expanding focuses the textarea.
  - `unread` set when `answers` grows while collapsed; cleared on expand.
  - Positioning per the spec (desktop window bottom-right; mobile sheet / bar above the round
    nav when `aboveNav`).

## Task 3: Mount and padding

- `drill-runner.tsx`: replace the `TutorPanel` mount with
  `<TutorDock key={q.id} … aboveNav={!single} />` (still only when `showAnswer`); add bottom
  padding to the content column while it is shown.
- `exam-runner.tsx`: same when `finished`, `aboveNav={false}`.

## Verification

- `npm run typecheck && npm run lint && npm test`.
- Browser, desktop and mobile (375 × 812): bar appears after answering; expand / collapse;
  ask a question, collapse mid-stream, the answer finishes and the dot shows; expand clears it;
  Escape collapses; next question resets; the bar does not cover "Question suivante" or the
  round nav; the passage stays readable with the window open. Screenshots of both widths.
