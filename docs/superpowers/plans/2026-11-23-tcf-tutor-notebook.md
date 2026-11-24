# TCF Tutor Chat + Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passive TCF answer reveal with a collapsed explanation and a streaming tutor chat whose answers can be added to a notebook, and review those notebook cards together with due vocabulary from Today.

**Architecture:** Three new tables (`tcf_tutor_messages`, `tcf_notes`, `tcf_note_reviews`) and a `tutor` vocabulary-gap source. A route handler streams gpt-4o answers as NDJSON. Server actions in one new file propose, add and review cards. All rules that can be pure (Leitner, gap upsert, prompt building, proposal and review validation, the Today review activity) live in small pure modules with `node:test` tests. UI work is a shared answer-details block plus a tutor panel used by both `DrillRunner` and `ExamRunner`, and a combined review session page that runs the existing `GapReviewRunner` and then a new notebook runner.

**Tech Stack:** Next.js 16.2.4 (route handler streaming via Web Streams, per `node_modules/next/dist/docs/01-app/02-guides/streaming.md` §"Streaming in Route Handlers"), React 19, Drizzle + postgres.js, OpenAI SDK 6 (`chat.completions.create({ stream: true })`, `chat.completions.parse` + `zodResponseFormat`), Zod 3, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-tcf-tutor-notebook-design.md`

## Global Constraints

- Work on branch `feat/tcf-tutor-notebook`, never on `main`.
- Commit messages are plain conventional commits. **No `Co-Authored-By` and no `Generated with Claude Code` lines** (CLAUDE.md overrides any default).
- New tables: `uuid("id").primaryKey().defaultRandom()`, timestamps `{ withTimezone: true }`, `user_id uuid not null → users.id`.
- Every export of `src/lib/actions/tcf-notebook.ts` calls `requireFeature("tcf")`, except `getDueNotebookCount`, which is a summary read using `canUse(user.access, "tcf")` and returns 0 without access.
- OpenAI buckets: the tutor answer uses `getOpenAI("tutor")`; card proposal, review generation and the vocabulary look-up use `getOpenAI("lookup")`. `AI_DAILY_LIMITS.tutor = 40`.
- Models: `MODELS.tutor = process.env.OPENAI_MODEL_TUTOR ?? "gpt-4o"`; the proposal and review calls use `MODELS.lookup`.
- Actions that call AI and write or swallow failures call `assertAiBudget("lookup")` before any write: `proposeTutorCard`, `addTutorCard`, `generateNotebookReview`.
- Errors shown to users are `UserFacingError`; client code shows `userErrorMessage(err, fallback)`, or `USER_ERROR_MESSAGES[code]` for the route's JSON errors.
- The tutor's answer limit is `max_tokens: 500`. The route sets `export const maxDuration = 60`.
- Thread resent to the model: last `THREAD_RESEND_LIMIT = 12` messages. Existing notes sent to the proposal call: at most `PROPOSAL_NOTE_LIMIT = 200`. Notes in the tutor context: at most 8.
- Review session caps: 20 words (the existing `getDueGapCards` default) and 15 notebook cards (`NOTEBOOK_REVIEW_LIMIT = 15`).
- Copy. The TCF screens are in French:
  - "Voir l'explication" / "Masquer l'explication"
  - "Posez votre question…"
  - "Ajouter au carnet ?" with "Ignorer" / "Ajouter" / "Modifier"
  - "Ajouté au carnet · {point}"
  - "Déjà dans le carnet · {point}" with "Revoir à nouveau", then "Remis en révision · {point}"
  - "Réponse interrompue — réessayer"
  - "Retirer du carnet"
  - "Je savais" / "Je ne savais pas"
  - "Question source"

  Today, `/review` and `/review/session` are in English: "Review due vocabulary", "Review notebook and words", "Review session".
- Tests, fixtures, logs and commit content never contain real exam text (passages, transcripts, explanations). Use invented sentences.
- `npm run db:init` applies migrations to the shared Azure database that production uses. Run it **only after the user says yes in chat**.

## Review Focus

1. **A guest or non-TCF member opens Today or `/review/session`.** Expected: a words-only session titled "Review due vocabulary", and no call to any `tcf-notebook` action (each would throw `FEATURE_LOCKED`). Pinned by `reviewActivity` tests (Task 9) and a guest run (Task 10).
2. **Add is double-clicked, or retried after a timeout.** Expected: exactly one note per tutor answer. Pinned by the unique index `(user_id, source_message_id)` (Task 1) and the `onConflictDoNothing` path in `addTutorCard` (Task 5), and checked in the Task 10 run.
3. **The learner moves to another question while an answer is still streaming.** Expected: the stream is aborted, nothing is saved, and no text appears in the next question's panel. Pinned by `key={q.id}` on `TutorPanel` with an `AbortController`, and the route's `request.signal.aborted` check before saving (Tasks 4 and 7). Checked in the Task 10 run.
4. **An image-only reading question (tests 1–38) has no explanation, in dev without R2.** Expected: the image is sent (a data URL in dev, a signed URL in prod). With no text and no image, the tutor says it cannot see the text instead of inventing it. Pinned by `buildTutorMessages` tests (Task 3) and a run (Task 10).
5. **Review generation returns malformed items or fails.** Malformed means 3 options, duplicate options, `answer: 4`, or a hearing item without `spoken`. Expected: only that card falls back to self-grading, and the session never blocks. Pinned by `validateReviewItem` tests (Task 3) and the all-`null` fallback in `generateNotebookReview` (Task 8).

---

### Task 1: Schema, migration and comprehension tags

**Files:**
- Modify: `src/lib/db/schema.ts` (after `vocabularyReviewAttempts` ~l.549 for the enum change, and after `tcfQuestionAttempts` ~l.908 for the new tables)
- Create: `drizzle/00NN_tcf_tutor_notebook.sql` (generated)
- Create: `src/lib/tcf/tags.ts`, `src/lib/tcf/tags.test.ts`
- Modify: `src/lib/account/owned-tables.test.ts:30`
- Commit also: `docs/superpowers/specs/2026-11-23-tcf-tutor-notebook-design.md`, this plan

**Interfaces:**
- Produces from `schema.ts`:
  - `tcfTutorRoleEnum` (`user`, `assistant`)
  - `tcfNoteKindEnum` (`vocabulary`, `grammar`, `hearing`, `comprehension`)
  - `tcfNoteStatusEnum` (`active`, `mastered`, `dismissed`)
  - `tcfTutorMessages`, `tcfNotes`, `tcfNoteReviews`
  - `type TcfNoteKind`, `type TcfNoteStatus`, `type TcfGeneratedReviewItem = { stem: string; options: string[]; answer: number; spoken: string | null }`
  - `vocabGapSourceEnum` gains `"tutor"`
- Produces from `tags.ts`:
  - `COMPREHENSION_TAGS: Record<ComprehensionTag, { label: string; prompt: string }>`
  - `type ComprehensionTag`
  - `COMPREHENSION_TAG_IDS: readonly ComprehensionTag[]`
  - `isComprehensionTag(v: unknown): v is ComprehensionTag`

- [ ] **Step 1: Create the branch**

Run: `git switch -c feat/tcf-tutor-notebook`

- [ ] **Step 2: Write the failing tests**

`src/lib/tcf/tags.test.ts`:
```ts
test("the seven comprehension tags of the 2026-07-06 spec, in order", () => {
  assert.deepEqual([...COMPREHENSION_TAG_IDS], ["vocab", "syntax", "inference", "detail", "connectors", "numbers_time", "register_intent"]);
});
test("isComprehensionTag accepts ids only", () => {
  assert.equal(isComprehensionTag("inference"), true);
  assert.equal(isComprehensionTag("grammar"), false);
  assert.equal(isComprehensionTag(null), false);
});
```
In `owned-tables.test.ts`, add `"tcf_tutor_messages", "tcf_notes", "tcf_note_reviews"` to the "covers personal data" list.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/tcf/tags.test.ts src/lib/account/owned-tables.test.ts`
Expected: FAIL, because `tags.ts` does not exist and `tcf_notes` is not owned.

- [ ] **Step 4: Implement `tags.ts` and the schema**

`tags.ts`: English `label` and a one-line `prompt` per tag, taken from the 2026-07-06 spec §3.3 table.

Schema:
- **`tcf_tutor_messages`:**
  - `id`
  - `user_id`
  - `question_id` (not null) → `tcfQuestions.id`, **on delete cascade**
  - `role` (`tcf_tutor_role`)
  - `content` text (not null)
  - `created_at`
  - index `tcf_tutor_messages_user_question_time` on (user_id, question_id, created_at)
- **`tcf_notes`:**
  - `id`
  - `user_id`
  - `kind`
  - `lemma` text (null)
  - `by_ear` boolean (not null, default false)
  - `vocabulary_gap_id` → `vocabularyGaps.id`, **set null**
  - `comprehension_tag` text (null)
  - `point`, `front`, `back`: text (not null)
  - `source_question_id` → `tcfQuestions.id`, **set null**
  - `source_locator` text (null)
  - `source_message_id` → `tcfTutorMessages.id`, **set null**
  - `status` (default `active`)
  - `box` int (not null, default 1)
  - `due_at` tz (not null, defaultNow)
  - `last_reviewed_at` tz (null)
  - `created_at`
  - index `tcf_notes_user_status_due` on (user_id, status, due_at)
  - `uniqueIndex("tcf_notes_user_source_message")` on (user_id, source_message_id)
- **`tcf_note_reviews`:**
  - `id`
  - `user_id`
  - `note_id` (not null) → `tcfNotes.id`, **cascade**
  - `generated` jsonb `$type<TcfGeneratedReviewItem | null>()`
  - `chosen` int (null)
  - `correct` boolean (not null)
  - `box_before`, `box_after`: int (not null)
  - `created_at`
  - index (user_id, created_at)

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx tsx --test src/lib/tcf/tags.test.ts src/lib/account/owned-tables.test.ts`
Expected: PASS. The delete-order test must also pass, which means the new foreign keys form no cycle.

- [ ] **Step 6: Generate the migration and read it**

Run: `npx drizzle-kit generate --name tcf_tutor_notebook`

Expected SQL:
- three `CREATE TYPE`
- `ALTER TYPE "public"."vocab_gap_source" ADD VALUE 'tutor'`
- three `CREATE TABLE` with their foreign keys and indexes
- **no `DROP` and no `ALTER` on other tables**

If anything else appears, stop and fix the schema.

- [ ] **Step 7: Ask the user before migrating the shared database**

Ask in chat: "Apply migration 00NN (3 new tables + `tutor` gap source) to the shared Azure database with `npm run db:init`?"

On yes, run `npm run db:init` and then `npm run sample:check`. Expected: `✓ Database is up to date.`, and the sample check passes.

- [ ] **Step 8: Typecheck, lint and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.
```bash
git add src/lib/db/schema.ts drizzle/ src/lib/tcf/tags.ts src/lib/tcf/tags.test.ts src/lib/account/owned-tables.test.ts docs/superpowers/specs/2026-11-23-tcf-tutor-notebook-design.md docs/superpowers/plans/2026-11-23-tcf-tutor-notebook.md
git commit -m "feat(tcf): notebook and tutor tables, comprehension tags"
```

---

### Task 2: Vocabulary side — `tutor` gap source and a parametrised look-up path

**Files:**
- Create: `src/lib/vocabulary/leitner.ts`, `src/lib/vocabulary/leitner.test.ts`
- Modify: `src/lib/vocabulary/gaps.ts:15-72, 113-130`
- Create: `src/lib/vocabulary/resolve-lookup.ts`
- Modify: `src/lib/actions/vocabulary.ts:23-118` (move the body, keep the export)
- Modify: `src/lib/vocabulary/types.ts` (move `LookupOutcome` here; `vocabulary.ts` re-exports it)

**Interfaces:**
- Produces from `leitner.ts` (pure, no imports from db or server-only):
  - `LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const`. `gaps.ts` re-exports it.
  - `leitnerAfter(box: number, correct: boolean, now: Date): { box: number; status: "active" | "mastered"; dueAt: Date | null }`. Here `dueAt: null` means "keep the current value" when the card becomes mastered.
  - `type GapSource = "lookup" | "feedback" | "manual" | "tutor"`
  - `gapUpsertAction(status: "active" | "mastered" | "dismissed" | null, source: GapSource): "insert" | "refresh-source" | "reset" | "noop"`
- Produces from `resolve-lookup.ts` (`import "server-only"`):
  - `type GapSignal = { gapType: VocabGapType; source: GapSource }`
  - `resolveLookupForUser(user: AuthenticatedUser, surface: string, sentenceContext: string, source: LookupSource, gap?: GapSignal): Promise<LookupOutcome>`. `gap` defaults to `{ gapType: "recognition", source: "lookup" }`, and is used by both the cache-hit and the persist branch.
- `upsertGap` keeps its signature; its `source` becomes `GapSource`.

- [ ] **Step 1: Write the failing tests** (`leitner.test.ts`, with `now = new Date("2026-11-23T12:00:00Z")`)
```ts
test("correct moves up one box and waits that box's interval", () => {
  assert.deepEqual(leitnerAfter(1, true, now), { box: 2, status: "active", dueAt: new Date("2026-11-25T12:00:00Z") });
});
test("correct in box 5 masters the card", () => assert.deepEqual(leitnerAfter(5, true, now), { box: 5, status: "mastered", dueAt: null }));
test("wrong returns to box 1, due tomorrow", () => assert.deepEqual(leitnerAfter(3, false, now), { box: 1, status: "active", dueAt: new Date("2026-11-24T12:00:00Z") }));
test("gap upsert rules", () => {
  assert.equal(gapUpsertAction(null, "lookup"), "insert");
  assert.equal(gapUpsertAction("active", "lookup"), "refresh-source");
  assert.equal(gapUpsertAction("active", "tutor"), "reset");
  assert.equal(gapUpsertAction("mastered", "feedback"), "reset");
  assert.equal(gapUpsertAction("dismissed", "lookup"), "noop");
  assert.equal(gapUpsertAction("dismissed", "manual"), "reset");
  assert.equal(gapUpsertAction("dismissed", "tutor"), "reset");
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/vocabulary/leitner.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement `leitner.ts`, then rewire `gaps.ts`**

`upsertGap` switches on `gapUpsertAction(existing?.status ?? null, opts.source)`. `reset` sets `{ status: "active", box: 1, dueAt: new Date(), source }`. `gradeGapInTransaction` uses `leitnerAfter(row.box, correct, new Date())`, with `dueAt ?? row.dueAt`. Behaviour for the existing sources must stay identical.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx tsx --test src/lib/vocabulary/leitner.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the look-up core into `resolve-lookup.ts`**

The following move unchanged, except that the gap is parametrised:
- `persistLookup`
- the cache-hit branch
- the guest sample branch
- the cache-miss branch
- `SAMPLE_LOOKUPS`

`resolveLookup` in `vocabulary.ts` becomes `requireUser()` → `assertLookupSource(user.id, source)` → `resolveLookupForUser(user, surface, sentenceContext, source)`. `markTcfVocabGap` is left as it is (out of scope).

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. The look-up popover is exercised in the Task 10 run.

- [ ] **Step 7: Commit**
```bash
git add src/lib/vocabulary/ src/lib/actions/vocabulary.ts
git commit -m "feat(vocabulary): tutor gap source and a look-up path with a chosen gap"
```

---

### Task 3: Tutor AI layer — prompts, schemas, calls

**Files:**
- Modify: `src/lib/access/limits.ts:12-20` (add `tutor: 40` and its comment line), `src/lib/ai/client.ts:29-38` (add `tutor`)
- Create: `src/lib/tcf/notebook/rules.ts`, `src/lib/tcf/notebook/rules.test.ts`
- Create: `src/lib/tcf/tutor/context.ts`, `src/lib/tcf/tutor/context.test.ts`
- Create: `src/lib/tcf/tutor/schemas.ts`, `src/lib/tcf/tutor/schemas.test.ts`
- Create: `src/lib/ai/tutor.ts`

**Interfaces:**
- Consumes `ComprehensionTag`, `COMPREHENSION_TAGS` and `TcfNoteKind` / `TcfGeneratedReviewItem` (Task 1).
- Produces from `rules.ts` (pure):
  - `NOTE_KINDS`
  - `type NoteLine = { id: string; kind: TcfNoteKind; point: string; lemma: string | null; comprehensionTag: string | null; sourceLocator: string | null; createdAt: Date }`
  - `rankNotesForQuestion(notes: NoteLine[], q: { skill: "listening" | "reading"; skillTags: string[] | null }, limit = 8): NoteLine[]`
  - `findVocabularyDuplicate(notes: NoteLine[], lemma: string): NoteLine | null`
  - `notebookCounts(notes: Pick<NoteLine, "kind" | "comprehensionTag">[]): { byKind: Record<TcfNoteKind, number>; byTag: Partial<Record<ComprehensionTag, number>> }`
- Produces from `context.ts` (pure):
  - `THREAD_RESEND_LIMIT = 12`
  - `TUTOR_SYSTEM_PROMPT: string`
  - `type TutorQuestion = { skill: "listening" | "reading"; type: "image" | "spoken_options" | "dialogue" | "reading_mcq"; questionText: string; options: string[]; answer: number; passage: string | null; transcript: string | null; explanation: string | null }`
  - `type TutorTurn = { role: "user" | "assistant"; content: string }`
  - `formatNotebookContext(input: { notes: NoteLine[]; counts: ReturnType<typeof notebookCounts>; accuracy: { correct: number; total: number } | null }): string`
  - `buildTutorMessages(input: { question: TutorQuestion; chosen: number | null; imageUrl: string | null; notebook: string; thread: TutorTurn[]; ask: string }): ChatCompletionMessageParam[]`
- Produces from `schemas.ts` (pure):
  - `ProposalSchema`, `type Proposal`. Every field is required and nullable, as OpenAI structured outputs need: `{ result: "none" | "duplicate" | "card"; duplicate_index: number | null; card: { kind; comprehension_tag; point; front; back; lemma; by_ear; sentence } | null }`.
  - `CardDraftSchema` (Zod) and `type CardDraft = { kind: TcfNoteKind; point: string; front: string; back: string; lemma: string | null; byEar: boolean; comprehensionTag: ComprehensionTag | null; sentence: string | null }`. Limits: point 1–160, front/back 1–400, lemma ≤ 80, sentence ≤ 500.
  - `type CardProposalResult = { type: "none" } | { type: "draft"; draft: CardDraft } | { type: "duplicate"; noteId: string; point: string }`
  - `normalizeProposal(raw: Proposal, existing: NoteLine[]): CardProposalResult`
  - `ReviewBatchSchema` (`{ items: Array<{ index: number; stem: string; options: string[]; answer: number; spoken: string | null }> }`)
  - `validateReviewItem(raw: unknown, kind: TcfNoteKind): TcfGeneratedReviewItem | null`
- Produces from `ai/tutor.ts`:
  - `streamTutorAnswer(messages: ChatCompletionMessageParam[]): Promise<AsyncIterable<string>>`. It uses `getOpenAI("tutor")`, `MODELS.tutor`, `stream: true`, `max_tokens: 500` and `temperature: 0.3`, and yields `delta.content` strings. Budget and guest errors throw before the iterable is returned.
  - `proposeCard(input: { ask: string; answer: string; questionSummary: string; existing: NoteLine[] }): Promise<Proposal>`. It uses `getOpenAI("lookup")` and `parse` with `zodResponseFormat(ProposalSchema, "tutor_card")`, at temperature 0.2. `existing` is listed as `0. [kind] point (lemma)`.
  - `generateReviewItems(cards: Array<{ kind: TcfNoteKind; point: string; front: string; back: string }>): Promise<z.infer<typeof ReviewBatchSchema>>`. It uses `getOpenAI("lookup")` and `zodResponseFormat(ReviewBatchSchema, "notebook_review")`.

- [ ] **Step 1: Write the failing tests** (invented sentences only)

`rules.test.ts`:
- `rankNotesForQuestion` puts a note whose `comprehensionTag` is in `skillTags` first. Next come notes from the same skill, where a locator starting `CO-` counts as listening and `CE-` as reading. Last come the rest, newest first. The result is capped at `limit`.
- `findVocabularyDuplicate(notes, " Manquer ")` finds a vocabulary note with lemma `manquer`, using NFC, trim and lowercase. It ignores non-vocabulary notes.
- `notebookCounts` counts by kind and by tag.

`context.test.ts`:
- With `answer: 1` and `chosen: 2`, the question message contains `Correct answer: B` and `Learner chose: C`. With `chosen: null`, it contains `Learner revealed the answer without choosing`.
- With a thread of 20 turns, the result is: system, question block, notebook block, the last 12 turns, then `{ role: "user", content: ask }` as the final message.
- With `imageUrl: "data:image/png;base64,AAAA"`, the question message content is an array that includes `{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA", detail: "low" } }`.
- With no passage, transcript, explanation or image, the question block contains `No source text is available`.
- `TUTOR_SYSTEM_PROMPT` contains `Never re-judge the answer key` and `never describe how the recording sounds`.

`schemas.test.ts`:
- `normalizeProposal` maps `result: "none"` to `{ type: "none" }`.
- `duplicate` with a valid `duplicate_index` becomes `{ type: "duplicate", noteId, point }` from `existing[index]`. An out-of-range index becomes `none`.
- A vocabulary card without a lemma becomes `none`. A vocabulary card whose lemma matches an existing vocabulary note becomes `duplicate` with that note.
- A grammar card has `lemma`, `byEar` and `sentence` cleared. An empty `point` becomes `none`.
- `validateReviewItem` accepts 4 distinct non-empty options with `answer` 0–3. It rejects 3 options, duplicate options compared case-insensitively, `answer: 4`, and an empty stem. For kind `hearing` it requires a non-empty `spoken`; for other kinds `spoken` becomes `null`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/tcf/notebook/rules.test.ts src/lib/tcf/tutor/context.test.ts src/lib/tcf/tutor/schemas.test.ts`
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement `rules.ts`, `context.ts` and `schemas.ts`**

`TUTOR_SYSTEM_PROMPT` must state these points:
- The stored answer is correct. Explain it; never re-judge the answer key.
- Answer in the language the learner wrote in, and keep French quotations in French.
- Answer only what was asked, in about 200 words or fewer.
- For listening, never describe how the recording sounds (no phoneme or liaison claims). General listening advice is fine.
- If no source text or image is available, say so instead of guessing.

The question block lists the skill, type, question, options `A.`–`D.`, the correct letter, the learner's choice, the passage or transcript, and the explanation markdown when present.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Add `tutor` to the limits and models, and write `ai/tutor.ts`**

The prompt wording is the builder's choice. The proposal prompt must say:
- Return `none` when the exchange taught nothing testable ("thanks", "repeat that").
- Use `duplicate` when the point is already in the numbered list.
- Define the four kinds and the seven tags, from `COMPREHENSION_TAGS`.
- `front` asks the point and `back` answers it.
- For vocabulary, `lemma` is the dictionary form and `sentence` is the sentence it appeared in.

The review prompt must say:
- One item per card, `index` matching the input order.
- Use a **new** French sentence, never the source question's sentence.
- 4 options and one answer.
- Hearing items carry a `spoken` sentence, and the stem asks what was heard.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. The "every OpenAI call names its budget bucket" test must still pass.
```bash
git add src/lib/access/limits.ts src/lib/ai/client.ts src/lib/ai/tutor.ts src/lib/tcf/notebook/ src/lib/tcf/tutor/
git commit -m "feat(tcf): tutor prompt, card proposal and review item schemas"
```

---

### Task 4: Streaming tutor route

**Files:**
- Create: `src/lib/tcf/tutor/ndjson.ts`, `src/lib/tcf/tutor/ndjson.test.ts`
- Create: `src/lib/tcf/tutor/question-image.ts`
- Create: `src/lib/tcf/notebook/queries.ts`
- Create: `src/app/api/tcf/tutor/route.ts`
- Modify: `src/lib/access/guard-coverage.test.ts:55-71` (GATED_FILES)
- Modify: `CLAUDE.md` (route-handler list under Data flow; `OPENAI_MODEL_TUTOR` under Environment variables; the Database section's table count and TCF group)

**Interfaces:**
- Consumes `buildTutorMessages`, `formatNotebookContext`, `rankNotesForQuestion`, `notebookCounts`, `streamTutorAnswer` and `explanationLocatorLabel` (`src/lib/tcf/parse-explanation.ts:252`).
- Produces from `ndjson.ts` (pure):
  - `type TutorStreamEvent = { type: "delta"; text: string } | { type: "done"; messageId: string } | { type: "error" }`
  - `encodeEvent(e: TutorStreamEvent): string`, which ends with `\n`
  - `parseEvents(buffer: string): { events: TutorStreamEvent[]; rest: string }`
- Produces from `question-image.ts` (server-only): `questionImageInput(imagePath: string): Promise<string | null>`. It calls `getPrivateMediaUrl(imagePath)`. If that returns a path starting with `/` (dev without R2), it reads `public${imagePath}` and returns `data:image/<ext>;base64,…`. A missing file returns `null`.
- Produces from `queries.ts` (server-only):
  - `listNoteLines(userId: string, limit: number): Promise<NoteLine[]>`: statuses `active` and `mastered`, newest first
  - `loadNotebookContext(userId: string, q: { skill: "listening" | "reading"; skillTags: string[] | null }): Promise<string>`: counts, accuracy over the last 30 days of `tcf_note_reviews`, and 8 ranked notes
  - `countDueNotes(userId: string, now: Date): Promise<number>`: active, not vocabulary, `due_at <= now`
  - `countActiveNotes(userId: string): Promise<number>`: active, not vocabulary
- Route `POST /api/tcf/tutor`:
  - Body: `{ questionId: string (uuid); chosen: number | null; ask: string }`
  - Success response: `application/x-ndjson` stream of `TutorStreamEvent`
  - Errors: JSON `{ code: UserErrorCode }` with 401/403/429, or `{ error: string }` with 400/404/502

- [ ] **Step 1: Write the failing test** (`ndjson.test.ts`)
```ts
test("round trip", () => {
  const line = encodeEvent({ type: "delta", text: "Tu me manques\n— «ok»" });
  assert.deepEqual(parseEvents(line), { events: [{ type: "delta", text: "Tu me manques\n— «ok»" }], rest: "" });
});
test("a chunk split mid-line keeps the tail", () => {
  const all = encodeEvent({ type: "delta", text: "a" }) + encodeEvent({ type: "done", messageId: "m1" });
  const cut = all.length - 5;
  const first = parseEvents(all.slice(0, cut));
  assert.deepEqual(first.events, [{ type: "delta", text: "a" }]);
  assert.deepEqual(parseEvents(first.rest + all.slice(cut)).events, [{ type: "done", messageId: "m1" }]);
});
```
Add to GATED_FILES: `["src/app/api/tcf/tutor/route.ts", \`requireFeature("tcf")\`]`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/tcf/tutor/ndjson.test.ts src/lib/access/guard-coverage.test.ts`
Expected: FAIL (the module and the route file are missing).

- [ ] **Step 3: Implement `ndjson.ts`, `question-image.ts`, `queries.ts` and the route**

Route order:
1. Origin check, as in `src/app/api/speaking/follow-ups/[followUpId]/route.ts:16`.
2. `requireFeature("tcf")` inside a try/catch. On failure return `{ code }` with `authErrorStatus`.
3. Zod-validate the body. `ask` is trimmed, 1–1000 characters. `chosen` is null or an integer within the options.
4. Load the question joined to its set.
5. Load this user's thread for the question, oldest first, keeping the last 12.
6. Run `loadNotebookContext`.
7. Set the image: when `type === "image"`, or `skill === "reading"` and `passage` is null, and `imagePath` is set, call `questionImageInput`.
8. Run `buildTutorMessages`.
9. `await streamTutorAnswer(...)` **before** creating the Response. A `UserFacingError` returns 429 `{ code }`. Anything else returns 502.
10. Build a `ReadableStream` that encodes a `delta` per chunk and accumulates the text.
    - On normal end, when `!request.signal.aborted`: insert the user row and then the assistant row in one transaction (assistant `createdAt` = user `createdAt` + 1 ms), and emit `done` with the assistant id.
    - On a thrown iteration: emit `error` and save nothing.
    - In `cancel()`: stop iterating and save nothing.
11. Response headers: `Content-Type: application/x-ndjson; charset=utf-8` and `Cache-Control: no-store`.

Export `runtime = "nodejs"` and `maxDuration = 60`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx tsx --test src/lib/tcf/tutor/ndjson.test.ts src/lib/access/guard-coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Make a real request**

The dev server is usually already running on :3000; check before starting a preview. Signed in as the member, on any `/tcf/drill` page, run in the browser console:
`await (await fetch("/api/tcf/tutor", { method: "POST", body: JSON.stringify({ questionId: "<id of the question on screen>", chosen: 0, ask: "Pourquoi B ?" }) })).text()`

Expected: several `delta` lines, then one `done` line. `npm run db:studio` shows 2 new `tcf_tutor_messages` rows for that question. Paste the event counts into the task report.

- [ ] **Step 6: Commit**
```bash
git add src/lib/tcf/tutor/ src/lib/tcf/notebook/queries.ts src/app/api/tcf/tutor/ src/lib/access/guard-coverage.test.ts CLAUDE.md
git commit -m "feat(tcf): streaming tutor route"
```

---

### Task 5: Notebook actions — thread, proposal, Add, revive

**Files:**
- Create: `src/lib/actions/tcf-notebook.ts`
- Modify: `src/lib/access/guard-coverage.test.ts` (WHOLE_FILES; AI_BUDGET_EXPORTS)

**Interfaces:**
- Consumes `resolveLookupForUser` and `GapSignal` (Task 2), `upsertGap`, `proposeCard`, `normalizeProposal`, `CardDraftSchema`, `CardProposalResult`, `findVocabularyDuplicate` and `listNoteLines`.
- Produces (all `"use server"`):
  - `type TutorThreadMessage = { id: string; role: "user" | "assistant"; content: string; note: { point: string } | null }`
  - `getTutorThread(questionId: string): Promise<TutorThreadMessage[]>`
  - `proposeTutorCard(messageId: string): Promise<CardProposalResult>`
  - `addTutorCard(messageId: string, draft: CardDraft): Promise<{ noteId: string; point: string }>`
  - `reviveNote(noteId: string): Promise<void>`

- [ ] **Step 1: Register the guards (failing)**

Add to WHOLE_FILES `{ file: "src/lib/actions/tcf-notebook.ts", feature: "tcf", summaryReads: ["getDueNotebookCount"] }`. Add to AI_BUDGET_EXPORTS `["src/lib/actions/tcf-notebook.ts", "proposeTutorCard"]` and `["src/lib/actions/tcf-notebook.ts", "addTutorCard"]`.

Run: `npx tsx --test src/lib/access/guard-coverage.test.ts`
Expected: FAIL (the file is missing).

- [ ] **Step 2: Implement the four actions**

`getTutorThread`: messages for (user, question) oldest first. Left-join notes on `source_message_id` to fill `note`.

`proposeTutorCard`:
1. `requireFeature("tcf")`, then `assertAiBudget("lookup")`.
2. Load the owned assistant message, the latest user message before it, and its question (text, options, correct letter).
3. Load `listNoteLines(user.id, 200)`.
4. `try { normalizeProposal(await proposeCard(...), lines) } catch { console.error; return { type: "none" } }`.

`addTutorCard`:
1. `CardDraftSchema.parse(draft)`, `requireFeature`, `assertAiBudget("lookup")`.
2. Load the owned assistant message and its question with the set. The locator is `explanationLocatorLabel({ skill, test: testNumber, question: orderIndex })`.
3. **Vocabulary:**
   1. If `findVocabularyDuplicate` matches an active or mastered note: `upsertGap({ source: "tutor", … })` on that note's gap and return the existing note.
   2. Otherwise call `resolveLookupForUser(user, lemma, sentence ?? front, { type: "tcf", tcfQuestionId }, { gapType: byEar ? "listening" : "recognition", source: "tutor" })`.
   3. A `locked` outcome throws `new AuthenticationError("FEATURE_LOCKED")`.
   4. Find that gap's id and insert the note with `lemma: outcome.lemma`.
4. **Other kinds:** insert with `box: 1, dueAt: now`.
5. Insert with `.onConflictDoNothing({ target: [tcfNotes.userId, tcfNotes.sourceMessageId] })`. On conflict, select and return the existing note.
6. `revalidatePath("/today")` and `revalidatePath("/review")`.

`reviveNote`:
- A vocabulary note with a gap runs `upsertGap({ userId, lemma: gap.lemma, gapType: gap.gapType, source: "tutor" })`.
- Otherwise set `{ status: "active", box: 1, dueAt: new Date() }`.

- [ ] **Step 3: Run the tests and confirm they pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. The guard-coverage test sees `requireFeature("tcf")` in every export and `assertAiBudget(` in the two AI exports.

- [ ] **Step 4: Commit**
```bash
git add src/lib/actions/tcf-notebook.ts src/lib/access/guard-coverage.test.ts
git commit -m "feat(tcf): tutor thread, card proposal and add-to-notebook actions"
```

---

### Task 6: Collapsed answer reveal in drill and exam

**Files:**
- Create: `src/lib/tcf/reveal.ts`, `src/lib/tcf/reveal.test.ts`
- Modify: `src/app/tcf/_components/verdict-bar.tsx`
- Create: `src/app/tcf/_components/answer-details.tsx` (exports `ExplanationToggle`, `AnswerDetails`)
- Modify: `src/app/tcf/_components/explanation-panel.tsx` (export `TcfMarkdown({ children }: { children: string })`, used by `ExplanationPanel`)
- Modify: `src/app/tcf/_components/drill-runner.tsx:142-178, 270-373`, `src/app/tcf/_components/exam-runner.tsx:294-373`

**Interfaces:**
- Produces from `reveal.ts` (pure):
  - `transcriptPanel(input: { transcript: string | null; explanation: string | null; explanationOpen: boolean }): "raw" | "none"`
  - `hasExplanationDetails(meta: TcfExplanationMeta | null, explanation: string | null): boolean`
- `VerdictBar({ meta, chosen, answer, showKeyPoint }: { meta: TcfExplanationMeta | null; chosen?: number; answer: number; showKeyPoint: boolean })`
- `ExplanationToggle({ open, onToggle }: { open: boolean; onToggle: () => void })`
- `AnswerDetails({ question, skill, explanationOpen, markGaps }: { question: TcfQuestionForDrill; skill: "listening" | "reading"; explanationOpen: boolean; markGaps: boolean })`. It renders the raw transcript per `transcriptPanel` (inside `MarkGapFloater` when `markGaps`), then `ExplanationPanel` when open.

- [ ] **Step 1: Write the failing tests** (`reveal.test.ts`; explanation bodies are invented, `"## Transcript\n- **A:** Bonjour."`)
- No transcript gives `"none"`.
- A transcript with no rewritten section gives `"raw"`, whether open or closed.
- A rewritten section that is closed gives `"raw"`.
- A rewritten section that is open gives `"none"`.
- `hasExplanationDetails(null, null)` is `false`.
- `hasExplanationDetails({ keyPoint: null, options: [null, "x"] }, null)` is `true`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/tcf/reveal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement and wire it up**

Drill:
- Add `explanationOpen` state, reset to `false` in `goTo`.
- `why = showAnswer && explanationOpen ? q.explanationMeta?.options : undefined`.
- After answering, always render `VerdictBar` with `showKeyPoint={explanationOpen}`.
- Show `ExplanationToggle` when `hasExplanationDetails`.
- `AnswerDetails` replaces lines 358–373.

Exam, in the finished state:
- The existing Correct/Incorrect chip stays.
- Render `VerdictBar` only when `explanationOpen && q.explanationMeta`.
- Add the same toggle and `AnswerDetails` with `markGaps={false}`.
- Reset `explanationOpen` when changing question.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx tsx --test src/lib/tcf/reveal.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Check in the browser**

Answer one reading question with an explanation. Expected: only the result line and "Voir l'explication" show. Clicking it shows the key point, the per-option reasons and the explanation.

Open one listening question whose explanation has `## Transcript`. Expected: the raw panel shows while collapsed, and only the rewritten one shows when open.

In a finished exam, the same toggle appears. Take screenshots.

- [ ] **Step 6: Commit**
```bash
git add src/lib/tcf/reveal.ts src/lib/tcf/reveal.test.ts src/app/tcf/_components/
git commit -m "feat(tcf): collapse the explanation behind one toggle after answering"
```

---

### Task 7: Tutor panel and card draft

**Files:**
- Create: `src/app/tcf/_components/tutor-panel.tsx`, `src/app/tcf/_components/card-draft.tsx`
- Modify: `src/app/tcf/_components/drill-runner.tsx` (mount after `AnswerDetails`), `src/app/tcf/_components/exam-runner.tsx` (mount when finished)

**Interfaces:**
- Consumes `parseEvents` / `TutorStreamEvent`, `getTutorThread`, `proposeTutorCard`, `addTutorCard`, `reviveNote`, `CardProposalResult`, `CardDraft`, `TcfMarkdown` and `USER_ERROR_MESSAGES`.
- `TutorPanel({ questionId, chosen }: { questionId: string; chosen: number | null })`. The runners render it with `key={q.id}`: in drill only when `showAnswer`, in exam only when `finished`. `chosen` is `null` after "Afficher réponse" or in an unanswered exam.
- `CardDraft({ messageId, proposal }: { messageId: string; proposal: CardProposalResult })`

- [ ] **Step 1: Implement `TutorPanel`**

1. On mount, load the thread. Each assistant message with a `note` shows "Ajouté au carnet · {point}".
2. A textarea (`rounded-xl`, never the pill radius) with the placeholder "Posez votre question…". Enter sends and Shift+Enter adds a line. It is disabled while streaming.
3. Send: `fetch("/api/tcf/tutor", { method: "POST", signal })`, with the `AbortController` aborted on unmount. A non-2xx JSON with `code` shows `USER_ERROR_MESSAGES[code]`. Read with `getReader()` and feed a `TextDecoder` into `parseEvents`.
4. Render the streaming text with `TcfMarkdown`.
5. On `done`, keep the message with its id, then call `proposeTutorCard(id)` and render `CardDraft` under it when the result is not `none`.
6. On `error` or a network failure, keep the partial text and show "Réponse interrompue — réessayer". It resends the same ask and drops the partial.

- [ ] **Step 2: Implement `CardDraft`**

States:
- **`draft`:**
  - header "Ajouter au carnet ?" and a kind label (Vocabulaire / Grammaire / Écoute / Compréhension)
  - inline-editable point
  - "Modifier" reveals editable front and back
  - "Ignorer" hides the draft
  - "Ajouter" calls `addTutorCard` and moves to `added`. On failure it keeps the draft and shows `userErrorMessage(err, "Échec — réessayez.")`. The button is disabled while pending.
- **`added`:** "Ajouté au carnet · {point}".
- **`duplicate`:** "Déjà dans le carnet · {point}" with "Ignorer" and "Revoir à nouveau". The latter calls `reviveNote` and shows "Remis en révision · {point}".

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

Then in the browser, on one reading question:
1. Ask a question and watch the stream.
2. A draft appears; Add it; "Ajouté au carnet" shows.
3. Reload the page and return to the question: the thread and its added mark are still there.
4. Ask the same question again: the duplicate prompt appears.

- [ ] **Step 4: Commit**
```bash
git add src/app/tcf/_components/
git commit -m "feat(tcf): tutor panel with add-to-notebook drafts"
```

---

### Task 8: Notebook review actions

**Files:**
- Modify: `src/lib/actions/tcf-notebook.ts`
- Modify: `src/lib/access/guard-coverage.test.ts` (AI_BUDGET_EXPORTS)

**Interfaces:**
- Consumes `leitnerAfter` (Task 2), `generateReviewItems`, `validateReviewItem` and `countDueNotes`.
- Produces:
  - `NOTEBOOK_REVIEW_LIMIT = 15`. Keep it as a non-exported constant in the action file, or export it from `rules.ts`; a `"use server"` file may export only async functions.
  - `type NotebookReviewCard = { noteId: string; kind: Exclude<TcfNoteKind, "vocabulary">; point: string; front: string; back: string; box: number; sourceQuestionId: string | null; sourceLocator: string | null }`
  - `getDueNotebookCards(): Promise<NotebookReviewCard[]>`: active, not vocabulary, `due_at <= now`, `due_at` ascending, limit 15
  - `generateNotebookReview(noteIds: string[]): Promise<Record<string, TcfGeneratedReviewItem | null>>`
  - `gradeNotebookCard(input: { noteId: string; item: TcfGeneratedReviewItem | null; chosen: number | null; selfCorrect: boolean | null }): Promise<{ box: number; status: "active" | "mastered"; correct: boolean }>`
  - `dismissNote(noteId: string): Promise<void>`
  - `getDueNotebookCount(): Promise<number>`: summary read; returns 0 when `canUse(user.access, "tcf") !== true`

- [ ] **Step 1: Register `generateNotebookReview` in AI_BUDGET_EXPORTS (failing)**

Run: `npx tsx --test src/lib/access/guard-coverage.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

`generateNotebookReview`:
1. Accept at most 15 ids.
2. `requireFeature`, then `assertAiBudget("lookup")`.
3. Load the owned, active, non-vocabulary notes.
4. Make one `generateReviewItems` call and map `items[index]` through `validateReviewItem(item, kind)`. If the call throws, log it and return every id → `null`.

`gradeNotebookCard`, in one transaction:
1. Select the note `for update`, owned. It must be `active` with `due_at <= now`; otherwise `throw new Error("Review card is no longer due")`, which also blocks double submits.
2. When `item` is set: if `validateReviewItem(item, kind)` returns null, throw. Otherwise `correct = chosen === item.answer`.
3. When `item` is null: `correct = selfCorrect === true`.
4. Apply `leitnerAfter(box, correct, now)` and update `box`, `status`, `due_at` (keep the old value when null) and `last_reviewed_at`.
5. Insert a `tcf_note_reviews` row.
6. Revalidate `/today` and `/review`.

`dismissNote` sets `status: "dismissed"`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 4: Commit**
```bash
git add src/lib/actions/tcf-notebook.ts src/lib/access/guard-coverage.test.ts
git commit -m "feat(tcf): notebook review generation and grading"
```

---

### Task 9: Combined review session and Today

**Files:**
- Create: `src/hooks/use-speech.ts` (`useTtsSupported(): boolean`, `speakFrench(text: string): void`, moved out of `gap-review-runner.tsx:16-25, 52-58`)
- Modify: `src/app/(main)/vocabulary/review/_components/gap-review-runner.tsx`. It imports the hook and gains `onDone?: (summary: { right: number; wrong: number; promoted: number }) => void`. When `onDone` is set, it calls it once on finishing, or immediately when `initialCards` is empty, instead of rendering its own end or empty state.
- Create: `src/app/(main)/review/session/page.tsx`, `src/app/(main)/review/session/_components/review-session.tsx`, `src/app/(main)/review/session/_components/notebook-review-runner.tsx`
- Create: `src/lib/today/review-activity.ts`, `src/lib/today/review-activity.test.ts`
- Modify: `src/lib/today/recommendation.ts`, `src/lib/today/recommendation.test.ts`, `src/lib/actions/today.ts:69, 98-108, 139, 172, 179`
- Modify: `src/app/(main)/review/page.tsx:14-23` (a "Review session" item first)
- Modify: `docs/roadmap.md` (one line at the end of "Review center and study plans")

**Interfaces:**
- `TodayActivityKey` becomes `"notebook" | "tcf-listening" | "tcf-reading" | "writing" | "conjugation"`. `"vocabulary"` is removed.
- `RecommendationSignals` gains `dueNotebook: number`. `recommendActivity` returns `"notebook"` when `dueVocabulary + dueNotebook > 0`.
- `reviewActivity(input: { canTcf: boolean; dueWords: number; dueNotes: number; activeNotes: number }): { key: "notebook"; title: string; detail: string; href: string; cta: string; estimatedMinutes: number; done: boolean; progress?: { done: number; target: number } }` (pure)
- `NotebookReviewRunner({ cards, items, onDone }: { cards: NotebookReviewCard[]; items: Record<string, TcfGeneratedReviewItem | null> | "pending"; onDone: () => void })`

- [ ] **Step 1: Write the failing tests**

`review-activity.test.ts`:
- `{ canTcf: false, dueWords: 3, dueNotes: 5, activeNotes: 9 }` gives:
  - title `"Review due vocabulary"`
  - detail `"3 words are due for review now."`
  - href `"/review/session"`
  - progress `{ done: 0, target: 3 }`
- `{ canTcf: true, dueWords: 1, dueNotes: 0, activeNotes: 0 }` gives title `"Review due vocabulary"` and detail `"1 word is due for review now."`.
- `{ canTcf: true, dueWords: 2, dueNotes: 4, activeNotes: 6 }` gives:
  - title `"Review notebook and words"`
  - detail `"2 words and 4 notebook cards are due now."`
  - progress target 6
- `{ canTcf: true, dueWords: 0, dueNotes: 0, activeNotes: 6 }` gives:
  - done `true`
  - href `"/vocabulary"`
  - cta `"View vocabulary"`
  - detail `"Nothing is due right now."`

`recommendation.test.ts`:
- Replace `"vocabulary"` with `"notebook"`.
- Add: `{ ...base, dueNotebook: 2 }` gives `"notebook"`.
- `base` gains `dueNotebook: 0`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx tsx --test src/lib/today/review-activity.test.ts src/lib/today/recommendation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`today.ts`:
- If `canUse(user.access, "tcf") === true`, also query `countDueNotes` and `countActiveNotes`; otherwise both are 0.
- `reviewActivity(...)` replaces the vocabulary activity.
- `recommendActivity` receives `dueNotebook`.
- The CTA is `"Start review"` when anything is due.

Session page (server):
1. `requireUser()`; `canTcf = canUse(access, "tcf") === true`.
2. `[words, notes] = await Promise.all([getDueGapCards(), canTcf ? getDueNotebookCards() : []])`. **Never call a `tcf-notebook` action without `canTcf`.**
3. The h1 is "Review notebook and words" when `notes.length > 0`, else "Review due vocabulary".

`ReviewSession`:
1. Phases: `words`, then `notes`, then `done`.
2. On mount with `notes.length > 0`, start `generateNotebookReview(ids)` and store the result. On rejection, set every id to `null`.
3. In `words`, render `GapReviewRunner` with `onDone` going to `notes`, or to `done` when there are no notes.
4. In `notes`, render `NotebookReviewRunner`. While `items === "pending"`, show a spinner with "Preparing notebook questions…".
5. In `done`, show "Done for now" and a link to `/today`.

`NotebookReviewRunner`, per card:
- **With an item:**
  - A `hearing` card speaks `item.spoken` on show (with a replay button), and the spoken text is hidden until answered.
  - Show the stem and the A–D options. A–D keys work.
  - On answer, `gradeNotebookCard`, then show correct or incorrect, the card's `back`, and "Question source" → `/tcf/review?q={sourceQuestionId}` when present.
- **Without an item:** show the front, then "Afficher la réponse", then the back with "Je savais" / "Je ne savais pas".
- "Retirer du carnet" calls `dismissNote` and moves to the next card.
- A save error shows a retry.

The `/review` page gets a first item, "Review session", whose count is due words plus `getDueNotebookCount()`, linking to `/review/session`.

Roadmap line: "2026-11 — The TCF notebook (`tcf_notes`) adds a third review queue next to TCF question review and vocabulary Leitner. It was added deliberately during the freeze and is the easiest queue to fold into unified review state if the freeze is lifted."

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/use-speech.ts "src/app/(main)/vocabulary/review/_components/gap-review-runner.tsx" "src/app/(main)/review/" src/lib/today/ src/lib/actions/today.ts docs/roadmap.md
git commit -m "feat(today): one review session for due words and notebook cards"
```

---

### Task 10: End-to-end verification over real data (spec §8)

No new files are committed. A throwaway script that reads counts from the database lives outside the repo, in the session scratchpad.

- [ ] **Step 1: Static checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. Paste the test summary line.

- [ ] **Step 2: Tutor run, as the member, in the dev server**

Run these:
- 2 reading questions with explanations, including one answered wrong where the learner asks "pourquoi pas C ?". Expected: the tutor explains the key and does not side with C.
- 1 image-only reading question without an explanation (tests 1–38).
- 2 listening dialogue questions. Ask once in Chinese and check that the answer is in Chinese. Check that no answer makes a phoneme-level claim.
- 1 question from finished exam results.

Also:
- During a running exam, confirm that no tutor panel is shown.
- Press "Suivant" mid-stream and check that no message is saved for that turn.
- Double-click "Ajouter" and check that one note exists.

Report as a table: turns asked / streams completed / cards proposed / Added / Skipped / duplicates offered / notes in the DB.

- [ ] **Step 3: Review run**

Open Today and check that the activity reads "Review notebook and words" with both counts. Start it: words first, then notebook cards.

Report: generated / fell back / answered / correct. Then read back from the database each reviewed note's `box`, `status` and `due_at`, and each `tcf_note_reviews` row.

- [ ] **Step 4: Guest run**

Use the one-click guest from the landing page. On Today, the activity is "Review due vocabulary". `/review/session` runs the sample words, with no console or server error and no notebook request in the network log.

- [ ] **Step 5: Look-up regression**

Look up one word in a library document. The popover works, and the user's gap for it stays a single `recognition` / `lookup` row.

- [ ] **Step 6: Privacy check of the branch**

Run: `git diff main --stat && git diff main | grep -nE "transcript|passage" | head -40`

Read every hit. There must be no real exam sentences in code, tests, fixtures or docs. Report "checked, none found", or fix and amend.
