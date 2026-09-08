# Sprint 5 — Errors Archive + Micro-drill + Rules Linking

> Turn the data captured in Sprint 4 into a browseable, navigable archive.
> Every error logged to the `errors` table becomes filterable by category,
> jump-able back to the original sentence in the feedback page, and
> actionable through a Micro-drill loop. Rule references finally resolve to
> a real `rules` knowledge base.

References: PRD §7.3.2 (Micro-drill row), §7.4.1 (errors drill-down),
§7.1.2 (`/progress?documentId=<id>` reverse-entry contract), §10 IA
(`Progress └── Errors Drill-down`), §13.2 (Sprint 5 row), §15.2 #5
(micro-drill **not** counted in errors), and Sprint 4's "Out of scope"
list (Micro-drill UI + `rule_id → rules` linking explicitly deferred to
S5).

---

## 1. Scope

The goal: take the rows S4 already writes (`errors`, `submissions.feedbackJson`)
and surface them as a **persistent learning archive** so that errors stop
being one-shot reactions and start sedimenting into the learner's history.
After S5 the user can:

1. Open Progress → see all their classified errors, grouped/filtered by
   category, with the original surrounding sentence.
2. Click any archived error → land on the original feedback page with the
   matching highlight scrolled into view.
3. Inside any error card (archive **or** feedback page) tap "Practice this"
   → answer a 2-sentence micro-drill → get short AI feedback that does
   **not** pollute the main `errors` table (§15.2 #5).
4. See the rule referenced by `error.ruleId` resolve to a real entry from
   the `rules` knowledge base, with name, description, and examples.

### Strong-decision contracts to honour

- All AI calls use `openai.chat.completions.parse` + `zodResponseFormat`
  (PRD §12.3) — no `JSON.parse` of free text. Micro-drill feedback follows
  the same rule.
- Micro-drill responses **must not** write to the `errors` table (§15.2 #5).
  They live in their own `micro_drills` table so the learner profile in
  S6/S7 stays a clean signal.
- Reverse-entry URL signature is **`/progress?documentId=<id>&category=<cat>&window=<n>`**
  (§7.1.2). S5 implements the `documentId` and `category` params; `window`
  is a no-op until S6 adds time bucketing.
- Archive page must offer the *jump back to source sentence* affordance —
  this is the §13.2 S5 requirement to “click an error to return to its original sentence.”
- Spans on archived errors are NFC-normalised character offsets into
  `submission.contentFr` (already enforced in S4); archive code reuses
  the same slicing to avoid drift.
- No `streak`, no error-count gamification on the archive (§7.4.2).

### What's already in place (do not redo)

- `errors` table — schema is final (`src/lib/db/schema.ts:106`), every S5
  view reads from it.
- `rules` table — schema exists (`src/lib/db/schema.ts:134`) but has no
  rows yet. S5 seeds it.
- `ERROR_TAXONOMY`, `CATEGORY_COLORS`, `ALL_SUBCATEGORIES`
  (`src/lib/taxonomy.ts`).
- Inline highlight + `id="error-<n>"` anchors on the feedback page
  (`src/app/practice/[submissionId]/feedback/_components/submission-text.tsx`)
  — archive page links use these anchors, no rewrite needed.
- `CATEGORY_STYLES` lookup
  (`src/app/practice/[submissionId]/feedback/_components/category-styles.ts`).
  S5 should **promote** this from a feedback-folder local into
  `src/lib/category-styles.ts` so the archive can reuse it without
  cross-route imports (kept identical in shape).
- Sidebar already has `/progress` (`src/components/sidebar.tsx:36`) — no
  navigation changes needed.
- `error-card.tsx` already has the placeholder `Rule: {ruleId}` line and
  a TODO surface for micro-drill — both replaced in this sprint.

---

## 2. Implementation Steps

### Step 1 — DB: micro-drill table + migration

Add a single new table to `src/lib/db/schema.ts`. Mirror the style of
`submissions` (text id, FK with `onDelete: "cascade"`, jsonb for AI
output, `defaultNow()` timestamp).

```ts
export const microDrills = pgTable("micro_drills", {
  id: text("id").primaryKey(),
  errorId: text("error_id")
    .notNull()
    .references(() => errors.id, { onDelete: "cascade" }),
  /** The drill prompt shown to the user — snapshotted from errors.microDrill at creation time. */
  promptText: text("prompt_text").notNull(),
  /** The user's 2-sentence French response. NFC-normalised before insert. */
  responseFr: text("response_fr").notNull(),
  /** Light AI feedback packet — see MicroDrillFeedbackSchema. */
  feedbackJson: jsonb("feedback_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type MicroDrill = typeof microDrills.$inferSelect;
```

Then:

- `npm run db:generate` to create the migration under `drizzle/`.
- `npm run db:init` to apply.

**Strong decision**: micro-drill responses do **not** write to `errors`
(PRD §15.2 #5). Any mistakes the AI flags inside the drill stay in the
`feedbackJson` blob only.

### Step 2 — Rules seed: `scripts/seed-rules.ts`

Mirror `scripts/seed-documents.ts`. One row per `(category, subcategory)`
pair from `ALL_SUBCATEGORIES`, with a stable `id` derived from the
subcategory key (so AI-emitted `rule_id` strings can match):

```ts
{
  id: "imparfait_for_habitual_past",   // matches PRD §8.3 example
  category: "Grammar",
  subcategory: "pc_vs_imparfait",
  name: "Imparfait for habitual or descriptive past",
  descriptionEn: "Use the imparfait for repeated/habitual actions, "
    + "background description, or ongoing states in the past.",
  examples: [
    "Quand j'étais petit, j'allais à l'école à pied.",
    "Il faisait beau quand nous sommes arrivés.",
  ],
}
```

Practical scope for the first seed pass:

- Cover the **8 highest-traffic** subcategories first (the ones AI tends
  to flag most for A2-B1): `pc_vs_imparfait`, `noun_gender`,
  `adjective_agreement`, `tense_choice`, `subjonctif_basic`,
  `negation_de_rule`, `verb_preposition`, `partitive`.
- Seed the remaining 25 with a one-line description + 2 examples each
  (good enough for rule cards to render; can be enriched over time).
- Use deterministic `id` strings — **never** `randomUUID()` for rules,
  because `errors.ruleId` is just a string and we want the AI's emitted
  ids to resolve.
- Update the system prompt in `src/lib/ai/feedback.ts` to **list the
  available rule_ids** (or at least state "use one of the seeded rule_ids
  if applicable, otherwise null") so the model emits matchable strings.
  This is a one-line append to the existing prompt — do not restructure
  it.

Add an npm script `"db:seed-rules": "tsx scripts/seed-rules.ts"` next to
the existing `db:seed`.

### Step 3 — Server actions: `src/lib/actions/errors.ts` (new)

Follow the conventions in `src/lib/actions/tasks.ts` and
`src/lib/actions/documents.ts`:

- `"use server"` at top.
- Async Drizzle only (`await db.select() …`, `await db.insert() …`).
  Never `.run() / .get() / .all()` — those are SQLite-only.
- Composable filters built from `eq`, `and`, `desc`, exactly like
  `listDocuments` (`src/lib/actions/documents.ts:108`).
- `revalidatePath("/progress")` on writes.

Required exports:

```ts
listErrors(opts?: {
  category?: ErrorCategory;     // filter chip
  subcategory?: string;          // optional drill-down
  documentId?: string;           // §7.1.2 reverse-entry from Library
  limit?: number;                // default 50
  offset?: number;               // pagination
}): Promise<ErrorWithContext[]>

getErrorCounts(opts?: { documentId?: string }): Promise<Record<ErrorCategory, number>>

getMicroDrillsForError(errorId: string): Promise<MicroDrill[]>

createMicroDrill(errorId: string, responseFr: string): Promise<MicroDrillFeedback>
  // 1. Look up the error row (need its prompt, original, correction)
  // 2. NFC-normalise responseFr
  // 3. Call evaluateMicroDrill(...) — see Step 4
  // 4. Insert into micro_drills with feedbackJson
  // 5. revalidatePath the archive page
  // 6. Return the feedback packet (no redirect — the dialog stays open
  //    and renders the result inline)
```

`ErrorWithContext` is the shape the archive renders — it does the JOIN
via separate awaited selects (the project deliberately avoids Drizzle
JOIN helpers; see `getSubmissionWithFeedback`, `tasks.ts:152`):

```ts
type ErrorWithContext = ErrorRecord & {
  submissionContentFr: string;   // for sentence-snippet rendering
  submissionId: string;
  submittedAt: Date;
  documentTitle: string | null;  // null if document was deleted
  documentId: string | null;
  errorIndex: number;            // position within its submission, for #error-<n>
};
```

Implementation note: build `errorIndex` by selecting all errors for each
relevant submission ordered by `spanStart`, then numbering — this matches
the order `submission-text.tsx` already uses for the inline `<sup>`
labels, so the anchors line up.

### Step 4 — AI: `src/lib/ai/micro-drill.ts` (new)

Mirror `src/lib/ai/feedback.ts` but **much smaller** — the goal is a
fast, cheap evaluator, not a full taxonomy pass.

```ts
const MicroDrillFeedbackSchema = z.object({
  ok: z.boolean(),                         // overall pass / needs work
  comments: z.array(z.string()).min(1),    // 1-3 short observations in EN
  better_examples: z.array(z.string()),    // 1-2 polished FR sentences
});
export type MicroDrillFeedback = z.infer<typeof MicroDrillFeedbackSchema>;

export async function evaluateMicroDrill(
  drillPrompt: string,         // errors.microDrill text
  originalError: string,       // errors.original
  correction: string,          // errors.correction
  responseFr: string,
): Promise<MicroDrillFeedback>
```

- Use `MODELS.feedback` (`src/lib/ai/client.ts`) — quality matters more
  than latency here, but no need for a separate env var.
- Temperature ~0.2.
- System prompt: Socratic tone (§5.5), praise what's right, point at
  what's still off, **do not** label by taxonomy category (we're not
  writing to the errors table). State explicitly that this is a follow-up
  drill, not a graded submission.

### Step 5 — Errors Archive page: `src/app/progress/page.tsx`

Replace the current `ComingSoon` stub
(`src/app/progress/page.tsx:1`) with the real archive. Async server
component; no client state at the page level.

Page anatomy (matches `library/page.tsx` shell so chrome stays consistent):

```
<div className="px-10 py-10 max-w-6xl mx-auto">
  Header        — "Progress" title + subtitle ("X errors logged across
                  Y submissions"), and a small note "Trends and charts
                  arrive in S6" so the page does not feel half-built.
  Filter bar    — category chips (Suspense-wrapped, like LibraryFilters)
                  driven by `?category=` query param; an extra
                  "Document: <title> ✕" pill when `?documentId=` is
                  present.
  Error list    — grouped by category in ERROR_TAXONOMY declaration order
                  (skip groups with 0 in the current filter).
  Empty state   — "No errors yet — submit a writing task to start
                  building your archive." with a link to /library.
</div>
```

Reads its filter from `searchParams` (Next 16 async `searchParams`
pattern — see `library/page.tsx:8` for the exact signature):

```ts
{ category?: string; documentId?: string; subcategory?: string; window?: string }
```

`window` is parsed and forwarded as a no-op so S6 can wire it without
URL breakage.

### Step 6 — Components: `src/app/progress/_components/`

Co-locate per the project convention
(`src/app/library/_components/`, `src/app/practice/_components/`):

- `progress-filters.tsx` (client) — category chip strip; mirrors
  `library-filters.tsx`. Updates the URL via `useRouter` +
  `useSearchParams`. The "Document: <title> ✕" pill only renders when
  `documentId` is present; clicking ✕ removes that param.
- `archived-error-card.tsx` — one row per error. Layout:
  - Category chip (uses `CATEGORY_STYLES` — see Step 7 about the move).
  - Subcategory label from `ERROR_TAXONOMY[cat].subcategories[sub]`.
  - **Sentence snippet**: render the surrounding sentence by slicing
    `submissionContentFr` from the nearest `.` / `!` / `?` / `\n`
    *before* `spanStart` to the nearest one *after* `spanEnd`, then
    bolding the original via the same colour underline used on the
    feedback page. Helper: `extractSentence(content, start, end)` in
    `src/lib/text.ts` (new).
  - Submission metadata: doc title (or "Original document removed"
    fallback, mirroring `practice/page.tsx:46`) + relative date.
  - Two CTAs:
    - "View in feedback →" → `Link` to
      `/practice/<submissionId>/feedback#error-<errorIndex>`. Browser
      handles the anchor scroll because `submission-text.tsx` and
      `error-card.tsx` already render `id="error-<n>"` with
      `scroll-mt-6`.
    - "Practice this" → opens `MicroDrillDialog` (Step 8). Only shown
      when `error.microDrill` is non-null.
- `category-section.tsx` — one collapsible section per category, header
  shows count chip; opens by default when `?category=` matches.

### Step 7 — Move `category-styles.ts` out of the feedback folder

Right now `CATEGORY_STYLES` lives at
`src/app/practice/[submissionId]/feedback/_components/category-styles.ts`
and the archive cards need the same lookup. Move the file (and the
`superscript()` helper) to **`src/lib/category-styles.ts`** so it sits
alongside `taxonomy.ts` / `cefr.ts`. Update existing imports inside the
feedback components — there are only four (`error-card.tsx`,
`submission-text.tsx`, `feedback-panel.tsx`, `improvement-card.tsx`).

**Do not** add Tailwind classes into `src/lib/taxonomy.ts` itself —
Sprint 4 explicitly kept that file pure data, and S5 honours the same
boundary.

### Step 8 — Micro-drill dialog: `src/components/micro-drill-dialog.tsx`

Lives at the shared `src/components/` level because both the feedback
page (`error-card.tsx`) and the archive page (`archived-error-card.tsx`)
trigger it. Follow the existing Radix Dialog primitive in
`src/components/ui/dialog.tsx` and the form-action pattern from
`add-document-dialog.tsx`.

UI:

- Trigger button passes `errorId` and the snapshotted `microDrill` text.
- Dialog body shows: the prompt text in `font-serif`, a brief reminder
  of the original error → correction (so the user has the context
  without re-opening the feedback page), a `<textarea>` for the
  2-sentence response, and a Submit button.
- Use `useTransition` (already the pattern in `writing-form.tsx`) to
  call `createMicroDrill` and render the returned `MicroDrillFeedback`
  inline — green check + `comments[]` if `ok === true`, otherwise a
  neutral panel with `comments[]` and `better_examples[]`.
- Close behaviour: Cancel clears, Submit keeps the dialog open showing
  the feedback. A "New attempt" button resets state without re-opening.

The dialog is **not** a separate page — keep it modal so the user does
not lose archive-list scroll position.

### Step 9 — Wire up the rule tooltip

Now that Step 2 has seeded `rules`, replace the placeholder line in
`error-card.tsx:104`:

```tsx
{error.ruleId && <p className="text-[10px] text-muted-foreground">Rule: {error.ruleId}</p>}
```

with a small inline rule card that renders `rule.name` + a Radix
`Popover` containing `descriptionEn` + `examples[]`. Add a server-side
loader `getRule(ruleId)` to `src/lib/actions/errors.ts` and resolve
rules at the **page level** (batch them — one query per page render),
then pass them down — do not fetch per-card on the client.

If `error.ruleId` does not resolve to any seeded row (AI freelanced an
id), fall back to the current `Rule: <id>` line so nothing is lost.

### Step 10 — Reverse-entry from Library → Progress (cheap win)

PRD §7.1.2 specifies that the error-count chip on each library row
links to `/progress?documentId=<id>`. The chip exists today in
`src/app/library/_components/document-row.tsx` but is not yet
clickable. Wrap it in `<Link>` so the archive page receives the filter.
This is a 2-line change but it closes the round-trip between Library
and Progress that S5 promises.

### Step 11 — Edge cases to handle in S5

- **No errors at all** → empty state per Step 5; do **not** render an
  empty filter strip.
- **`documentId` filter where the document was deleted** → the join
  (Step 3) returns `documentTitle: null`. The pill should still show
  "Document removed" so the user understands why results are filtered;
  clicking ✕ clears the filter.
- **Span out of bounds** in archived rows → S4 already clamps on
  insert, but `extractSentence(...)` should still defensively clamp to
  `[0, content.length]` and return the whole content if no sentence
  punctuation is found nearby.
- **AI emits a `rule_id` that doesn't exist** → see Step 9 fallback.
  Do **not** crash, do **not** auto-insert into `rules`.
- **Micro-drill submitted with empty response** → server action
  rejects with a thrown Error before calling OpenAI; the dialog shows
  the message via the `useTransition` error path (mirror the validation
  pattern in `createDocument`, `documents.ts:50`).
- **Same error opened twice in micro-drill dialog** → list prior
  attempts (most recent first) above the textarea by reading
  `getMicroDrillsForError`. This costs nothing and gives visible
  reinforcement.

### Step 12 — Out of scope for S5 (defer)

- **Top-card stats / trend chart / distribution chart / Top 3 patterns**
  — all S6 (PRD §7.4.1).
- **`window` time-bucket filter behaviour** — parse-and-forward only;
  real bucketing in S6.
- **Auto-generated SRS / spaced-repetition queue** — explicitly v2
  candidate (§13.3).
- **Learner-profile-driven task generation** — S7. The `errors` archive
  is the *data* that S7 will consume, but the consumption path is not
  built here.
- **Editing or re-submitting the original submission** — v2 (§15.2 #4).
- **Letting the user write rules manually** — out (§8.5: no
  user-customised taxonomy).

---

## 3. File-by-file Deliverables

| Path | Action |
|------|--------|
| `src/lib/db/schema.ts` | **edit** — add `microDrills` pgTable + type |
| `drizzle/<timestamp>_micro_drills.sql` | **new** (generated) |
| `scripts/seed-rules.ts` | **new** — deterministic rule rows, one per subcategory |
| `package.json` | **edit** — add `"db:seed-rules"` script next to `db:seed` |
| `src/lib/ai/micro-drill.ts` | **new** — `MicroDrillFeedbackSchema` + `evaluateMicroDrill()` |
| `src/lib/ai/feedback.ts` | **edit** — append rule-id list to system prompt |
| `src/lib/actions/errors.ts` | **new** — `listErrors`, `getErrorCounts`, `getMicroDrillsForError`, `createMicroDrill`, `getRule` |
| `src/lib/text.ts` | **new** — `extractSentence(content, start, end)` helper |
| `src/lib/category-styles.ts` | **moved** from `practice/[submissionId]/feedback/_components/category-styles.ts` |
| `src/app/practice/[submissionId]/feedback/_components/{error-card,submission-text,feedback-panel,improvement-card}.tsx` | **edit** — update import paths to `@/lib/category-styles` |
| `src/app/practice/[submissionId]/feedback/_components/error-card.tsx` | **edit** — replace rule-placeholder + add micro-drill trigger |
| `src/app/progress/page.tsx` | **rewrite** — replace `ComingSoon` with archive |
| `src/app/progress/_components/progress-filters.tsx` | **new** (client) |
| `src/app/progress/_components/category-section.tsx` | **new** |
| `src/app/progress/_components/archived-error-card.tsx` | **new** |
| `src/components/micro-drill-dialog.tsx` | **new** (client) — shared by archive + feedback page |
| `src/app/library/_components/document-row.tsx` | **edit** — wrap error-count chip in `Link` to `/progress?documentId=<id>` |

No changes to `errors`, `submissions`, `writing_tasks`, `documents`,
`reading_sessions`, or `rules` schema. The only DB delta is the new
`micro_drills` table.

---

## 4. Suggested Build Order

1. **Step 1 (schema + migration) + Step 2 (rules seed).** Get the data
   layer landed first. Verify with `npm run db:studio`: `micro_drills`
   exists; `rules` has rows whose `id` strings are stable.
2. **Step 3 (server actions) + Step 4 (micro-drill AI).** Pure backend,
   no UI. Smoke-test `listErrors()` + `evaluateMicroDrill()` from a
   one-off script or `db:studio`.
3. **Step 7 (move `category-styles.ts`).** Tiny refactor; do it before
   building new UI so both old and new surfaces import from the same
   path.
4. **Step 5 + Step 6 (archive page + components).** Render raw list
   first, then add filtering, then add sentence-snippet styling.
5. **Step 8 (micro-drill dialog).** Wire it into the archive card and
   the feedback page's `error-card.tsx` in the same pass.
6. **Step 9 (rule tooltip).** Last — depends on Step 2's seed.
7. **Step 10 (Library → Progress reverse-entry).** Two-line change,
   ship after the archive page is live so the link actually leads
   somewhere useful.
8. **Self-check against PRD Sprint 5 checklist (§13.2):**
   - [ ] Errors archive page (browse by category)
   - [ ] Click error jumps back to original sentence
   - [ ] Micro-drill UI inside the error card → 2-sentence drill
   - [ ] (Carry-over from S4 deferral) `rule_id → rules` link resolves
   - [ ] (Carry-over) Micro-drill responses do **not** populate the
         `errors` table (§15.2 #5)
   - [ ] Library error-count chip routes to `/progress?documentId=<id>`
         per §7.1.2
