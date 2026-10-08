# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Working preferences (from past sessions — follow these)

- **Git commits: NO `Co-Authored-By: Claude` or `Generated with Claude Code` trailers.** The user explicitly asked for this twice (2026-06-20). This overrides the default commit-trailer behavior. Plain conventional-commit messages only.
- **Plan first; write code only after an explicit go-ahead.** When the user asks to brainstorm, discuss, audit, or hold off on implementation, do NOT modify code or run mutating commands until they explicitly authorize it. Pausing for confirmation before spending API credits (TTS, batch enrichment) is expected.
- **Estimate API costs proactively.** The user is cost-sensitive (OpenAI tokens, Azure free tier). Before proposing any batch AI operation (TTS generation, bulk enrichment, image→text), state a rough cost estimate up front instead of waiting to be asked.
- **Dev server is usually already running.** The user typically has `npm run dev` on :3000 open in their own browser. Check for an existing server before starting a preview one, and don't insist on opening pages the user says they already have open.
- **Verification** (no test suite): `npx tsc --noEmit && npm run lint`, plus exercising the changed page in the browser.
- Respond in the language used by the user unless they ask otherwise.

### Avoiding rework (added 2026-08-18 — the user's top complaint)

Past sessions burned the user's time with a repeated pattern: ship a `feat`, then
two or three `fix` commits for things that were knowable up front. Root cause: writing
code before looking at the real inputs and constraints. These three rules are non-negotiable.

1. **Read real samples before writing any parser, importer, or transformer.** Open 3–5
   actual input files, enumerate the variations found (optional fields, quoting, section
   shapes, encodings), and show that list to the user before writing code. Do not discover
   edge cases by shipping. (Cost of skipping it: `6fa5b15` → `45dc45d` → `0846505`.)
2. **Ask up front about external paths, env vars, and data sources.** Anything that must
   match something outside the repo cannot be guessed. One blocking question is cheaper
   than three follow-up `fix` commits. (Cost of skipping it: `86202c5` → `3dd008e` → `aae81d5`.)
3. **Never claim "done" without running the change over real data and pasting the output.**
   `tsc --noEmit && npm run lint` passing is not evidence the feature works. With no test
   suite, the substitute is a real run with counts (processed / succeeded / failed) shown
   to the user. Same for privacy: inspect the actual staged diff before committing —
   exam content leaked into git twice (`eab409d`, `9d4f7d5`).

Related: **match the surrounding code before writing, not after review.** Read the existing
components in the same folder and follow their spacing, composition, and naming idiom, so
the user isn't left correcting style in a follow-up commit (`fcecc9e` → `70a6a6e`).

## Project overview

Sundew is an output-driven French learning app. The core loop: read French source material → AI generates a writing task anchored to it → user writes → AI gives structured, classified feedback → every error flows into a persistent learner profile that drives future tasks.

This is a personal app that friends can join by invite code or try as one-click guests (guest / full / admin access). Current status: **MVP (S1–S7) and v0.2 (S8–S10) are shipped** — full writing-feedback loop, errors archive, progress dashboard, learner profile, generic quiz engine (podcast cloze dictation), conjugation drills, TCF listening/reading question bank (~3200 questions) with drill + exam modes, lemma-keyed vocabulary memory, and Speaking Phase 1 (read-aloud with Azure pronunciation assessment; needs `AZURE_SPEECH_KEY`). Next up: the TCF error loop — see `docs/superpowers/specs/2026-07-06-tcf-error-loop-design.md`. Audits live in `docs/audit-*.md` / `docs/*-audit-*.md`.

## Commands

```bash
npm run dev          # Start the dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

npm run db:init      # Apply pending migrations (safe, idempotent) — run after any schema change
npm run db:generate  # Generate a new migration after editing src/lib/db/schema.ts
npm run db:studio    # Open Drizzle Studio at https://local.drizzle.studio
npm run db:seed      # Insert sample French documents
npm run db:seed-rules # Seed the grammar-rules knowledge base
npm run db:reenrich  # Re-run vocab enrichment for already-enriched entries

npm run tcf:explain-export  # Back up every TCF explanation to data/tcf-explanations/
npm run sample:check         # Seed + delete the sample workspace in a rolled-back transaction (after migrations, before deploys)
```

### Write a TCF explanation for one question

For everyday, per-question explanation authoring, use the development-only endpoint (with `npm run dev` running):

```bash
curl -X POST localhost:3000/api/tcf/explanations --data-binary @CE-T1-Q5.md
curl -X POST "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=3" --data-binary @-
```

The body is raw Markdown. Its locator comes from the frontmatter (`test` / `skill` / `question`), or from the URL's `?test=&skill=&q=` when frontmatter is absent; conflicting locators are rejected. An explanation must meet these requirements:

- `skill` must be exactly `reading` or `listening`.
- `test` is the test number: 1–42 for listening and 1–39 for reading.
- `question` is its ordinal within that test (1–39), not a global question number.
- Put the English translation below a heading whose text is exactly `Translation`. Any heading level from `#` to `######` is accepted case-insensitively; the legacy Chinese heading remains supported for pre-2026-09-04 material. Otherwise, `translation_en` is null.
- Do not add conversational filler such as “say next”; it is rendered verbatim in the page.
- Do not wrap the entire body in a code fence. Its first line must be `---` or body text.
- The body is limited to 256 KB.
- To show a verdict bar and one reason per option after an answer, put a `## Verdict` section at the beginning. The legacy Chinese verdict heading remains supported. Use `- Key: <the decisive text plus a brief reason>`, followed by one `- A ✅ …` through `- D ❌ …` line per option. Lines bind by letter and may be reordered or omitted. This section is parsed into `explanation_meta`, rendered by the UI, and automatically removed from the rendered prose to avoid duplication. Omitting it is valid but leaves out the verdict bar.

#### Explanation-body standard (from 2026-09-04)

Write explanations **only in English**. Prioritize understanding the original text: for most questions, the answer follows naturally once the text is understood. Keep option logic in the Verdict lines and reserve the prose for the language itself. Template:

```markdown
## Verdict
- Key: <the decisive original sentence + a brief reason>
- A ❌ <one line> … - D ✅ <one line>

## Translation
Translate the question, text, and options.

## Line by line
For each line: Vocabulary / Grammar / Tense / Register (omit empty sections).

## Takeaway   ← optional; one line maximum
## Pattern
**Answer: D**
```

- Do **not** write an option table headed `## Options`; it duplicates Verdict line by line and was retired on 2026-09-04.
- Do not write “→ eliminate A/C” in line-by-line explanations. One such marker is allowed only under the decisive sentence.
- Vocabulary entries are English-only glosses, one word per line, with zero or one example sentence by default.
- Cover only the one or two grammar points actually used in that sentence. Refer to rules already covered in one sentence rather than reopening a table.
- Write `## Takeaway` only for a real cross-question pattern (for example, the correct answer is often a summary rather than a verbatim phrase). Limit it to one line; otherwise omit the section.
- **The `- A ❌ …` Verdict lines render as plain text**: `option-list.tsx` prints their strings directly below their options. `*italic*` and `` `code` `` markers will display literally. Markdown is effective only in the prose from `## Translation` onward.
- Do not retroactively rewrite pre-2026-09-04 Chinese explanations; the parser recognizes both English and legacy Chinese headings.

#### Listening-question differences (from 2026-09-04)

Listening adds a failure mode beyond reading: the learner may understand the text on sight but **not hear it** because of liaison, elision, contractions, homophones, numbers, or proper names. Add an audio layer to the reading template by replacing `## Pattern` with `## Listen again`:

```markdown
## Verdict            ← as in reading; prioritize listening traps such as “the word appears, but it is not the answer”

## Transcript         ← listening-only. This is a restructured transcript, not a quote (the example below is invented, not an exam question)
- **A:** Tu es encore au bureau ?
- **B:** Oui, je termine un dossier.
- **A:** *On avait dit qu'on partait à six heures.*
  - ↳ The phrase runs together; it is easy to miss the whole *qu'on*.

## Translation        ← as in reading: translate the question, text, and options
## Line by line       ← as in reading
## Listen again       ← one line: which sentence to replay and what to listen for
**Answer: D**
```

- **`## Transcript` must be restructured**. The stored transcript is raw OCR: sentences run together (for example, `…problèmes.Et donc…`), speakers are missing, and the question may be fused onto the final body line. Only 183 of 1,279 dialogue questions have a `Question:` marker. Identifying speakers, sentence boundaries, and punctuation is this section's main value.
- **Writing `## Transcript` automatically hides the page's built-in “Transcription” panel**, in both drill and exam modes. The restructured version replaces the raw OCR so a dialogue is not shown twice. Either omit the section or make it complete: it becomes the question's only source text. `hasTranscriptSection()` makes this determination; `## Propositions` does not trigger it because those two question types have only a one-sentence transcript without duplication.
- **Write `↳` annotations as nested list items**, with a two-space-indented `- ↳ …` below the parent as shown above. A space-indented continuation will not work: four spaces make a Markdown code block.
- **Leave a blank `>` line between dialogue turns in `## Translation`**. Without it, Markdown merges consecutive blockquote lines into one paragraph.
- **Annotation density:** always annotate the decisive sentence; annotate other sentences only when they can be heard as another word (homophones, unrecognizable contractions, numbers, or names). Do not mark ordinary liaison. **Limit each question to three `↳` lines.**
- **Use `↳` for general listening guidance, not a precise phonetic or liaison judgment.** Explanation authors do not verify the audio, so phoneme-level claims are not reliable. Use guidance independent of an exact pronunciation, such as “at high speed, a number immediately before a noun can sound like one word.” T1 Q1–Q4/Q10 were manually checked and remain unchanged; this rule governs all later explanations.
- Question variants: `dialogue` uses the full template. For `spoken_options` (the audio is only one question, with the load in the four options) and `image` (no source text to restructure), replace `## Transcript` with `## Propositions`; describe what each option says and how it sounds, and add the corresponding visual meaning for image questions.

Explanations **exist only in the database**. The endpoint is the sole entry point; do not maintain another copy in a directory outside the repository. Reimporting a test deletes and reinserts questions, erasing explanation columns; an incorrect locator can also overwrite an existing explanation. Neither is reversible. Therefore:

- **Before reimporting a test, run `npm run tcf:explain-export`** to export every database explanation as Markdown into `data/tcf-explanations/` (already gitignored). This is a backup, not the source of truth; restore by POSTing the exported files to the endpoint.

TCF import/TTS pipeline scripts also live in `scripts/` (tracked; their input
data and `scripts/.tcf-cache/` stay local — copyrighted exam content).

`npm test` runs the existing TypeScript unit tests. Before release, run
`npm run typecheck`, `npm run lint`, and `npm test`; production smoke tests remain
separate from these checks.

## Architecture

### Data flow

All DB access goes through **server actions** in `src/lib/actions/`. Pages are async server components that call these actions directly — there is no API layer. Mutations use `revalidatePath` to refresh after writes.

```
Page (async server component)
  └── lib/actions/*.ts  ("use server" — Drizzle queries, revalidatePath)
        └── lib/db/index.ts  (Drizzle client — postgres.js)
              └── lib/db/schema.ts  (single source of truth for all tables)
```

The one exception to "no API layer": `app/api/speaking/assess/route.ts`, a route
handler for audio upload + Azure pronunciation assessment.

### Access levels

Access is guest / full / admin, derived in `src/lib/auth/user.ts`. Guests are one-click anonymous accounts, deleted 7 days after creation; see `docs/operations/guest-access.md`.

- `src/lib/access/features.ts` lists what guests may use. New server actions in a gated area call `requireFeature`; gated pages call `pageGate`.
- Every new table with a `user_id` column is picked up by `src/lib/account/owned-tables.ts` automatically (account and guest deletion). A test fails if a child table without `user_id` is not registered there.
- The sample workspace guests start with is seeded from `src/lib/sample-workspace/fixtures/` (drafts in `source/`; `data/` is gitignored). Author account: `sample-author@example.com`.
- Feedback highlights are re-located with `src/lib/feedback/error-span.ts`; do not trust stored offsets alone.

### Database

**PostgreSQL** (Azure) via the `postgres` package (postgres.js) + Drizzle ORM (migrated from SQLite in S3.5). Connect via `DATABASE_URL` env var. ~23 tables in five groups:

- Core loop: `documents → reading_sessions`, `writing_tasks → submissions → errors`, `rules`, `micro_drills`
- Vocabulary memory: `vocabulary_lookups` (lemma-keyed) + `vocabulary_aliases` + `vocabulary_occurrences`
- Quiz engine (PRD v0.2 D-0): `quiz_sets → quiz_passages → quiz_questions`, `quiz_attempts`, `conjugation_attempts`
- TCF: `tcf_sets → tcf_questions`, `tcf_attempts` (whole-exam runs)
- Speaking: `speaking_prompts → speaking_scripts / speaking_sessions → speaking_turns`; plus `user_settings` (KV)

Conventions: older tables use `text` PKs + app-side `randomUUID()` and naive `timestamp`; **new tables use `uuid` PK `defaultRandom()` + `timestamp(..., { withTimezone: true })`**. All queries are **async** — use `await db.select()...` etc. Do **not** use `.run()` / `.get()` / `.all()` (SQLite-only).

### Error taxonomy

`src/lib/taxonomy.ts` is the most important non-schema file. It defines `ERROR_TAXONOMY` — 9 categories × ~4 subcategories = ~33 leaf error types for A2-B1 French learners. This is:
- The schema the AI must conform to when emitting structured feedback (enforced via Zod in S4)
- The index every dashboard and learner-profile decision references
- The source for `CATEGORY_COLORS` used in feedback highlights

Do not add categories without considering AI labelling accuracy and dashboard complexity.

### UI conventions

- **Fonts**: `font-sans` (Inter) for UI, `font-serif` (Source Serif 4) for reading content. Apply `font-serif` to document text and display headings.
- **Design tokens**: All colours are CSS custom properties defined in `globals.css` and exposed via Tailwind's `@theme inline`. Use semantic tokens (`text-muted-foreground`, `bg-surface`, `border-border`, `text-accent`) — never raw colour values.
- **Component style**: UI primitives live in `src/components/ui/` and are built with `cva` + `cn`. Follow the existing `Button` / `Chip` / `Card` pattern when adding new primitives.
- **Page-level components**: Co-locate sub-components under `_components/` inside the route folder (e.g. `app/library/_components/`).
- **Reading text**: Wrap document content in `<article className="reading-prose">` — the `.reading-prose` class in `globals.css` sets font, size, and line height.

### Planned work (don't implement prematurely)

Specs and plans live under `docs/superpowers/{specs,plans}/`; product direction in `docs/audit-*.md`. Current queue: TCF error loop steps 2–4 (AI skill-tagging, smart re-drill queue, weak-points panel + exam review page), lightweight review queue (Leitner), TCF EE writing mode (gated on writing habit recovery).

## Deployment

Production runs on **Vercel Hobby** at `https://sundew.jingxuanxu.com` (domain registered at
Cloudflare; its DNS records point at Vercel as **DNS only / grey cloud** — never proxied).
Vercel builds and deploys `main` through its Git integration; env vars live in the Vercel
project settings. `vercel.json` pins functions to `yul1` (Montréal), next to the Azure
Postgres in Canada Central.

- Vercel caps request bodies at **4.5 MB** and function runtime at **300 s** on Hobby. Keep
  upload limits below 4.5 MB and long AI calls well under 300 s.
- Vercel's egress IPs are dynamic, so the Azure Postgres firewall allows all IPs; the
  connection string must keep `sslmode=require`.
- `BETTER_AUTH_URL` and the Google OAuth redirect URI
  (`<origin>/api/auth/callback/google`) must match the production domain.
- Transition (from 2026-10): the old Azure App Service (`sundew-french`) and its workflow
  `.github/workflows/main_sundew-french.yml` stay for about a week after cutover as a
  rollback path. When they are removed, also drop `output: "standalone"` from
  `next.config.ts` (only that workflow needs it) and the `AZUREAPPSERVICE_*` repo secrets.

## Environment variables

```
OPENAI_API_KEY        # Required — word lookup, task generation, writing feedback
OPENAI_MODEL_LOOKUP   # defaults to gpt-4o-mini
OPENAI_MODEL_TASK     # defaults to gpt-4o
OPENAI_MODEL_FEEDBACK # defaults to gpt-4o
OPENAI_MODEL_ENRICH   # vocab enrich; defaults to gpt-4o-mini
DATABASE_URL          # Required — PostgreSQL connection string (e.g. postgres://user:pass@host/db)
AZURE_SPEECH_KEY      # Speaking only — Azure Cognitive Services Speech key
AZURE_SPEECH_REGION   # Speaking only — e.g. canadacentral
BETTER_AUTH_URL       # Required — site origin, e.g. https://sundew.jingxuanxu.com
BETTER_AUTH_SECRET    # Required — session signing secret
GOOGLE_CLIENT_ID      # Google sign-in
GOOGLE_CLIENT_SECRET  # Google sign-in
RESEND_API_KEY        # Production email OTP (dev prints codes to the console)
AUTH_EMAIL_FROM       # Production email OTP sender address
AUTH_SIGNUP_ENABLED   # Invite sign-up kill switch; "false" stops new accounts (codes always required)
GUEST_ACCESS_ENABLED  # "false" disables one-click guest accounts
AUTH_RATE_LIMIT_ENABLED # Development only: "true" enables Better Auth rate limiting
CRON_SECRET           # Required in production — Vercel Cron bearer token for /api/cron/*
CLOUDFLARE_R2_ACCOUNT_ID / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _BUCKET  # Media + recordings (required in production)
TCF_LISTENING_DIR     # TCF import only — local folder of listening PDFs + audio
TCF_READING_DIR       # TCF import only — local folder of reading questions
TCF_SAMPLE_PDF        # TCF parser debug scripts only — one local PDF
```
