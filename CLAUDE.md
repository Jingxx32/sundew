# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Working preferences (from past sessions — follow these)

- **Git commits: NO `Co-Authored-By: Claude` or `Generated with Claude Code` trailers.** The user explicitly asked for this twice (2026-06-20). This overrides the default commit-trailer behavior. Plain conventional-commit messages only.
- **Plan first, code on "开始".** When the user says 构思 / brainstorm / 探讨 / 审计 / "先不要动手" / "先不着急", do NOT modify code or run mutating commands until they explicitly say 开始/做吧. Pausing for confirmation before spending API credits (TTS, batch enrichment) is expected.
- **Estimate API costs proactively.** The user is cost-sensitive (OpenAI tokens, Azure free tier). Before proposing any batch AI operation (TTS generation, bulk enrichment, image→text), state a rough cost estimate up front instead of waiting to be asked.
- **Dev server is usually already running.** The user typically has `npm run dev` on :3000 open in their own browser. Check for an existing server before starting a preview one, and don't insist on opening pages the user says they already have open.
- **Verification** (no test suite): `npx tsc --noEmit && npm run lint`, plus exercising the changed page in the browser.
- Respond in Chinese (中文) unless the user writes in English.

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

Lumière is an output-driven French learning app. The core loop: read French source material → AI generates a writing task anchored to it → user writes → AI gives structured, classified feedback → every error flows into a persistent learner profile that drives future tasks.

This is a personal app (single user, no auth). Current status: **MVP (S1–S7) and v0.2 (S8–S10) are shipped** — full writing-feedback loop, errors archive, progress dashboard, learner profile, generic quiz engine (podcast cloze dictation), conjugation drills, TCF listening/reading question bank (~3200 questions) with drill + exam modes, lemma-keyed vocabulary memory, and Speaking Phase 1 (read-aloud with Azure pronunciation assessment; needs `AZURE_SPEECH_KEY`). Next up: the TCF error loop — see `docs/superpowers/specs/2026-07-06-tcf-error-loop-design.md`. Audits live in `docs/audit-*.md` / `docs/*-audit-*.md`.

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
```

### 写入单题 TCF 讲解

日常逐题写讲解走 dev-only 端点（需 `npm run dev` 开着）：

```bash
curl -X POST localhost:3000/api/tcf/explanations --data-binary @CE-T1-Q5.md
curl -X POST "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=3" --data-binary @-
```

正文是原始 markdown。定位取自 frontmatter（`test` / `skill` / `question`），
缺失时取 URL 的 `?test=&skill=&q=`；两者不一致会被拒绝。生成讲解时必须满足：

- `skill` 只能是字面的 `reading` / `listening`
- `test` 是试卷号：listening 1–42，reading 1–39
- `question` 是该套试卷内的序号（1–39），不是全局题号
- 英文翻译放在标题**文字恰好是 `全文翻译`** 的段落下（`#` 到 `######` 任意级别都认，
  但文字必须完全一致），否则 `translation_en` 为 null
- 不要输出对话式口头禅（如「说 next。」），会原样渲染到页面上
- 不要把整篇内容包在代码围栏里，首行必须是 `---` 或正文本身
- 正文上限 256KB

讲解**只存在数据库里**，端点是唯一入口，不再往仓库外的目录双写一份。代价要记住：
重新导入某套试卷会 delete+insert 题目并擦掉 explanation 列，写错 locator 也会覆盖
旧讲解，两种情况都不可撤销。所以——

- **重导试卷前先 `npm run tcf:explain-export`**，把库里所有讲解导成 markdown
  存到 `data/tcf-explanations/`（已 gitignore）。那是备份，不是真源；
  恢复靠把导出的文件重新 POST 回端点。

TCF import/TTS pipeline scripts also live in `scripts/` (tracked; their input
data and `scripts/.tcf-cache/` stay local — copyrighted exam content).

There is no test suite yet.

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
TCF_LISTENING_DIR     # TCF import only — local folder of listening PDFs + audio
TCF_READING_DIR       # TCF import only — local folder of reading questions
TCF_SAMPLE_PDF        # TCF parser debug scripts only — one local PDF
```
