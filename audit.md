# Lumière — Sprint 1–3 PRD Audit

**Audited against**: [archived PRD v0.1](docs/archive/PRD-v0.1.md) (frozen 2026-05-05)
**Scope**: Sprints 1, 2, and 3 only. Sprints 4–7 are explicitly out of scope for this audit.
**Date**: 2026-05-15
**Auditor stance**: requirements-only. Code quality, style, and performance are not assessed.

---

## Dimensions confirmed from PRD

Before auditing, I confirmed my understanding of the following PRD dimensions:

- **Core business objective**: A single-user, output-first French training ground. Reading is a launchpad for forced French writing; every error feeds a persistent, classified learner profile that re-shapes future tasks. The product's *moat* is the closed loop "read → write → classified feedback → archived errors → next task" (§3, §6).
- **Feature boundaries (in scope for S1–S3)**: Library CRUD + filters, document Reader with selection-triggered lookup popover, reading-session tracking, vocabulary collection, "Generate Writing Task" anchored either to the whole document or to collected vocab, Task Stage with writing form + submit. Explicit out-of-scope from §7 and §16 includes PDF/EPUB import, TTS, highlights/annotations, multi-user, mobile, gamification, SRS.
- **User roles & permissions**: Exactly one role — the author themselves. There is no auth, no `users` table by design (§9.3). All actions are unrestricted.
- **Edge cases / error handling**: PRD §15.1 explicitly calls out: OpenAI quality/latency, taxonomy mismatch, AI cost (mini for lookup, controls on feedback), sparse profile, and French diacritics — "NFC normalization required".
- **Non-functional requirements**: Local-first, SQLite + better-sqlite3 (§12.1, "strong decision"), Structured Outputs (Zod) for *all* AI calls (§12.3, "strong decision"), Server Actions only (no API layer), 200px fixed Sidebar (no top-tab, no hamburger).

---

## 1. PRD Intent Summary

Lumière exists because every other AI study tool (NotebookLM, Claude, ChatGPT, Anki) lets users *understand* French without ever forcing them to *produce* it, leaving them with the illusion of learning. The product's hypothesis is that learning only sticks when production is mandatory, errors are classified into a fixed 9×33 taxonomy, and those errors persist into a profile that re-shapes the next writing prompt. v0.1 is a single-user, local-first tool intentionally scoped so the author can validate the closed loop on themselves before deciding whether to productise. The error taxonomy is the product's "soul" — every other module exists to feed it (S4) or consume it (S5–S7).

---

## 2. Correctly Implemented ✅

### Sprint 1

- **Drizzle schema, 6 tables** ([src/lib/db/schema.ts](src/lib/db/schema.ts)) — `documents`, `reading_sessions`, `writing_tasks`, `submissions`, `errors`, `rules`. All columns from §9.2 present, including the JSON shapes for `target_words`, `target_grammar`, `fr_examples`, `vocabulary_looked_up`.
- **Foreign-key cascade policy** matches §9.3: `errors → submissions` cascade; `writing_tasks.documentId` `ON DELETE SET NULL` (preserves historical submissions when a document is deleted).
- **Error taxonomy** ([src/lib/taxonomy.ts](src/lib/taxonomy.ts)) — exactly 9 categories × 33 leaves, mutually exclusive, no `severity` field. Matches §8.2 line-for-line including `CATEGORY_COLORS`.
- **Library page** ([src/app/library/page.tsx](src/app/library/page.tsx)) — sorted by `lastReadAt desc, createdAt desc`; Continue Reading hero card; per-row title, source, word count, CEFR chip; total word count summary.
- **Continue Reading card** ([src/app/library/_components/continue-reading.tsx](src/app/library/_components/continue-reading.tsx)) — progress bar, excerpt preview, CEFR chip, word count, time-since-read. Matches §7.1.1.
- **Add Document dialog** ([src/app/library/_components/add-document-dialog.tsx](src/app/library/_components/add-document-dialog.tsx)) — Zod-validated server action; title/content required; source/type/url optional; correct enum (`news | literature | personal | other`).
- **Sidebar navigation** ([src/components/sidebar.tsx](src/components/sidebar.tsx)) — 200 px fixed, four items (Library / Practice / Progress / Settings). Matches §10 "strong decision".
- **Design tokens** — fonts (Inter + Source Serif 4), `.reading-prose` class, `font-serif` on document content.

### Sprint 2

- **OpenAI client wrapper** ([src/lib/ai/client.ts](src/lib/ai/client.ts)) — env-driven model selection. `gpt-4o-mini` default for lookup, `gpt-4o` for task/feedback, matching the cost strategy in §12.3.
- **Word lookup popover** ([src/app/documents/[id]/_components/word-lookup-popover.tsx](src/app/documents/[id]/_components/word-lookup-popover.tsx)) — selection-triggered, positioned below the range. The 6 PRD-mandated sections all appear in the mandated order: header (word + POS), level chip, translation, conjugation (verbs only — `null` from Zod hides the section), "in this context", examples, save+Dict actions. Matches §7.2.2 "strong decision".
- **Structured Output via Zod** in [src/lib/ai/lookup.ts](src/lib/ai/lookup.ts) (`zodResponseFormat`) — satisfies §12.3 strong decision.
- **"IN THIS CONTEXT" framing** — the system prompt explicitly tells the model to explain *why this form / why this agreement in this sentence*, not a dictionary entry. Matches the differentiation argument in §7.2.2.
- **Save to vocabulary** ([src/lib/actions/reading.ts:21](src/lib/actions/reading.ts:21)) — persists to `readingSessions.vocabularyLookedUp` (JSON array), deduped by lowercase word.
- **This Session sidebar** ([src/app/documents/[id]/_components/session-sidebar.tsx](src/app/documents/[id]/_components/session-sidebar.tsx)) — live timer, count stat, list of saved words, and the "Task from these N words" CTA when ≥1 word saved. Matches §7.2.1.
- **Reading progress tracking** — `IntersectionObserver` over `<p>` elements; only writes monotonic increases; persisted via [updateReadingProgress](src/lib/actions/reading.ts:56). Matches §7.2.1 “S2 — automatic reading-progress tracking”.
- **Reading session lifecycle** — created on mount, duration flushed on unmount via cleanup effect.

### Sprint 3

- **`generateWritingTask` server action** ([src/lib/actions/tasks.ts:11](src/lib/actions/tasks.ts:11)) — accepts a document and an optional vocab list, writes a `writing_tasks` row, returns the id. Honours the §7.3.3 "strong decision" — every task is anchored to either a document or document+vocab; there is no "random task" entry point.
- **Task generation Zod schema** ([src/lib/ai/task.ts](src/lib/ai/task.ts)) — `prompt_en`, `target_words`, `target_grammar`, `difficulty`, `min/max_word_count` exactly matches the §13.2 S3 spec and Appendix B.
- **Reader → Practice handoff** ([src/app/documents/[id]/_components/reader-client.tsx:122](src/app/documents/[id]/_components/reader-client.tsx:122)) — top-bar "Generate Writing Task" button works (whole-doc path) and sidebar "Task from these N words" works (vocab-anchored path). Both routes covered.
- **Task Stage / Practice page** ([src/app/practice/page.tsx](src/app/practice/page.tsx)) — task card displays "FROM <doc title>", English prompt, target words and grammar chips, level chip, word-count target. Matches §7.3.1.
- **Writing form** ([src/app/practice/_components/writing-form.tsx](src/app/practice/_components/writing-form.tsx)) — large Source-Serif textarea, live word counter, “below minimum” warning that still allows submission (PRD: “the button remains available below the minimum, with a warning”). Matches §7.3.1.
- **Submit → submission row** ([src/lib/actions/tasks.ts:46](src/lib/actions/tasks.ts:46)) — writes `submissions` with `content_fr`, `word_count`, then redirects to the feedback route with a "Sprint 4 coming" placeholder. This is correct: per §13.2 S3 scope, only the loading/handoff to the feedback stage is required in S3, not the feedback itself.

---

## 3. Deviations ⚠️

### D1 — Library search is title-only

- **Feature**: Library search input.
- **PRD requires**: §7.1.1 row 5: “**Search** — full-text search across titles and content.”
- **Current implementation**: [src/lib/actions/documents.ts:108](src/lib/actions/documents.ts:108) applies only `like(documents.title, q)`. Pasting a phrase that appears in document body returns no results.
- **Risk level**: **Medium**. The PRD primary user persona is someone working through self-curated long-form material (Le Monde articles, novel chapters); content search is a meaningful retrieval affordance for that workflow.
- **Recommendation**: Add `or(like(documents.title, q), like(documents.content, q))`. For Postgres (per the in-progress migration), use `ILIKE` or `to_tsvector` for accent-insensitive matching.

### D2 — Continue Reading "Generate Writing Task" button still disabled

- **Feature**: Continue Reading hero card CTA.
- **PRD requires**: §7.1.1 row 3 lists “dual CTAs” on the Continue Reading card. With S3 complete, both CTAs should be functional.
- **Current implementation**: [src/app/library/_components/continue-reading.tsx:69](src/app/library/_components/continue-reading.tsx:69) renders the button with `disabled title="Coming in S3"`. The Reader page wires up the same action, so the capability exists — just not exposed here.
- **Risk level**: **Low** (UX gap, not data-correctness) but visible — every Library visit shows a stale "Coming in S3" tooltip.
- **Recommendation**: Wire the button to a server action that calls `generateWritingTask(doc.id, [])` and redirects to `/practice?taskId=…`. Or extract the existing client handler in `ReaderShell` into a shared client component.

### D3 — CEFR estimator never upgraded from naïve heuristic

- **Feature**: Document `estimated_level`.
- **PRD / CLAUDE.md requires**: CLAUDE.md S2 scope: "real CEFR estimator". The code's own comment at [src/lib/cefr.ts:17](src/lib/cefr.ts:17) says "Replaced in S2+ with an LLM-based estimator that updates the document."
- **Current implementation**: Still `naiveLevelEstimate` (average word length buckets). No LLM-based estimator exists; nothing writes `estimated_level` after document creation.
- **Risk level**: **Medium**. The level chip drives downstream behaviour: it feeds the task-generation system prompt (`docLevel`) and the AI's choice of vocabulary/difficulty. A wrong level here cascades into wrong-difficulty tasks.
- **Recommendation**: Add an `estimateCefr(content: string)` Structured Output call (Zod enum over `CEFR_LEVELS`), invoke it once at document creation in [createDocument](src/lib/actions/documents.ts:33), and store the result.

### D4 — Session sidebar "Looked up" stat conflates looked-up vs saved

- **Feature**: This Session sidebar stats row.
- **PRD requires**: §7.2.1 — “show reading duration, the **number of words looked up**, and the collected vocabulary list.”
- **Current implementation**: [src/app/documents/[id]/_components/session-sidebar.tsx:39](src/app/documents/[id]/_components/session-sidebar.tsx:39) labels the second stat "Looked up" but renders `savedWords.length` — the count of words the user *chose to save*, not the count of lookups performed. A user who looks up 12 words and saves 3 will see "Looked up: 3".
- **Risk level**: **Low**. Cosmetic, but mis-attributes user behaviour. Also relevant later for the §14.2 reverse-funnel metric.
- **Recommendation**: Either (a) track lookup count separately in component state and display that, or (b) rename the stat to "Saved" to match the underlying data. (a) is closer to PRD intent.

### D5 — OpenAI key "configure" is read-only (.env-driven)

- **Feature**: Settings → OpenAI API key.
- **PRD requires**: §7.5 (S2 row) — “OpenAI API-key **configuration** and balance test.”
- **Current implementation**: [src/app/settings/page.tsx](src/app/settings/page.tsx) shows status and a masked key, but the only way to configure is to edit `.env` and restart the dev server. The "test" calls `openai.models.list()`, which proves *validity* but not *balance/quota*.
- **Risk level**: **Low** for v0.1 self-use (the author can edit `.env`), but it conflicts with the explicit S2 deliverable.
- **Recommendation**: Decide whether you accept the deviation (mark it in PRD changelog — single-user tool, .env is fine) or add an in-app form that writes to a local config and a `/v1/usage` call for balance. For the trial-Azure timeline noted in your project memory, accepting the deviation is the lower-cost path; just record it explicitly.

### D6 — Schema migrated from SQLite to Postgres without PRD changelog entry

- **Feature**: Database engine.
- **PRD requires**: §12.1 strong decision: “SQLite via `better-sqlite3` + Drizzle ORM ... zero operations for personal use; the database is a file, so backup means copying it.” CLAUDE.md still describes SQLite (`better-sqlite3`, WAL mode, FK ON, sync `.run()`).
- **Current implementation**: [src/lib/db/schema.ts:1](src/lib/db/schema.ts:1) uses `drizzle-orm/pg-core` (`pgTable`, `jsonb`, `timestamp`, `pgEnum`). This is consistent with your saved memory (Azure PG migration before S4) but the PRD §12.1 strong decision was not updated and the project's own CLAUDE.md still describes SQLite-only behaviour.
- **Risk level**: **Medium** — not because PG is wrong, but because PRD §0 says “strong decisions must be followed; changes require an explicit replacement,” and the changelog at §17 still only lists v0.1. CLAUDE.md describing nonexistent code is also a trap for future Claude sessions.
- **Recommendation**: Add a PRD changelog entry documenting the SQLite → Postgres switch with reason (Azure trial, multi-device, etc.) and update §12.1. Update [CLAUDE.md](CLAUDE.md) so "SQLite via better-sqlite3" and `.run()/.get()` sections reflect the new driver.

---

## 4. Suspected Omissions ❌

| # | Item | PRD location | Likely sprint | Notes |
|---|---|---|---|---|
| O1 | **NFC normalization** for selected text and (later) error spans | §15.1 mitigations | S2 (selection) → S4 (spans) | Not present anywhere in code. `selection.toString()` is used directly. Risk surfaces when users select words containing combined diacritics from copy-paste sources. Cheap to add now: `text.normalize("NFC")` in [word-lookup-popover.tsx:36](src/app/documents/[id]/_components/word-lookup-popover.tsx). |
| O2 | **Local cache for repeated lookups** | §15.1 — “locally cache repeated lookups” cost mitigation | S2 | No memoisation/caching of lookup results. Selecting the same word twice in one session pays the OpenAI cost twice. Per the PRD risk list, this was an explicit cost mitigation. |
| O3 | **Document Reader header word count + reading-progress chip** | §7.2.1 row 2 (“title, author/source, CEFR chip, word count, reading progress”) | S1 | Reader shows word count + level always, but progress chip only when `>0`. PRD lists progress as a header element — current implementation hides it on first visit. Minor. |
| O4 | **Error-count chip in document rows** | §7.1.1 row 2 + §7.1.2 (“the error-count chip is a reverse entry point”) | Cannot show until S4 generates errors | [document-row.tsx:80](src/app/library/_components/document-row.tsx:80) hardcodes `errorCount = 0`. Reasonable for S1–S3 since the `errors` table is empty, but flag for S4: the count must aggregate `errors JOIN submissions JOIN writing_tasks JOIN documents`. |
| O5 | **Visible error to user when lookup fails** | §15.1 risk: “unstable OpenAI correction quality” — by extension, lookup failures | S2 | [word-lookup-popover.tsx:64](src/app/documents/[id]/_components/word-lookup-popover.tsx) silently hides the popover on `catch`. The user has no signal that their selection triggered a failed request — they'll think nothing happened. |
| O6 | **Reading-session duration not flushed on visibility loss / page close** | Implicit in §14.2 metric “time the user spends reading” | S2 | Duration is only sent on React unmount. Closing the tab or browser leaves `endedAt = NULL` and `durationSeconds = 0`. PRD doesn't specify, but the reverse-funnel metric depends on this being accurate. Use `visibilitychange` + `navigator.sendBeacon`. |
| O7 | **`target_words` strict enforcement** | §7.3.3 (“a writing task must come from one of the following three sources”) and Appendix B (“must be used”) | S3 | Currently the AI is *asked* to use vocab via the system prompt (“use all of them if ≤5”) but nothing checks the returned `target_words` is a subset of the user-supplied vocab. A model that ignores instructions could emit unrelated words. Validation gap, not a hard bug. |
| O8 | **CEFR-level pinning in Settings** (“current CEFR level: manually set / AI-estimated”) | §7.5 | S6 — not in current scope | Confirm: this is correctly deferred. Listed here only to make the deferral explicit. |

---

## 5. Edge Case Coverage

| Edge case (from PRD §15.1 or implicit) | Current handling | Verdict |
|---|---|---|
| French diacritics in selection (`é`, `è`, `ê`, ligatures) | No NFC normalization anywhere | ❌ Not handled (see O1) |
| Selection length out of range | Hard-coded 2–80 char bounds in `handleMouseUp` | ✅ Reasonable |
| Generating a task with **no** collected vocab (whole-document flow) | Server action accepts empty `vocabWords[]`; AI prompt conditionally omits the line | ✅ Handled |
| Task generation OpenAI failure | Error message rendered above the article: "Failed to generate task. Check your API key in Settings." | ✅ Handled |
| Word lookup OpenAI failure | Popover silently closes | ❌ Not handled (see O5) |
| Submit below minimum word count | Warning shown, submission still allowed | ✅ Matches PRD intent |
| Submit with empty text | Button disabled until `text.trim()` non-empty | ✅ Handled |
| Document deletion with existing reading sessions | `reading_sessions` cascades on document delete — vocab lookup history is lost | ⚠️ PRD doesn't specify, but this *does* permanently delete data without warning. The delete dialog only says "permanently removed from your library" — doesn't surface that vocab history dies too. |
| Document deletion with existing writing tasks/submissions | `writing_tasks.document_id` → NULL; `submissions` and `errors` preserved | ✅ Matches §9.3 |
| Duplicate vocabulary save (same word twice) | Server action dedupes by lowercase word | ✅ Handled |
| Concurrent reading sessions (same document open in two tabs) | Two `reading_sessions` rows created; both write to the same `documents.readingProgress`; whoever flushes last wins | ⚠️ PRD doesn't address. Personal-use tool, low probability. |
| Source URL with whitespace / invalid format | Zod `.url()` validator catches it; field is optional | ✅ Handled |
| Empty document content (or <20 chars) | Zod `.min(20)` rejects | ✅ Handled |
| Selection inside the popover (preventing re-trigger) | Mousedown `preventDefault`, popover-ref check in handler | ✅ Handled |
| Reading progress with a single very long paragraph | `threshold: 0.5` means progress jumps to 100% only when half visible; for a 10k-word single `<p>` it's binary | ⚠️ Minor — PRD doesn't specify granularity. |

---

## 6. Recommendations for Next Sprint

Ordered by risk × cost-to-fix. The "M" / "L" tags match the deviation risk levels above.

| # | Item | Risk | Effort | Why now |
|---|---|---|---|---|
| 1 | **Add LLM-based CEFR estimator at document creation** (D3) | M | S | This is the only deviation that silently corrupts downstream behaviour — `docLevel` flows into every task-generation prompt. Add before S4 so feedback also gets the right level. |
| 2 | **Reconcile PRD §12.1 + CLAUDE.md with the SQLite → Postgres switch** (D6) | M | XS | One PRD changelog entry + one CLAUDE.md section edit. Cheapest, highest-leverage fix — protects future agents (and your future self) from acting on stale strong-decisions. |
| 3 | **Title + content search in Library** (D1) | M | S | One `or()` clause. Trivial, restores a documented S2 capability. |
| 4 | **Add NFC normalization to selected text** (O1) | M | XS | One `.normalize("NFC")` line in the popover. Also normalize on the server side before sending to OpenAI. Cheap insurance before S4 spans become character-position-sensitive. |
| 5 | **Wire the Continue Reading "Generate Writing Task" CTA** (D2) | L | S | Trivial; closes a visibly stale "Coming in S3" tooltip on the most-trafficked page. |
| 6 | **Surface lookup failures in UI** (O5) | L | XS | Replace the silent `catch` with a one-line error state in the popover. |
| 7 | **Validate AI `target_words` is a subset of supplied vocab** (O7) | L | S | Defence in depth before S4. Reject task if mismatch and re-prompt, or silently filter. |
| 8 | **Decide on Settings API-key config UX** (D5) | L | M | Either accept the deviation in the PRD changelog ("self-use, .env is the source of truth") or add the in-app form. The decision matters more than the implementation. |
| 9 | **Flush reading-session duration on `visibilitychange` / `pagehide`** (O6) | L | S | Important for §14.2 reading-time metric to be meaningful when you start using it. |
| 10 | **Fix "Looked up" stat in session sidebar** (D4) | L | XS | Either track lookup count or rename the label. |
| 11 | **Add lookup-result memoisation** (O2) | L | S | Optional until OpenAI costs become a real concern. Listed because PRD called it out as a mitigation. |

### PRD NEEDS CLARIFICATION

- **§7.5 “OpenAI API-key configuration + balance test”**: it is ambiguous what “balance test” entails for v0.1 self-use. Live `/v1/usage` poll? One-time check? A simple “key is valid” call? The current implementation interprets it as the last; PRD intent is unclear.
- **§7.1.2 “the error-count chip is a reverse entry point”**: the chip should link to “the Progress page filtered to all errors for this document (S6).” Confirm this is the intended deep-link signature (`/progress?documentId=...`) before S6 work begins.
- **§9.3 “foreign-key cascades”** lists submission→errors cascade and document→writing_tasks set-null, but does not say what happens to `reading_sessions` when a document is deleted. Current implementation cascades (data is destroyed). Confirm intent.
- **§7.3.3 “based on words collected during this session”**: does the AI have permission to drop some collected words, or must `target_words` always equal the full collected list when ≤5? The current AI prompt says “use all of them if ≤5” but no validation enforces this. Pin down before learner-profile-driven generation in S7.
