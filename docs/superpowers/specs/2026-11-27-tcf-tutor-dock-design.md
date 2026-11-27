# TCF tutor dock — design (short)

**Date:** 2026-11-27 · **Size:** small change · **Builds on:** `2026-11-23-tcf-tutor-notebook-design.md`

## Intent

The tutor chat sits at the very bottom of the drill page and the finished exam, after the
explanation, so the learner has to scroll past everything to find it. The user wants it as a
chat window that can be expanded and collapsed, like a messaging dock, so it is always one
click away while the question and its text stay readable.

## Approaches

- **A. Collapsible chat bar (chosen).** A bar docked bottom-right shows the tutor's state
  (Sundew icon, "Tuteur", answer count, a dot for an unread answer). A click expands it into a
  chat window; ▼ collapses it back to the bar. Two states only, and the collapsed bar still
  tells the learner whether there is anything to read.
- B. Round bubble + window with a maximise button. Rejected: the bubble says nothing until it
  is opened, and three states (bubble, window, maximised) for one feature.
- Modal dialog (`src/components/ui/dialog.tsx`). Rejected: its overlay hides the passage the
  learner is asking about.

## Behaviour

- Appears exactly where the panel appeared before: drill after answering (or "Afficher
  réponse"), exam only once finished. Starts collapsed. Changing question resets it (same
  `key={q.id}` as today).
- Expanded on desktop (≥ md): a window anchored bottom-right, about 380 × 560 px (capped to the
  viewport), no overlay; the page behind stays readable and scrollable.
- Expanded on mobile: a bottom sheet about 85% of the viewport height, above the
  "Précédent / Suivant" bar. Collapsed on mobile: a full-width bar just above that bar (or at
  the bottom when the page has none).
- Collapsing only hides the window: a streaming answer keeps streaming, the thread and drafts
  stay. Escape inside the window collapses it and returns focus to the bar.
- Unread: an answer that finishes while the dock is collapsed shows a dot on the bar; expanding
  clears it. The bar also shows "…" while an answer is streaming.
- Inside the window: header (icon, "Tuteur", ▼), the thread scrolls and follows new text, the
  input stays pinned at the bottom; an empty thread shows a one-line hint. On expand the input
  is focused.
- Copy is French (TCF screens): "Tuteur", "Posez une question", "{n} réponse(s)", "Réduire",
  "Ouvrir le tuteur".

## Constraints

- Semantic tokens only; the bar is a pill-shaped `Button`-style control; the window is a card
  (`rounded-2xl`, `bg-surface`, `shadow-xl`); the textarea keeps `rounded-xl`.
- z-index: above the round nav (`z-20`), below dialogs (`z-50`).
- The page content gets extra bottom padding while the dock is shown, so the bar never covers
  the last controls.

## Left to the builder

Exact offsets, the icon size, and whether the unread dot animates.
