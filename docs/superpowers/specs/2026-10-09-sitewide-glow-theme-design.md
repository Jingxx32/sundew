# Site-wide Soft-Glow Theme — Design Spec

> Rolls the soft-glow style from the landing and login pages
> (`2026-10-09-landing-login-redesign-design.md`) out to the whole app:
> Geist body text, Plus Jakarta Sans page titles, the cool palette, and pill
> buttons and inputs. Content containers stay rounded rectangles.
>
> Designed in a brainstorming session on 2026-10-09 after previewing the style
> on real app pages (Today, Vocabulary, TCF, Settings). Executable cold.
> Facts verified on 2026-10-09.

---

## 1. Summary

The theme was built scoped (`.theme-glow`) so that rolling it out is mostly
moving values: its token overrides become the `:root` values, its fonts load in
the root layout, and Manrope goes away. Three things are not mechanical and are
the reason this spec exists: which headings get the display font, which controls
become pills, and how to verify 27 pages against a live database.

## 2. Decisions

| # | Decision | Rejected alternatives |
|---|---|---|
| D1 | Promote the theme to `:root`; one token set for the whole site | Wrap `(main)` in `GlowTheme` (two systems live on, fonts load twice) |
| D2 | **Actions are pills, content is rectangular:** `Button`, `Input`, native single-line `<input>`/`<select>` → pills; cards, TCF answer options, tab switchers, chips stay as they are | App keeps rectangles (mismatches landing/login); everything pill (long French answer options read badly as pills) |
| D3 | Multi-line text boxes (`Textarea`, native `<textarea>`) stay rectangles at `rounded-xl` (14px) | Pill radius on a textarea (distorts multi-line boxes — a latent bug in the scoped theme, §3) |
| D4 | Plus Jakarta Sans 800 on every `h1` (all are page titles ≥ 20px) and on the four app `h2`s ≥ 24px. Smaller headings stay Geist | Jakarta on all headings (too heavy at 14–20px; seen on Settings card titles) |
| D5 | `h1` tracking normalised to `-0.025em` (Jakarta collides at `-0.035em`) | Keep per-page tracking |
| D6 | No glow backdrop inside the app | Glow on Today (the app is a study tool; keep it quiet) |
| D7 | Reading serif (`.reading-prose`, Source Serif 4) and mono (Source Code Pro) unchanged; Nunito wordmark unchanged | — |

## 3. Current state (verified 2026-10-09)

- `src/app/layout.tsx` loads Manrope (`--font-manrope`), Source Serif 4,
  Source Code Pro; `viewport.themeColor` is `#faf8f4`.
- `globals.css`: `:root` holds the warm palette and the defaults
  `--radius-button`/`--radius-field: var(--radius-lg)`,
  `--display-font: var(--font-sans)`. `@theme inline` sets
  `--font-sans: var(--font-manrope), …` and `--font-display: var(--display-font)`.
  `.theme-glow` overrides background, surface-muted, border, muted-foreground,
  `--font-sans`, `--display-font`, both radii, and defines `--shadow-float`,
  `--drop-brand`, `--glow-blue`, `--glow-pink`, then re-resolves
  `font-family`/`background`/`color`.
- `GlowTheme` (`src/components/theme/glow-theme.tsx`) loads Geist + Plus Jakarta
  Sans 800 and applies `.theme-glow`; used by the landing page and `/login` only.
- `Textarea` (`src/components/ui/input.tsx`) uses `--radius-field`, so under the
  theme it would be a pill. No textarea renders inside `GlowTheme` today, so the
  bug is latent.
- Native fields with their own `rounded-lg`:
  `settings/_components/study-goal-editor.tsx` (`inputClasses`: one `<select>`,
  two `<input>`), `vocabulary/_components/vocab-browser.tsx` (search `<input>`),
  `vocabulary/review/_components/gap-review-runner.tsx` (answer `<input>`),
  `admin/invites/_components/create-invite-form.tsx`,
  `quiz/_components/import-dialog.tsx`,
  `library/_components/add-document-dialog.tsx` (`<select>`s).
  Native textareas: `settings/_components/speaking-profile-editor.tsx` and
  `speaking/_components/script-workbench.tsx` (`rounded-lg`),
  `practice/_components/writing-form.tsx` (already `rounded-xl`).
- 29 files contain an `h1` outside the landing page; their tracking is
  `-0.035em` (16), `-0.03em` (5), `tracking-tight` (2), `-0.025em` (1), none (rest).
  App `h2`s ≥ 24px: `tcf/_components/drill-runner.tsx:237`,
  `library/_components/continue-reading.tsx:29`, `speaking/page.tsx:48`,
  `vocabulary/_components/vocab-browser.tsx:282`.
- `font-sans` is used as a class twice (`cloze-runner.tsx:131`,
  `submission-text.tsx:70`); it follows the `@theme` value.
- Local dev uses the production database. Pages with side effects:
  `/documents/[id]` creates a reading session on open; `/vocabulary/review`
  grades on Enter; `/tcf/drill`, `/quiz/[setId]`, `/conjugation` record answers
  on click. No page calls AI on load.

## 4. Scope

**In:** tokens, fonts, `Button`/`Input`/`Textarea`, the native fields in §3,
`h1` font and tracking, the four large `h2`s, `themeColor`, simplifying
`GlowTheme`.
**Out:** layout or spacing changes, new components, dark mode, anything inside
`.reading-prose`, chip/tab/option shapes.

## 5. Tokens and fonts

1. `layout.tsx`: replace Manrope with `Geist({ subsets: ["latin"], variable: "--font-geist" })`
   and add `Plus_Jakarta_Sans({ subsets: ["latin"], weight: "800", variable: "--font-jakarta" })`;
   keep Source Serif 4 and Source Code Pro. `themeColor` → `#f6f8fd`.
2. `globals.css` `:root`: background `#f6f8fd`, surface-muted `#f1f4fa`,
   border `#e7eaf2`, muted-foreground `#55617a`; `--radius-button` and
   `--radius-field` → `9999px`; `--display-font: var(--font-jakarta), var(--font-geist), ui-sans-serif, system-ui, sans-serif`;
   move `--shadow-float`, `--drop-brand`, `--glow-blue`, `--glow-pink` here.
3. `@theme inline`: `--font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif`.
4. Delete the `.theme-glow` rule; `body` already resolves font, background and
   colour from `:root`.
5. Base rule: `h1 { font-family: var(--display-font); }` in `@layer base`, so
   utilities still win where a page sets its own font.
6. `GlowTheme` keeps its name and wrapper (`relative min-h-screen overflow-hidden`)
   but no longer loads fonts or applies a class.

## 6. Components and pages

- `Textarea`: `rounded-[var(--radius-field)]` → `rounded-xl`.
- Native single-line fields in §3: `rounded-lg` → `rounded-[var(--radius-field)]`.
- Native textareas: `rounded-lg` → `rounded-xl`.
- Every non-landing `h1`: tracking utility → `tracking-[-0.025em]` (add it where
  none is set).
- The four large `h2`s: add `font-display`, tracking → `-0.025em`.

## 7. Verification

The theme touches every page, so verification is a scripted sweep run twice in
the browser pane (signed in as the owner, view-only), plus a visual review.

**Safe pages (26 of 27):** `/`, `/login`, `/today`, `/training`, `/review`, `/tcf`,
`/tcf/drill`, `/tcf/exam`, `/tcf/review`, `/library`, `/practice`,
`/practice/[submissionId]/feedback`, `/progress`, `/quiz`, `/quiz/[setId]`,
`/settings`, `/account`, `/admin/invites`, `/conjugation`, `/speaking`,
`/speaking/task-2`, `/speaking/[promptId]/script`, `/speaking/sessions/[sessionId]`,
`/speaking/sessions/[sessionId]/feedback`, `/vocabulary`, `/vocabulary/review`.
Dynamic IDs are taken from links on their list pages. **Never opened by the
sweep:** `/documents/[id]`. On answer pages, no clicks or key presses.

**Per page, at 375px and 1280px:** console errors; horizontal overflow
(`scrollWidth > innerWidth`); `h1` computed font family.
**After the change only, additionally:** zero elements with a computed
`font-family` containing Manrope; zero `textarea`s with border radius > 24px;
every `h1` in Plus Jakarta Sans.

A page passes when it has no new console errors, no new overflow, and the
after-only checks hold. Then: screenshots of the main pages to the user; the
user checks one reading page, one TCF option selection, and one vocabulary
review card themselves.

Plus `npm run typecheck`, `npm run lint`, `npm test`. No new unit test: the
change is styling, and the sweep is the meaningful check.

## 8. Delivery

Branch `feat/sitewide-glow-theme` → PR → Vercel preview builds → user review →
merge. Commits: tokens + fonts + primitives → native fields + headings.
