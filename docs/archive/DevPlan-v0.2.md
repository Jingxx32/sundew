# Lumière — Development Plan v0.2 (Sprints 8–10)

> Companion to `docs/archive/PRD-v0.2.md`. This is the **How**: file-by-file build steps
> for the Quiz Engine, TCF import, Podcast Cloze Dictation, and Conjugation
> Drills. Written to be executed cold — no conversation context required.

**Intended executor**: Fable model.

## Preamble — read before writing any code

1. **`AGENTS.md` rule still applies.** This is *not* the Next.js you know. Read
   the relevant guide under `node_modules/next/dist/docs/` before touching
   routing, server actions, or file conventions. Heed deprecation notices.
2. **Honour the strong decisions D-0…D-9 in `docs/archive/PRD-v0.2.md`.** They are listed
   inline where relevant below.
3. **Architecture conventions (from `CLAUDE.md`)** — do not deviate:
   - All DB access goes through `"use server"` actions in `src/lib/actions/`.
     Pages are async server components calling actions directly. No API layer.
   - Drizzle + `node-postgres`/`postgres`; **all queries are async** (`await`).
     Never `.run()/.get()/.all()`.
   - Mutations call `revalidatePath`.
   - UI tokens only (`text-muted-foreground`, `bg-surface`, …); primitives in
     `src/components/ui/` via `cva + cn`; page sub-components in route `_components/`.
   - Reading text wraps in `<article className="reading-prose">`.
4. **Migrations**: after editing `src/lib/db/schema.ts` run `npm run db:generate`
   then `npm run db:init` (idempotent). Latest migration is `0004`; the next is
   `0005`. `db:init` needs the Azure DB reachable (it has timed out before —
   confirm connectivity first; the command is safe to re-run).
5. **AI structured output**: follow the existing pattern in `src/lib/ai/lookup.ts`
   — `openai.chat.completions.parse` + `zodResponseFormat`. Models from
   `src/lib/ai/client.ts` `MODELS`.
6. **Verify with the preview tools**, not by asking the user. Run `npm run lint`
   and ensure no *new* errors (the repo already has some pre-existing lint
   warnings in unrelated files — do not introduce new ones).

---

# Sprint 8 — Quiz Engine + TCF Reading

> Build the generic substrate (3 tables, list + take UI) and prove it end-to-end
> on TCF **reading** via PDF import. Listening (TTS) is S8.5; cloze is S9.

## 1. Scope

1. Schema: `quiz_sets`, `quiz_passages`, `quiz_questions`, `quiz_attempts` + enums.
2. PDF text extraction (`pdf-parse`) with scanned-file detection + manual-paste fallback.
3. AI structuring of raw text → Zod-validated `passages + questions`.
4. Import flow: upload → **parse preview** → **confirm insert** (D-4 two-step).
5. `/quiz` list page (filter by `exam + section`).
6. `/quiz/[setId]` take page — `single` MCQ render + grade + explanation (D-2).
7. Wire `/quiz` into the app nav.

**Out of scope for S8**: listening/TTS (S8.5), cloze/ASR (S9), conjugation (S10),
multi/true_false/fill_blank rendering (schema supports them; UI stubs only),
auto-OCR (S8.5, W-1), SRS.

## 2. Implementation Steps

### Step 1 — Dependencies
```bash
npm install pdf-parse
npm install -D @types/pdf-parse
```
Note the `pdf-parse` import quirk: import from `pdf-parse/lib/pdf-parse.js` to
avoid its bundled debug/test code running on import.

### Step 2 — Schema (`src/lib/db/schema.ts`)
Add the two enums and four tables exactly as specified in `PRD-v0.2.md §5.1`.
- Enums: `quizSectionEnum`, `quizTypeEnum`.
- FKs: `quiz_passages.setId → quiz_sets` (cascade), `quiz_questions.passageId →
  quiz_passages` (cascade), `quiz_attempts.setId → quiz_sets` (cascade).
- Export inferred types: `QuizSet`, `QuizPassage`, `QuizQuestion`, `QuizAttempt`.
- Keep column comments mirroring the existing schema style.
Then: `npm run db:generate` → `npm run db:init` (produces `0005_*`).

### Step 3 — PDF extraction (`src/lib/pdf/extract.ts`)
```ts
export type PdfExtract = { text: string; looksScanned: boolean };
export async function extractPdfText(buf: Buffer): Promise<PdfExtract>
```
- Parse with `pdf-parse`.
- `looksScanned` heuristic: `text.replace(/\s/g,"").length / numPages < ~80`
  (almost no selectable text per page → image/scanned). Tune threshold.
- Never throw on empty text; return `{ text: "", looksScanned: true }`.

### Step 4 — AI parse schema (`src/lib/ai/quiz-schema.ts`)
Zod schema for the parsed payload (Phase 1 fixes `type` to `"single"`):
```ts
QuizQuestionParsed = {
  type: z.literal("single"),         // widen in later phases
  questionText: string,
  options: string[],                  // exactly 4
  correctIndex: number,               // 0-3 (maps to answer jsonb on insert)
  explanation: string | null,
}
QuizPassageParsed = { text: string, questions: QuizQuestionParsed[] }
QuizParseSchema  = { passages: QuizPassageParsed[] }
```

### Step 5 — AI parser (`src/lib/ai/quiz-parse.ts`)
```ts
export async function parseQuizFromText(
  rawText: string, section: "reading",
): Promise<z.infer<typeof QuizParseSchema>>
```
- `openai.chat.completions.parse` + `zodResponseFormat(QuizParseSchema, "quiz")`.
- Model: `MODELS.task` (gpt-4o) — accuracy over cost; one-time batch.
- System prompt must: group questions under their shared passage; map the
  answer key (often at the end of the doc) back to the correct question by
  number; output `correctIndex` not a letter; preserve French exactly.
- Temperature low (≈0.2).

### Step 6 — Server actions (`src/lib/actions/quiz.ts`)
```ts
// Import (no DB write — returns preview for D-4 confirmation)
importQuizFromPdf(formData): Promise<
  | { ok: true; parsed: ParsedQuiz; meta: {...} }
  | { ok: false; error: "scanned" | "parse_failed"; rawText?: string }>
// Confirm (writes 3 tables)
confirmQuizImport(input: { exam; number; section; title; source?; parsed }): Promise<{ setId }>
// Reads
listQuizSets(opts?: { exam?; section? }): Promise<...>
getQuizSet(setId): Promise<{ set; passages: (passage & { questions })[] } | null>
deleteQuizSet(setId): Promise<void>
```
- `importQuizFromPdf`: read `formData` file → `arrayBuffer()` → Buffer →
  `extractPdfText`. If `looksScanned` or empty → `{ ok:false, error:"scanned" }`
  (UI offers manual paste). Else `parseQuizFromText` → return preview.
- `confirmQuizImport`: insert `quiz_sets`, then `quiz_passages`, then
  `quiz_questions` (map `correctIndex` → `answer` jsonb, `type:"single"`).
  `revalidatePath("/quiz")`.
- All inserts use `randomUUID()` ids (match existing actions).

### Step 7 — UI: list page (`src/app/quiz/page.tsx`)
- Async server component → `listQuizSets({ exam, section })` from `searchParams`.
- Filter chips for `exam` and `section` (reuse `Chip`).
- Each set → `Card` linking to `/quiz/[setId]`, showing title, section, and
  latest attempt score if `quiz_attempts` present.
- Top-right **Import** button → opens import dialog (Step 9).
- Empty state when no sets.

### Step 8 — UI: take page (`src/app/quiz/[setId]/page.tsx` + `_components/`)
- Server component → `getQuizSet(setId)`; `notFound()` if null.
- Client `_components/quiz-runner.tsx` holds answer state.
- Reading passages in `<article className="reading-prose">`; questions below.
- **Render switch on `question.type`** (D-2). Implement `single` (radio group);
  add `case "multi"/"true_false"/"fill_blank": return <UnsupportedStub/>`.
- On submit: grade (compare selected index to `answer`), show correct/incorrect
  + `explanation`; write a `quiz_attempts` row (score/total).

### Step 9 — UI: import dialog (`src/app/quiz/_components/import-dialog.tsx`)
- Follow `add-document-dialog.tsx` pattern (`useActionState`, `Dialog`).
- Fields: file (PDF), `exam` (default "TCF"), `section` (default "reading"),
  `number`, `title`, `source` — **manual** (open decision D-2; recommended default).
- Step A: submit file → call `importQuizFromPdf`.
  - On `error:"scanned"` → reveal a `<Textarea>` for manual paste, then parse
    the pasted text (add a `parseQuizFromPastedText` action or reuse with a text
    branch).
- Step B: render the **parsed preview** (passages + questions + marked correct
  option + explanation) for visual check (open decision D-1: full preview, then confirm).
- Step C: **Confirm** → `confirmQuizImport` → close + revalidate.

### Step 10 — Nav
Add a `/quiz` entry to the main navigation (find the existing nav in `layout.tsx`
or the shared nav component; match existing link style).

## 3. File-by-file Deliverables (S8)
| File | New/Edit | Purpose |
|------|----------|---------|
| `src/lib/db/schema.ts` | edit | 4 tables + 2 enums |
| `drizzle/0005_*` | gen | migration |
| `src/lib/pdf/extract.ts` | new | PDF → text + scanned flag |
| `src/lib/ai/quiz-schema.ts` | new | Zod parse schema |
| `src/lib/ai/quiz-parse.ts` | new | AI structuring |
| `src/lib/actions/quiz.ts` | new | import/confirm/read actions |
| `src/app/quiz/page.tsx` | new | list |
| `src/app/quiz/[setId]/page.tsx` | new | take (server) |
| `src/app/quiz/[setId]/_components/quiz-runner.tsx` | new | take (client) |
| `src/app/quiz/_components/import-dialog.tsx` | new | import UI |
| nav (`layout.tsx` or nav component) | edit | `/quiz` link |

## 4. Suggested Build Order (S8)
Schema+migration → extract → quiz-schema → quiz-parse → actions → take page
(seed one set manually to test) → import dialog → list page → nav → lint + preview verify.

## 5. Verification (S8)
Use one real TCF reading PDF: upload → preview shows correctly grouped
passages/questions with the right answer marked → confirm → `/quiz/[setId]`
answer questions → correct/incorrect + explanation render → attempt saved.
Screenshot via preview tools. `npm run lint` clean of new errors.

---

# Sprint 8.5 — TCF Listening (Azure TTS)

> Reuse everything from S8; add audio synthesis so listening sets have playable
> audio generated from their transcript.

## Steps
1. **Env**: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`. Create an Azure Speech
   resource (free tier 0.5M chars/month covers the batch).
2. **`src/lib/ai/tts.ts`** — `synthesizeFrench(text: string): Promise<Buffer>`:
   - POST to `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`.
   - Headers: `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`,
     `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3`.
   - SSML body: voice `fr-FR-DeniseNeural` (or `fr-FR-HenriNeural`). Wrap text;
     leave a hook to inject `<phoneme alphabet="ipa" ph="…">` overrides for the
     rare mis-read liaison (D-3 note: TTS only voices the script; never grades).
3. **Import**: extend `quiz-parse.ts`/`section` to accept `"listening"` (parse
   transcript + questions). In `confirmQuizImport`, for listening passages:
   after insert, `synthesizeFrench(passage.text)` → write
   `public/audio/{passageId}.mp3` → update `passage.audioUrl`.
4. **Take page**: add an `<audio controls src={audioUrl}>` above listening
   questions; transcript collapsible (default hidden).
5. **Verify**: one listening set → audio plays, French sounds correct, obligatory
   liaisons read naturally; spot-check one tricky sentence.

**Out of scope**: word-level audio sync (that's S9's cloze concern).

---

# Sprint 9 — Podcast Cloze Dictation

> A podcast episode (direct mp3 URL) → Whisper transcript with word timestamps →
> AI blanks pedagogically useful words → `fill_blank` questions with per-blank
> audio time ranges, enabling "loop just this word" replay. PRD §4.3.
>
> **Expanded post-S8** to mirror the patterns the S8 code actually established:
> two-step prepare/confirm actions with Zod re-validation of the client-held
> payload, `useTransition`-driven dialog steps, runner branching on
> `section`/`type`, and `randomUUID()` ids.

## 1. Scope
1. Whisper transcription with **word-level timestamps**.
2. AI blank-selection over the transcript (verb endings, liaisons, homophones),
   biased by the learner profile (D-1).
3. Persist as `quiz_set(exam:"podcast", section:"dictation")` →
   `quiz_passage(audioUrl = remote URL, sourceType:"asr", mediaDuration)` →
   `quiz_questions(type:"fill_blank", answer jsonb string[], audioStart/audioEnd)`.
4. Take UI: stream audio from remote URL; per-blank "loop this word"; collapsible
   transcript; type-to-fill grading (accent-tolerant compare); reuse
   `submitQuizAttempt` for the attempt row.

**Strong decisions**: D-5 (don't store/split audio — stream from source, store
only transcript + the blank timings), D-6 (segment on timestamps, not the file),
D-4 spirit (preview transcript + blanks before any DB write), D-1 (blank
selection biased toward `errors`-table weak categories via
`buildLearnerProfile()`).

**No schema change.** S8's migration `0005` already added `audioStart` /
`audioEnd` (integer seconds) on `quiz_questions` and `audioUrl` / `sourceType` /
`sourceUrl` / `mediaDuration` on `quiz_passages`. The full word-timing array is
**ephemeral import-time data** — only each blank's `[audioStart, audioEnd]`
window persists (this is exactly what "loop this word" needs; PRD §5 has no
column for full timings by design). Integer seconds are fine: pad with
`floor(start − 0.5)` / `ceil(end + 0.5)` so the loop window is a snippet around
the word, not a millisecond-exact cut.

## 2. Implementation Steps

### Step 1 — Model registry (`src/lib/ai/client.ts`)
Add to `MODELS` (mirroring the existing entries):
```ts
transcribe: process.env.OPENAI_MODEL_TRANSCRIBE ?? "whisper-1",
```

### Step 2 — Transcription (`src/lib/ai/transcribe.ts`)
```ts
"use server";
export type WordTiming = { word: string; start: number; end: number };
export type TranscribeResult =
  | { ok: true; text: string; words: WordTiming[]; durationSec: number }
  | { ok: false; error: "too_large" | "fetch_failed" | "transcribe_failed" };
export async function transcribePodcast(mp3Url: string): Promise<TranscribeResult>
```
- Server `fetch(mp3Url, { redirect: "follow" })`. Treat non-OK / network throw
  as `fetch_failed`. Podcast CDNs redirect 2–4 times — follow silently.
- Size guard (Whisper hard limit 25MB): check `Content-Length` when present,
  and re-check the actual `arrayBuffer().byteLength` after download (CDNs lie /
  omit the header). Over limit → `too_large`, **before** calling OpenAI.
- Call `openai.audio.transcriptions.create` with
  `file: await toFile(buf, "episode.mp3")` (`toFile` is exported from
  `"openai"`), `model: MODELS.transcribe`, `language: "fr"`,
  `response_format: "verbose_json"`, `timestamp_granularities: ["word"]`.
- Return `text`, `words` (strip whitespace from each `word`), and
  `durationSec` (round `duration`).

### Step 3 — Payload schema (`src/lib/ai/cloze-schema.ts`)
Mirrors `quiz-schema.ts`: one Zod schema is the single source of truth for the
payload that travels dialog → preview → confirm, re-parsed server-side at
confirm time (never trust the client copy).
```ts
ClozeBlankParsed = {
  questionText: string,        // context line with ____ in place of the word
  answer: string[],            // acceptable spellings, [0] is canonical surface
  audioStart: number (int ≥0), // padded loop window, seconds
  audioEnd: number (int ≥0),
}
ClozePayload = {
  transcript: string,
  durationSec: number (int ≥0),
  blanks: ClozeBlankParsed[],  // min 1
}
```

### Step 4 — Blank selection (`src/lib/ai/cloze-select.ts`)
```ts
"use server";
export async function selectBlanks(
  words: WordTiming[], count = 12,
): Promise<{ wordIndex: number }[]>
```
- `openai.chat.completions.parse` + `zodResponseFormat` (model `MODELS.task`,
  temperature ≈0.2), same shape as `quiz-parse.ts`.
- Input: the transcript rendered as **numbered tokens** (`0:Bonjour 1:à …`) so
  the model returns indices, not strings — no fuzzy matching back.
- System prompt: pick `count` pedagogically valuable words for an A2-B1 cloze
  dictation — verb endings (-é/-er/-ait), liaison sites, easily-confused
  homophones (à/a, ou/où, ses/ces), agreement-bearing words. Spread across the
  episode; skip proper nouns, numbers, fillers (euh), words < 3 letters.
- **D-1 bias**: call `buildLearnerProfile()`; if `hasEnoughSignal`, append the
  top `weakGrammar` subcategories to the prompt ("prioritise words that exercise:
  …"). Below threshold the profile is ignored (same rule as task generation).
- Validate returned indices server-side (in range, distinct, valid token) and
  drop bad ones — the count is a target, not a contract.

### Step 5 — Server actions (`src/lib/actions/cloze.ts`)
Two-step, exactly like `quiz.ts` (D-4):
```ts
"use server";
// Step A — no DB write; returns the preview payload
preparePodcastCloze(input: { url: string }): Promise<
  | { ok: true; payload: ClozePayload }
  | { ok: false; error: "invalid_url" | "too_large" | "fetch_failed"
                      | "transcribe_failed" | "select_failed" }>
// Step B — confirmed insert (set + passage + questions)
confirmPodcastCloze(input: {
  url; title; source?: string | null; payload: ClozePayload;
}): Promise<{ setId: string }>
```
- `preparePodcastCloze`: validate URL (`http(s)` only) → `transcribePodcast` →
  `selectBlanks` → build `ClozePayload`: for each chosen word, `questionText` =
  ±8 surrounding tokens with `____` in the word's slot, `answer = [surface]`
  (punctuation-stripped), padded integer `audioStart/audioEnd` clamped to
  `[0, durationSec]`.
- `confirmPodcastCloze`: `ClozePayloadSchema.parse(input.payload)` first
  (mirror `confirmQuizImport`); insert `quiz_sets(exam:"podcast",
  section:"dictation")` → one `quiz_passages(text=transcript, audioUrl=url,
  sourceType:"asr", sourceUrl=url, mediaDuration=durationSec)` → bulk-insert
  `quiz_questions(type:"fill_blank", options:null, answer (string[] jsonb),
  audioStart, audioEnd)` ordered by `audioStart`. `randomUUID()` ids,
  `revalidatePath("/quiz")`.
- Attempts: **reuse `submitQuizAttempt` from `quiz.ts`** — nothing new.

### Step 6 — Take UI (`src/app/quiz/[setId]/_components/cloze-runner.tsx` + page branch)
- `page.tsx`: `set.section === "dictation"` → `<ClozeRunner/>`, else
  `<QuizRunner/>` (extends the D-2 branching one level up; QuizRunner's
  `fill_blank` stub remains for non-dictation sets).
- One `<audio controls preload="metadata" src={passage.audioUrl}>` at the top —
  the **only** audio element; D-5: src is the original remote URL, streamed.
- Each blank renders as a numbered card (mirroring `QuestionBlock`):
  `questionText` with the `____` visible, an `<Input>`, and a loop button.
- Loop button (D-6): `audio.currentTime = audioStart; audio.play()`, a
  `timeupdate` listener pauses at `audioEnd`. Keep the active window in a ref;
  clicking another blank's loop retargets it. `timeupdate` fires ~4×/s — fine
  for second-granularity windows.
- Grading (client-side like quiz-runner, then `submitQuizAttempt`):
  `normalize("NFD").replace(/\p{Diacritic}/gu, "")`, lowercase, NFC-trim,
  strip surrounding punctuation; compare against every entry in `answer[]`.
  Misses reveal the canonical spelling (`answer[0]`) + a per-blank
  correct/incorrect banner, same tokens as quiz-runner
  (`success-soft`/`danger-soft`).
- Transcript: collapsed by default under a toggle ("Show transcript"),
  `<article className="reading-prose">` when open.

### Step 7 — Import dialog (`src/app/quiz/_components/import-dialog.tsx`)
- Add a source switch at the top of step A: **PDF** | **Podcast** (chip-style
  toggle, local state — not a route).
- Podcast pane: `url` (type=url, required), `title` (required), `source`
  (optional; exam/section are fixed `podcast`/`dictation` — no pickers).
- Step A submit → `preparePodcastCloze({ url })` inside the same
  `useTransition` flow; errors map to inline messages (too_large → "Episode
  exceeds Whisper's 25MB limit — pick a shorter episode or a clip").
- Step B preview (D-4): duration, blank count, the **blank list** (questionText
  + canonical answer + `mm:ss` window) and the full transcript in a scrollable
  `reading-prose` block — eyeball ASR quality before saving. Phase 1 is
  preview-only (no inline editing: editing the transcript would desync the
  word timestamps; editing answers is S9.5 territory).
- Step C → `confirmPodcastCloze` → close; revalidate happens in the action.

## 3. File-by-file Deliverables (S9)
| File | New/Edit | Purpose |
|------|----------|---------|
| `src/lib/ai/client.ts` | edit | add `transcribe` to `MODELS` |
| `src/lib/ai/transcribe.ts` | new | Whisper word-timestamps + 25MB guard |
| `src/lib/ai/cloze-schema.ts` | new | Zod payload (preview ⇄ confirm) |
| `src/lib/ai/cloze-select.ts` | new | AI blank selection (+ D-1 profile bias) |
| `src/lib/actions/cloze.ts` | new | prepare / confirm actions |
| `src/app/quiz/[setId]/page.tsx` | edit | branch dictation → ClozeRunner |
| `src/app/quiz/[setId]/_components/cloze-runner.tsx` | new | dictation UI |
| `src/app/quiz/_components/import-dialog.tsx` | edit | PDF/Podcast source switch |

## 4. Suggested Build Order (S9)
client.ts → transcribe → cloze-schema → cloze-select → actions → cloze-runner +
page branch → import dialog tab → lint + preview verify.

## 5. Constraints / Out of scope (S9)
- **YouTube / video download** — out (ToS; PRD §4.3). Podcasts only.
- **>25MB episodes / auto audio-split (ffmpeg)** — out (Phase 1 wall).
- **RSS feed browsing** — S9.5 (`fast-xml-parser`).
- **Transcript/blank editing in the preview** — S9.5 (would desync timestamps).

## 6. Verify (S9)
One real short French podcast mp3 URL (<25MB): import via the Podcast tab →
preview shows transcript + sensible blanks with time windows → confirm →
`/quiz/[setId]` renders ClozeRunner → audio streams from the remote URL →
"loop" seeks to the blank's window and pauses at its end → typing the right
word without accents still grades correct; a wrong word reveals the right
spelling → attempt saved (chip on `/quiz`). `npm run lint` clean of new errors.

---

# Sprint 10 — Conjugation Drills

> Output-style verb-conjugation practice, **driven by the error profile**, with a
> **deterministic** conjugation source (D-7). No SRS yet (W-3). PRD §4.4.

## 1. Scope
1. Deterministic conjugation source via npm library (W-4 **decided** — see §2).
2. Drill generation seeded from `errors` (verb morphology / tense) (D-1, D-8).
3. Drill UI: prompt = infinitive + tense + person → user types the form →
   grade + correct form + short rule.
4. Persist drills/attempts so progress connects back to the profile (D-8).

**Tense coverage (decided)**: `présent`, `passé composé`, `imparfait`,
`futur simple`, `subjonctif présent`, `conditionnel présent` — 6 tenses. Keep
participle agreement (the library provides it). More tenses later.

## 2. W-4 — conjugation source (DECIDED: npm library)

**Use `french-verbs` + `french-verbs-lefff`** (both Apache-2.0 — no GPL
concern; data based on the LEFFF lexicon, covers irregulars and agreement).
Verified available: `french-verbs@5.4.0`, `french-verbs-lefff@3.4.0`.

Consequences of this choice (strong for S10):
- **No `conjugations` table, no seed script.** Forms are computed at runtime by
  the library; the DB only stores drill *attempts*. (D-7 satisfied: the answer
  key is deterministic library output, never AI-generated.)
- **First kickoff task**: install both packages and write a thin wrapper
  `src/lib/conjugation/source.ts` exposing
  `conjugate(infinitive, tense, person): string` over the library's API, and
  **verify it correctly produces all 6 tenses above + participle agreement** for
  a spot-check set (être, avoir, aller, faire, prendre, se lever, manger,
  acheter). If any tense/agreement is missing or wrong, fall back to Option ②
  (import a Verbiste-style dataset) — but only then.

```bash
npm install french-verbs french-verbs-lefff
```

## 3. Steps
1. **Source wrapper** `src/lib/conjugation/source.ts` — `conjugate(...)` over
   `french-verbs` (+ verify, per §2). Map our tense/person identifiers to the
   library's; handle compound tenses (auxiliary + participle + agreement).
2. **Schema**: add a `conjugation_attempts` table (`id`, `verb`, `tense`,
   `person`, `userInput`, `correct` bool, `answeredAt`) + migration. No
   conjugation-data table.
3. **`src/lib/actions/conjugation.ts`**:
   - `getDrillQueue(limit)` — pull target verbs/tenses from `errors` (verb
     morphology / tense subcategories) first (D-1/D-8), then fill from a base
     list of common A2-B1 verbs. Restrict tenses to the 6 above.
   - `gradeConjugation(verb, tense, person, userInput)` — compute the correct
     form via the source wrapper; NFC + accent-tolerant + case-insensitive
     compare; accept agreement variants where the library yields them.
   - record the attempt; surface it to the profile (so Progress can show
     conjugation accuracy per verb/tense).
4. **UI** `src/app/conjugation/page.tsx` + `_components/drill-card.tsx`:
   prompt → input → grade → reveal correct form + short rule hint → next.
5. **Nav**: add `/conjugation` entry.
6. `lookup.ts`'s présent data is display-only; never the answer key.

## 4. Files (S10)
| File | New/Edit | Purpose |
|------|----------|---------|
| `src/lib/conjugation/source.ts` | new | `conjugate()` wrapper over `french-verbs` |
| `src/lib/db/schema.ts` | edit | `conjugation_attempts` table |
| `drizzle/0006_*` | gen | migration |
| `src/lib/actions/conjugation.ts` | new | queue + grade + record |
| `src/app/conjugation/page.tsx` | new | drill page |
| `src/app/conjugation/_components/drill-card.tsx` | new | drill UI |
| nav | edit | `/conjugation` link |

## 5. Out of scope (S10)
SRS/spaced-repetition scheduling (W-3); AI-generated answer keys (D-7);
non-verb morphology drills.

## 6. Verify (S10)
With seeded errors present: drill queue prioritises previously-missed verbs;
typing a wrong form shows the correct deterministic answer; attempt recorded and
visible to the profile.

---

## Cross-sprint definition of done
- `npm run lint` introduces no new errors.
- Migrations applied (`npm run db:init` clean).
- Each feature has at least one error-profile connection wired (D-1).
- Verified via preview tools with a real input, screenshot/log shared — never
  "please check manually".
