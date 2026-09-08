# Vocabulary Memory — Design Spec

> Cross-surface word-memory feature for Lumière. Select a word anywhere (reading
> article **or** TCF question/option), look it up via AI, persist it to one
> unified vocabulary library, and prefer the library on future lookups. Library
> entries link back to the exact questions/documents where the word appeared —
> those links are visible **only** in the library.
>
> Related: `verb_schema_spec.md` (the rich entry schema this builds on),
> `docs/archive/plans/TCF-Listening-Plan.md`, `docs/archive/PRD-v0.2.md`.
> Designed cold-start executable — does not depend on chat context.

---

## 0. Scope

**In scope:**
- Generalise the existing reading word-lookup so the same selection → popover
  flow works inside the TCF drill page, on **both** question text and option text.
- **Cache-first** lookups: a selected word is resolved against the library before
  any AI call. Inflected forms (fait / faisait / faire) resolve to one lemma entry.
- **Two-tier data model**: a lightweight flat lookup on selection; a rich
  upgrade (full `verb_schema_spec.md` entry) generated when the user saves a word.
- One **unified** library shared by reading and TCF.
- A new top-level **Vocabulary** page that shows entries, the rich verb data
  (level-gated per `verb_schema_spec.md` §6), and clickable **source links** back
  to the originating TCF question / reading document.

**Out of scope (deferred):**
- Spaced-repetition / review scheduling (`reviewCount` already exists; not wired).
- Audio (TTS) on vocabulary entries.
- Non-verb rich schemas beyond what `verb_schema_spec.md` already defines (nouns/
  adjectives use the same top-level shape with `verb: null`).
- Migrating legacy reading-lookup rows (we rebuild the table — see §6).

---

## 1. Existing infrastructure (what we build on)

- **`vocabulary_lookups`** table (`src/lib/db/schema.ts`): currently keyed by
  `word` (unique, NFC-lowercased surface). Flat fields: `pos`, `translation`,
  `cefrLevel`, `inContext`, `examples` (jsonb string[]), `conjugation` (single
  string), `sentenceContext`, single `documentId`/`sessionId`, `savedAt`,
  `reviewCount`.
- **`lookupWord(word, sentenceContext)`** (`src/lib/ai/lookup.ts`): OpenAI
  structured output (Zod) → flat `LookupResult`. **Does not** check any cache.
- **`WordLookupPopover`** (`src/app/(main)/documents/[id]/_components/word-lookup-popover.tsx`):
  `mouseup` selection on a fixed `articleRef`; calls `lookupWord` every time;
  renders a card; Save button → `saveVocabularyWord`.
- **`vocabulary.ts` actions**: `upsertVocabularyLookup`, `saveVocabularyWord`,
  `getSavedWordsByDocument`.
- **Learner level**: `user_settings.cefr_level` via `getCefrLevel()`
  (`src/lib/actions/settings.ts`). Drives the level gate in `verb_schema_spec.md` §6.
- **TCF drill**: `src/app/tcf/_components/drill-runner.tsx` renders question +
  options; `src/app/tcf/drill/page.tsx`; `tcf_questions` table.

---

## 2. Architecture

Three pieces, each independently understandable:

1. **Selection layer (UI)** — a reusable `useTextSelection` hook + a generalised
   `WordLookupPopover` that takes a container ref and a `source` descriptor.
   Mounted by both the reading reader and the TCF drill runner.
2. **Resolution layer (server)** — `resolveLookup(surface, sentenceContext, source)`
   implements cache-first via an alias table, records an occurrence, and returns
   flat content. Tier-2 enrichment (`enrichEntry`) runs on save.
3. **Library layer (UI)** — a new `/vocabulary` page reading the entry + occurrence
   tables, rendering the rich verb view and clickable source links.

### 2.1 Cache-first & the lemma chicken-and-egg

Entries are keyed by **lemma**, but the user selects a **surface** form. To check
the cache we need the lemma; to get the lemma we'd need AI — defeating the cache.

**Resolution: a `surface → lemma` alias table.**

```
select "fait"
  └─ normalize (NFC + lowercase)
  └─ lookup vocabulary_aliases[surface]
       ├─ HIT  → load entry by lemma  → record occurrence → return (0 AI calls)
       └─ MISS → Tier-1 AI (returns lemma=faire + flat content)
                 → upsert entry by lemma (do NOT overwrite richEntry/savedAt/enrichedAt)
                 → insert alias  fait → faire
                 → record occurrence
                 → return
```

After the first encounter of each surface form, every later selection of that
form is a zero-AI cache hit, and fait/faisait/faire all collapse to one entry.

### 2.2 "Link only visible in the library"

Every selection writes a `vocabulary_occurrences` row (which TCF question / which
reading document + the surface and sentence seen). The **popover never reads
occurrences**. Only the `/vocabulary` page renders them, as clickable links.

---

## 3. Data model

One table reshaped, two new tables.

### 3.1 `vocabulary_lookups` (reshape → lemma-keyed entry)

- Rename `word` → **`lemma`** (the dedupe key; NFC-lowercased). Update the ~4 call
  sites that reference `vocabularyLookups.word`.
- `surface` stays — the first-seen surface form (for display).
- **Add** `richEntry jsonb` — the full `FrenchVocabEntry` per `verb_schema_spec.md`
  (verbs get full tense tables / collocations / canada_note; non-verbs use the same
  top-level shape with `verb: null`). `null` until enriched.
- **Add** `enrichedAt timestamp` — `null` = flat only; non-null = rich ready.
- Keep flat columns (`pos`, `translation`, `cefrLevel`, `inContext`, `examples`,
  `conjugation`, `sentenceContext`) for instant popover display.
- **Remove** the single `documentId` / `sessionId` columns — source moves to
  `vocabulary_occurrences`.

### 3.2 `vocabulary_aliases` (new)

```
surface     text       primary key   // NFC + lowercase, e.g. "fait"
lemma       text       not null → vocabulary_lookups.lemma (on delete cascade)
createdAt   timestamp  default now()
```

### 3.3 `vocabulary_occurrences` (new)

```
id              uuid       primary key
lemma           text       not null → vocabulary_lookups.lemma (on delete cascade)
sourceType      enum       "reading" | "tcf"   (vocab_source enum)
documentId      text       null → documents.id      (on delete set null)  // reading
tcfQuestionId   text       null → tcf_questions.id   (on delete cascade)  // tcf
surface         text       not null   // the inflected form selected here
sentenceContext text
createdAt       timestamp  default now()

unique(lemma, sourceType, documentId, tcfQuestionId) NULLS NOT DISTINCT  // one row per word-per-place
```

> Exactly one of `documentId` / `tcfQuestionId` is non-null, determined by
> `sourceType`. The unique index must use **`NULLS NOT DISTINCT`** (Postgres 15+),
> otherwise the always-null column makes every row "distinct" and the dedupe
> silently fails. Drizzle: `uniqueIndex(...).on(...)` with `nullsNotDistinct()`.

### 3.4 Storage choice

`richEntry` is stored as a **single jsonb blob** mirroring `verb_schema_spec.md`
(not normalised into tense tables): one-to-one with the spec, zero schema churn,
and the frontend applies the §6 level gate at render time.

### 3.5 Migration

`npm run db:generate` → `npm run db:init`. Legacy reading-lookup rows are
**not migrated** — they are surface-keyed and re-derivable. Clear
`vocabulary_lookups` and rebuild cleanly under the lemma model (a saved word
returns the next time it is selected). The TCF plan already follows this
"don't migrate" stance for re-derivable data.

---

## 4. AI flow

### 4.1 Tier 1 — `lookupWord` (extend existing)

Add `lemma` to the Zod schema and prompt: "Return the dictionary lemma
(infinitive for verbs, masculine singular for adjectives, singular for nouns)."
Output stays flat: `{ lemma, pos, level, translation, conjugation, in_context, examples }`.

### 4.2 `resolveLookup(surface, sentenceContext, source)` (new server action)

Implements the §2.1 alias flow. `source` is
`{ type: "reading", documentId } | { type: "tcf", tcfQuestionId }`. On a miss it
calls Tier 1, upserts the entry by lemma (never overwriting `richEntry` /
`savedAt` / `enrichedAt`), inserts the alias, records the occurrence. Returns flat
content + a `cached` flag.

### 4.3 `reexplainInContext(lemma, sentenceContext)` (new)

Regenerates **only** `in_context` for the current sentence. Shown transiently in
the popover; **does not** overwrite the cached entry. Backs the "↻ re-explain in
this sentence" button.

### 4.4 Tier 2 — `enrichEntry(lemma)` (new)

Triggered on save. OpenAI structured output with a Zod schema mirroring
`verb_schema_spec.md` §9. Writes `richEntry` jsonb + `enrichedAt`. On failure the
flat entry is preserved, `enrichedAt` stays null, and the library shows a retry.

### 4.5 `saveVocabularyWord(lemma)` (extend)

Sets `savedAt`, then triggers `enrichEntry(lemma)` in the background (React
transition). Library shows "generating…" until `enrichedAt` is set.

---

## 5. UI

### 5.1 Generalised selection

Extract `useTextSelection(containerRef, onSelect)` from the current popover
(selection guard 2–80 chars, sentence-context extraction, positioning).
`WordLookupPopover` takes `{ containerRef, source }`.

- **Reading**: `reader-client.tsx` passes `source = { type: "reading", documentId }`.
- **TCF**: `drill-runner.tsx` wraps question text + each option in a ref'd
  container and mounts the popover with `source = { type: "tcf", tcfQuestionId }`.

Popover gains a "↻ re-explain in this sentence" action and keeps Save. It **never**
shows occurrences.

### 5.2 `/vocabulary` page (new, top-level)

- New sidebar entry **Vocabulary** (`src/components/sidebar.tsx`).
- List/grid of entries with filters: level (A1–B2), pos, saved-only, text search.
- Entry detail:
  - Flat header (word, pos, level, translation) always available.
  - If verb **and** enriched: conjugation tables gated by learner `cefr_level`
    (`verb_schema_spec.md` §6 — show a tense iff learner level ≥ tense level; star
    `focus_tenses`), plus collocations, example, canada_note.
  - If not enriched: "generating…" / retry.
  - **"Appears in"** section: clickable occurrence links.

### 5.3 Source-link navigation

- TCF: link resolves the occurrence's `tcfQuestionId` → its set/level/order and
  deep-links to `/tcf/drill?skill=…&level=…&q=<order>`. `drill-runner` accepts a
  `?q=` param to open at that question.
- Reading: link → `/documents/[id]`.

---

## 6. Error handling

- Tier-1 AI failure → popover error state + fallback WordReference dictionary link
  (already present).
- `enrichEntry` failure → flat entry preserved, `enrichedAt` null, retry button in
  library.
- Alias / entry write races → `onConflictDoNothing` / `onConflictDoUpdate`.
- Selection guard: reuse existing 2–80 character bounds.

---

## 7. Testing

No test suite exists. Verify manually with `preview_*`:
- TCF drill: select a new word (AI miss → entry + alias + occurrence created);
  re-select the same surface (cache hit, no AI); select an inflected form of a
  known lemma (new alias, same entry).
- Save a verb → enrichment populates the rich view.
- "↻ re-explain in this sentence" returns a context-specific explanation without
  altering the cached entry.
- `/vocabulary`: filters work; "Appears in" links jump to the correct TCF question
  and reading document; occurrences never appear in the popover.

---

## 8. Files touched

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | reshape `vocabulary_lookups`; add `vocabulary_aliases`, `vocabulary_occurrences`, `vocab_source` enum |
| `src/lib/ai/lookup.ts` | add `lemma` to schema + prompt |
| `src/lib/ai/enrich.ts` *(new)* | Tier-2 `enrichEntry` + Zod mirror of `verb_schema_spec.md` |
| `src/lib/actions/vocabulary.ts` | `resolveLookup`, `reexplainInContext`, extend `saveVocabularyWord`; occurrence + alias writes; library queries |
| `src/hooks/use-text-selection.ts` *(new)* | extracted selection logic |
| `src/app/(main)/documents/[id]/_components/word-lookup-popover.tsx` | generalise (container ref + source); add re-explain |
| `src/app/(main)/documents/[id]/_components/reader-client.tsx` | pass reading source |
| `src/app/tcf/_components/drill-runner.tsx` | wrap question/options; mount popover; accept `?q=` |
| `src/app/(main)/vocabulary/page.tsx` + `_components/*` *(new)* | library page |
| `src/components/sidebar.tsx` | add Vocabulary entry |

---

## 9. Open knobs (deferred)

- Whether saved words feed spaced-repetition review (table already has `reviewCount`).
- Rich schemas for non-verb POS beyond the top-level shape.
- Per-tense storage knobs from `verb_schema_spec.md` §10.
