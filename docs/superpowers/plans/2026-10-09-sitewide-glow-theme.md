# Site-wide Soft-Glow Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page uses Geist body text, Plus Jakarta Sans page titles, the cool palette, and pill buttons/inputs, with no visual regressions.

**Architecture:** Promote the scoped `.theme-glow` overrides to `:root`, load the fonts once in the root layout, and drop Manrope. Multi-line fields are pinned to `rounded-xl`; native single-line fields adopt `--radius-field`; `h1`s get the display font via a base rule.

**Tech Stack:** Next.js 16.2.4, Tailwind CSS v4 (`@theme inline`, `@layer base`), `next/font/google`.

**Spec:** `docs/superpowers/specs/2026-10-09-sitewide-glow-theme-design.md`

## Global Constraints

- Local dev talks to the **production database**. The browser pane is signed in as the owner. Never open `/documents/[id]`; on `/tcf/drill`, `/quiz/[setId]`, `/conjugation`, `/vocabulary/review` never click an option or press a key.
- Colours only via tokens in `globals.css`.
- Out of scope: chip, tab, option and card shapes; `.reading-prose`; layout/spacing.
- Commits: conventional messages, **no `Co-Authored-By` or "Generated with" trailers**.
- Verification per task: `npm run typecheck && npm run lint && npm test`.

## Sweep procedure (used by Task 0 and Task 3)

Routes (26): `/`, `/login`, `/today`, `/training`, `/review`, `/tcf`, `/tcf/drill`, `/tcf/exam`, `/tcf/review`, `/library`, `/practice`, `/practice/<id>/feedback`, `/progress`, `/quiz`, `/quiz/<setId>`, `/settings`, `/account`, `/admin/invites`, `/conjugation`, `/speaking`, `/speaking/task-2`, `/speaking/<promptId>/script`, `/speaking/sessions/<id>`, `/speaking/sessions/<id>/feedback`, `/vocabulary`, `/vocabulary/review`.

Resolve `<id>`s once by running on the list page (`/practice`, `/quiz`, `/speaking`):

```js
[...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))
  .filter((h) => /^\/(practice\/[^/]+\/feedback|quiz\/[^/]+|speaking\/[^/]+\/script|speaking\/sessions\/[^/]+)$/.test(h))
  .filter((h, i, all) => all.indexOf(h) === i).slice(0, 8)
```

For each route, at 375×812 (`resize_window` preset `mobile`) and 1280×860: `navigate`, wait 3 s, then run:

```js
(() => {
  const fam = (el) => getComputedStyle(el).fontFamily;
  const all = [...document.querySelectorAll("body *")];
  return {
    path: location.pathname,
    overflow: document.documentElement.scrollWidth > innerWidth,
    manrope: all.filter((el) => /manrope/i.test(fam(el))).length,
    pillTextareas: [...document.querySelectorAll("textarea")]
      .filter((t) => parseFloat(getComputedStyle(t).borderTopLeftRadius) > 24).length,
    h1: [...document.querySelectorAll("h1")].map((h) => fam(h).split(",")[0].replaceAll('"', "")),
  };
})()
```

and `read_console_messages` with `onlyErrors: true`. Record one line per route and width in `scratchpad/sweep-<before|after>.md`.

---

### Task 0: Baseline sweep (before any code change)

- [ ] **Step 1:** Run the sweep on the unchanged branch. Expected: `manrope` > 0 everywhere, `h1` = Manrope, `pillTextareas` = 0. Note every page that already overflows or logs errors — those are pre-existing, not regressions.
- [ ] **Step 2:** Screenshot `/today`, `/tcf`, `/settings`, `/vocabulary`, `/progress` at the pane's own width for the before/after comparison.

---

### Task 1: Tokens, fonts, primitives

**Files:** `src/app/layout.tsx`, `src/app/globals.css`, `src/components/theme/glow-theme.tsx`, `src/components/ui/input.tsx`

- [ ] **Step 1: Fonts in the root layout.** In `layout.tsx` replace the Manrope import/instance with:

```tsx
import { Geist, Plus_Jakarta_Sans, Source_Serif_4, Source_Code_Pro } from "next/font/google";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

// Display face for page titles; only the weight we use.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: "800" });
```

In the `<html>` className replace `${manrope.variable}` with `${geist.variable} ${jakarta.variable}`. `themeColor: "#f6f8fd"`.

- [ ] **Step 2: `:root` values.** In `globals.css` `:root`: `--background: #f6f8fd`, `--surface-muted: #f1f4fa`, `--border: #eeeae3` → `#e7eaf2`, `--muted-foreground: #55617a`. Replace the shape/display block with:

```css
  /* Shape, display and elevation tokens (soft-glow theme, site-wide since 2026-10-09).
     Actions are pills; multi-line fields use rounded-xl instead of --radius-field. */
  --radius-button: 9999px;
  --radius-field: 9999px;
  --display-font: var(--font-jakarta), var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --shadow-float: 0 1px 2px rgb(15 39 71 / 5%), 0 30px 60px -20px rgb(15 39 71 / 22%);
  --drop-brand: 0 24px 32px rgb(31 78 216 / 28%);
  --glow-blue: rgb(122 156 255 / 45%);
  --glow-pink: rgb(255 168 176 / 22%);
```

Update the `:root` header comment's "warm" wording if present.

- [ ] **Step 3:** `@theme inline`: `--font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif;`
- [ ] **Step 4:** Delete the whole `.theme-glow { … }` rule and its comment. Keep `.glow-backdrop`.
- [ ] **Step 5:** Add after the `body` rule:

```css
/* Page titles use the display face; smaller headings stay in the body font. */
@layer base {
  h1 {
    font-family: var(--display-font);
  }
}
```

- [ ] **Step 6:** `glow-theme.tsx` becomes:

```tsx
import { cn } from "@/lib/utils";

/** Full-height, clipped wrapper for pages that place a GlowBackdrop. */
export function GlowTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("relative min-h-screen overflow-hidden", className)}>{children}</div>;
}
```

- [ ] **Step 7:** `input.tsx` Textarea: `rounded-[var(--radius-field)]` → `rounded-xl` (Input keeps `--radius-field`).
- [ ] **Step 8:** `npm run typecheck && npm run lint && npm test` → pass. Spot-check `/today` and `/` in the browser: Geist body, Jakarta `h1`, no console errors.
- [ ] **Step 9: Commit** — `feat(theme): roll the soft-glow tokens and fonts out site-wide`

---

### Task 2: Native fields and headings

**Files:** the native-field and textarea files and the `h1`/`h2` files listed in spec §3 and §6.

- [ ] **Step 1: Native single-line fields** — replace `rounded-lg` with `rounded-[var(--radius-field)]` in: `study-goal-editor.tsx` (`inputClasses`), `vocab-browser.tsx` (search input), `gap-review-runner.tsx` (answer input only, not the result `<p>`), `create-invite-form.tsx`, `import-dialog.tsx`, `add-document-dialog.tsx` (the `<select>` class strings).
- [ ] **Step 2: Native textareas** — `rounded-lg` → `rounded-xl` in `speaking-profile-editor.tsx` and `script-workbench.tsx`.
- [ ] **Step 3: `h1` tracking** — in every file under `src/` except `src/app/_components/landing/`, on `<h1` lines only: `tracking-[-0.035em]`, `tracking-[-0.03em]`, `tracking-tight` → `tracking-[-0.025em]`; where an `h1` className has no `tracking-` utility, append `tracking-[-0.025em]`. Do it with a script that edits only lines containing `<h1 className="`, then review `git diff` line by line (multi-line `h1` classNames, if any, by hand).
- [ ] **Step 4: Large `h2`s** — add `font-display` and set tracking to `-0.025em` at `drill-runner.tsx:237`, `continue-reading.tsx:29`, `speaking/page.tsx:48`, `vocab-browser.tsx:282`.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 6: Commit** — `feat(theme): pill native fields and display-face headings across the app`

---

### Task 3: After sweep, fixes, screenshots

- [ ] **Step 1:** Run the sweep. Pass criteria per route and width: no console error that wasn't in the baseline; no overflow that wasn't in the baseline; `manrope` = 0; `pillTextareas` = 0; every `h1` = Plus Jakarta Sans.
- [ ] **Step 2:** For each failure, find the cause in source, fix, re-run that route. Commit fixes as `fix(theme): …`.
- [ ] **Step 3:** Screenshot the same five pages as Task 0 and open two safe dialogs (Library "add document", Quiz "import") without submitting, to check pills inside dialogs.
- [ ] **Step 4:** Reset the viewport (`resize_window` preset `desktop`).

---

### Task 4: PR

- [ ] **Step 1:** `git log --format='%h %s%n%b' main..HEAD` — no trailers. Scan the diff for secrets.
- [ ] **Step 2:** Push the branch; give the user a prefilled PR link (no `gh` on this machine).
- [ ] **Step 3:** Ask the user to check one reading page, one TCF option selection, one vocabulary review card, and the Vercel preview build before merging.
