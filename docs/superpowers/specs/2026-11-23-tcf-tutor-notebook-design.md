# TCF tutor chat + notebook — design

Date: 2026-11-23
Status: agreed in conversation, awaiting written approval

## 1. Intent

After answering a TCF listening or reading question, the learner currently gets everything
at once: the verdict bar with its key line, one reason under every option, the raw
transcript and the full hand-written explanation (`drill-runner.tsx`, `showAnswer` branch).
The learner reads it, nods, and retains nothing. Reading is passive and nothing captured
from it comes back later.

Replace the passive reveal with an **interactive tutor**: the learner asks about exactly
what they did not understand, a model answers with this question and the learner's
**notebook** as context, and after each answer the learner can **Add** the point it
taught to the notebook or **Skip** it. The notebook is not something the learner reads.
It is a store of testable points the system uses to **generate review questions** (shown
on Today), to **form the TCF error profile** fed back into the tutor, and later to back a
flashcard feature.

The learner's words: notes are organised by *what I asked*, not by what the question
tests. A point the learner never asked about does not enter the notebook.

## 2. Goals, non-goals, anti-goals

**Goals**

- After answering, the learner sees only whether they were right. Everything explanatory
  is one click away, and the tutor is the primary way to learn from a question.
- Streaming answers, grounded in the question, its authored answer key and explanation,
  and the learner's notebook.
- After each tutor answer that contains a testable point, an editable card draft with
  **Add** / **Skip**. Nothing is saved without Add.
- One daily review on Today combining due notebook cards (each a freshly generated
  question, scheduled with the existing Leitner rule) and due vocabulary (existing word
  cards).

**Non-goals (this design)**

- A notebook browsing page. The learner said they will not open it. (An export, like
  `tcf:explain-export`, can come later.)
- Picking real TCF questions that test the same point (option B/C in the conversation).
  Generated review questions only.
- The flashcard feature itself. Cards are stored front/back so it can be added later
  without migration.
- Showing the TCF profile on the Progress page.
- Merging the TCF notebook with the writing error taxonomy.
- Rewriting or deleting existing explanations.

**Anti-goals (failure even if it works)**

- The tutor contradicts the authored answer key. The stored `answer` is ground truth;
  the model must explain it, never re-judge it.
- The tutor is usable before the learner has committed to an answer in drill, or at all
  during a running exam: then it is a cheating tool, not a tutor.
- The notebook fills with junk. Since the learner never opens it, a bad card is never
  cleaned and keeps generating bad review questions. Add is the only quality gate, so
  the draft must be good and editable, and review must offer a way to drop a card.
- Listening answers that make phoneme- or liaison-level claims about the recording. The
  model never hears the audio; same rule as the explanation standard in `CLAUDE.md`.

## 3. Constraints

- **Members only.** TCF is already `guest: false` in `src/lib/access/features.ts`; every
  new action calls `requireFeature("tcf")`.
- **Budget.** Every OpenAI call goes through `getOpenAI(bucket)`; actions that save work
  call `assertAiBudget` first (`guard-coverage.test.ts` lists them). Admins are unlimited.
- **Errors** to the user are `UserFacingError`; client code shows `userErrorMessage`.
- **Vercel Hobby:** 300 s function limit, 4.5 MB bodies. A tutor turn must stay well under
  the limit; cap output length.
- **Frozen review state** (`docs/roadmap.md`, 2026-10-10): do not use or extend
  `review_*` / `practice_*` tables or `src/lib/review/service.ts`,
  `src/lib/practice/service.ts`. The notebook gets its own tables and reuses only the
  Leitner interval rule. This adds a third review queue (TCF question review, vocabulary
  Leitner, notebook). Accepted deliberately; add one line to the roadmap saying so, and
  that the notebook is the easiest queue to fold in if the freeze is lifted.
- **Reimport safety.** Reimporting a test deletes and reinserts `tcf_questions`. Notebook
  cards must survive it (no cascade from question to card); tutor message history may be
  lost with the question.
- **Image-only reading questions** (tests 1–38 are images; `passage` is null). Without an
  explanation, the model would have no text. See §6.3.
- **Next.js version differs from training data** (`AGENTS.md`): read
  `node_modules/next/dist/docs/` before choosing the streaming mechanism.
- Schema conventions for new tables: `uuid` PK `defaultRandom()`, timestamps
  `withTimezone: true`, `user_id` column (picked up by `owned-tables.ts` automatically).

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | One server-action call per turn; gpt-4o returns `{answer, card \| null}` via Zod | Matches every existing AI call; but no streaming, 5–10 s blank wait per question |
| **B (chosen)** | Stream the answer from gpt-4o; when it ends, a separate gpt-4o-mini call proposes a card draft | Feels like chat, which decides whether the learner asks the next question; extra call < $0.001; first streaming AI endpoint in the codebase |
| C | No automatic proposal; a "turn into card" button | Fewest calls; but the learner has to remember to press it, which is not what they asked for |

Chosen by the learner: **B**. Review questions: **generated by AI from each card**
(chosen over real-question matching, which needs tagging all ~3200 questions and maps
poorly to free-form questions).

## 5. User experience

### 5.1 After answering (drill and review modes)

1. The verdict bar shrinks to its result line only: `Correct · B` or
   `Votre réponse : C · Bonne réponse : B`. The key line, the per-option reasons
   (`OptionList` `why`) and `ExplanationPanel` are hidden behind one control,
   **Voir l'explication**, which reveals all three together.
2. Transcript (listening): the raw transcript panel shows after answering as today. If
   the explanation has a rewritten `## Transcript` section, the raw panel shows while
   the explanation is collapsed and is replaced by the rewritten one when expanded.
   (Today the raw panel is suppressed whenever a rewritten one exists, because the
   rewritten one is always visible; once the explanation is collapsed, that rule would
   leave the question with no transcript.)
3. Below the question card: the **tutor panel**, a text box ("Posez votre question…")
   and the thread. The learner may write in Chinese, English or French; the tutor
   answers in the language of the question, keeping French quotations in French.
4. When a streamed answer finishes and the proposal call returns a card, a card draft
   appears under that answer:

   ```
   ┌ Add to notebook? ─────────────────────────────┐
   │ Grammar · manquer reverses subject and object  │  ← point, editable
   │ Front: Tu me manques — who misses whom?        │
   │ Back:  I miss you. A manque à B = B misses A.  │
   │                              [Skip]  [Add]     │
   └────────────────────────────────────────────────┘
   ```

   The point text is editable inline before Add; front/back are generated and can be
   edited behind a small "Modifier" toggle. Skip or ignoring it saves nothing. After
   Add, the card collapses to `Ajouté au carnet · manquer …`.
5. A vocabulary card (the question was "what does X mean / I didn't hear X") uses the
   same Add / Skip. The learner decided vocabulary belongs in the notebook, since unknown
   words are exactly what they will ask about, and is reviewed as a word card in the same
   review session as the other cards (§5.3, §6.1).
6. Returning to an answered question later shows its earlier thread.

"Afficher réponse" (reveal without answering) also enables the tutor.

**Duplicates (design call).** The kind is only known once the proposal call has run, so
it receives the `point` lines (and `lemma` for vocabulary) of **all** the learner's active
and mastered cards, most recent first, capped at 200 (~3k tokens, still < $0.001 on
mini). If the new point matches one, it returns that card's id instead of a new draft,
and the draft reads `Déjà dans le carnet · manquer … — [Skip] [Revoir à nouveau]`. The
second button puts that card back to box 1, due now, whether it was active or mastered
(being asked again means it is not learned). No second card is created. Dismissed
cards are not offered as matches; asking again about a dismissed point creates a new
draft as usual. Vocabulary follows the same rule through the `tutor` gap source (§6.1).

**Enforcement (design call).** "No tutor before answering / during a running exam" is
enforced in the UI only. The client already receives `answer` and `explanation` before
answering, drill answers sync through a fire-and-forget queue, and exam answers are
written only at the end, so a server check would add new state without stopping a
determined user. The tutor action takes the learner's choice from the client.

### 5.2 Exam mode

No tutor while the exam runs. On the finished/results state, each question gets the
same collapsed explanation + tutor panel as drill.

### 5.3 Today

The review is a **new Today activity** (learner's decision) that reviews **notebook cards
and due vocabulary together in one session** (learner's decision).

- **Activity.** Key `notebook` in `ACTIVITY_KEYS` (`src/lib/actions/today.ts`). It
  **replaces** the existing `vocabulary` activity on Today (design call), since the
  combined session already contains every due word; keeping both would offer the same
  words twice. Detail with both due counts, done when nothing is due, progress
  `0 / due`. `recommendActivity` (`src/lib/today/recommendation.ts`) ranks it first when
  due words **or** due notebook cards exist (today's rule only looks at
  `dueVocabulary`); update `recommendation.test.ts`. Listed under "Choose another
  activity". `/vocabulary/review` stays as its own page; `/review` (a source-tabbed list)
  only gains a link to the session. Today's copy is English and new Today UI follows it;
  the TCF screens keep their French copy.
- **Guests and non-TCF users (constraint found in review).** Today currently keeps the
  `vocabulary` activity for guests (only `tcf-*` keys are filtered out for users without
  TCF access), and guests review sample-workspace words on `/vocabulary/review`, which
  has no TCF gate. The replacement must not lose that: for anyone without TCF access,
  or with an empty notebook, the activity is words-only, titled "Review due vocabulary"
  as today, and its session page is not gated by `tcf`; the notebook half is loaded only
  when `canUse(access, "tcf") === true`. With notebook cards, the title is "Review
  notebook and words".
- **Session contents and order (design call).** All due vocabulary gaps from every source
  (look-ups, writing feedback, tutor) **first**, then all due notebook cards. Words need
  no AI, so the learner starts at once while the notebook questions are generated in the
  background. Grouping, rather than interleaving, also lets the session reuse
  `GapReviewRunner` as-is: it is a self-contained runner over `initialCards`, and
  interleaving would mean splitting it into a single-card component. Cap is the
  builder's call (§9).
- **Notebook cards** are shown as a generated multiple-choice question, auto-graded.
  After answering: correct/incorrect, the card's back, and the source question link.
  Each has **Retirer du carnet** (dismiss). Leitner: correct → next box (1/2/4/8/16 days;
  box 5 correct → mastered), wrong → box 1, due tomorrow, same rule as
  `src/lib/vocabulary/gaps.ts`. If generation fails, show the front, then reveal the back
  with "Je savais / Je ne savais pas" self-grading.
- **Words** are shown in the existing word-card format and graded through the existing
  vocabulary review path (`gap-review-runner.tsx` behaviour, `vocabulary_review_attempts`,
  its Leitner state). The combined session reuses those components; it does not
  reimplement word review.

This composes two existing queues on one page. It does not use the frozen unified review
state or session tables.

## 6. Design

### 6.1 Card kinds (the TCF error profile)

| kind | Meaning | Stored in |
|---|---|---|
| `vocabulary` | did not know a word or fixed phrase (`lemma` set; `by_ear` when known on sight but not heard) | `tcf_notes` |
| `grammar` | a structure or form (manquer, tense, pronoun, agreement) | `tcf_notes` |
| `hearing` | not a single word: a phrase, number, name, contraction not heard | `tcf_notes` |
| `comprehension` | understood the text but fell for an option | `tcf_notes`, plus `comprehension_tag` |

**Vocabulary cards** write two rows on Add:

- a `tcf_notes` row (`kind = vocabulary`, `lemma`, `by_ear`, `vocabulary_gap_id`) that
  keeps the tutor's point/front/back, counts in the TCF profile, and is available to the
  tutor's notebook recall. It has no schedule of its own and is not given a generated
  question;
- a vocabulary entry and **exactly one** gap, source `tutor`, gap type `listening` when
  `by_ear`, else `recognition`. Scheduling and grading of the word live here, so it is
  reviewed once, as a word card, and also shows on the Vocabulary page.

How (corrected in review): `upsertGap` alone cannot do this. `vocabulary_gaps` has a
foreign key to `user_vocabulary (user_id, lemma)`, and `upsertGap` does not create that
row. The entry is created by the look-up path (`persistLookup` in
`src/lib/actions/vocabulary.ts`: entry, alias, occurrence, gap in one transaction), which
costs one existing gpt-4o-mini look-up (< $0.001) for a word not cached. But
`persistLookup` always upserts a `recognition` gap with source `lookup`, so a `by_ear`
word would end up with two gaps and be reviewed twice. The builder therefore reuses the
look-up path with the gap type and source passed in (or a sibling helper sharing its
writes), with the occurrence recorded as `{ type: "tcf", tcfQuestionId }`.

Repeat semantics (corrected in review): today `upsertGap` never resets an **active** gap
("repeat signals never reset progress") and revives a **dismissed** one only for source
`manual`. Add from the tutor is an explicit learner action, so source `tutor` gets its
own branch: active → box 1, due now; mastered → reactivate at box 1; dismissed →
revive. The existing `lookup` / `feedback` / `manual` rules stay unchanged. This matches
the notebook rule in §5.1 Duplicates.

The TCF profile counts `tcf_notes` only; look-up and writing-feedback gaps without a
notebook row are not part of it.

**Hearing cards (design call)** are reviewed by ear: the generated item has a `spoken`
French sentence read with the browser's `speechSynthesis`, as `gap-review-runner.tsx`
already does for `listening` gaps, with the text hidden until answered. No server TTS cost.

`comprehension_tag` reuses the seven tags already defined in the 2026-07-06 TCF
error-loop design (§3.3): `vocab`, `syntax`, `inference`, `detail`, `connectors`,
`numbers_time`, `register_intent`. Create `src/lib/tcf/tags.ts` as that spec planned.
The profile is the count of active cards by kind and tag, plus recent review accuracy.

### 6.2 Data model (new tables)

`tcf_tutor_messages`: one row per turn.
`id`, `user_id`, `question_id` → `tcf_questions` **on delete cascade**, `role`
(`user` | `assistant`), `content`, `created_at`. Index `(user_id, question_id, created_at)`.

`tcf_notes`: one row per Added card.
`id`, `user_id`, `kind` (`vocabulary` | `grammar` | `hearing` | `comprehension`),
`lemma`, `by_ear` boolean and `vocabulary_gap_id` → `vocabulary_gaps` on delete set null
(vocabulary only; `box`/`due_at` unused for vocabulary), `comprehension_tag`
(nullable), `point` (one line), `front`, `back`, `source_question_id` → `tcf_questions`
**on delete set null**, `source_locator` (e.g. `CO-T13-Q30`, survives reimport),
`source_message_id` → `tcf_tutor_messages` on delete set null, `status`
(`active` | `mastered` | `dismissed`), `box` (1–5), `due_at`, `last_reviewed_at`,
`created_at`.

`tcf_note_reviews`: one row per review answer.
`id`, `user_id`, `note_id` → `tcf_notes` cascade, `generated` (jsonb: stem, options,
answer index; null when self-graded), `chosen`, `correct`, `box_before`, `box_after`,
`created_at`.

`vocabulary_gaps`: add `tutor` to the `vocab_gap_source` enum and to `upsertGap`'s
`source` type. No column change.

### 6.3 Tutor turn

Context sent to the model, in order:

1. System prompt: role, answer in the learner's language, the stored answer is correct
   and must not be re-judged, no phoneme-level claims about audio, answer only what was
   asked, ~200 words max.
2. The question: skill, type, question text, options with letters, correct letter, the
   learner's choice (or "revealed without answering"), passage or transcript, the
   explanation markdown (including Translation) when present.
3. Image-only reading questions: if `passage` is null, send the question image to gpt-4o
   as image input (low detail first). Without an explanation or image the tutor would be
   guessing. Same for listening `image` questions, whose options are pictures. Expected
   extra cost ≈ $0.002–0.004 per turn. Media is private (signed R2 URLs), so the builder
   picks base64 or a short-lived signed URL.
4. Notebook context: active-card counts by kind/tag, and up to 8 most relevant cards
   (same kind first, then most recent) as one line each, so the tutor can say "same
   trap as manquer last week".
5. The thread so far for this question.

Model: new env `OPENAI_MODEL_TUTOR`, default `gpt-4o`. Budget: new bucket `tutor` in
`AI_DAILY_LIMITS`, 40 turns/day (members; admin unlimited). Only the streamed answer
counts against `tutor`.

Card proposal: after the stream completes and the assistant message is saved, one
gpt-4o-mini call (`OPENAI_MODEL_LOOKUP`, bucket `lookup`) with the learner's question,
the answer and the question context returns, via Zod, either `null` or
`{kind, comprehension_tag?, point, front, back, lemma?, by_ear?}`. `null` when the exchange taught
nothing testable (e.g. "thanks", "repeat that").

Streaming mechanism: route handler vs. this Next.js version's streaming from actions is
the builder's call after reading the bundled docs. If a route handler, add it to the list
in `CLAUDE.md` of why route handlers exist. Note that `guard-coverage.test.ts` checks
only the server actions named in `AI_BUDGET_EXPORTS`: add the new card-proposal,
review-generation and vocabulary-Add actions there, and make sure a route handler, which
the test does not see, still checks the session, `requireFeature("tcf")` and the `tutor`
budget before streaming.

Thread length: the explanation and transcript are resent every turn, so a long thread
grows the input. Cap what is resent (e.g. the last 6 turns) to keep a turn near the
§6.5 estimate.

### 6.4 Review question generation

On opening the Today review, generate questions for the due batch in one gpt-4o-mini call
(bucket `lookup`): per card, one French multiple-choice item (stem + 4 options + answer
index) that tests the point in a **new** sentence, never the source question's sentence.
Zod-validated; invalid items fall back to self-grading. Generated items are stored in
`tcf_note_reviews.generated` only once answered.

### 6.5 Cost estimate

| Call | Model | Per call | Expected/day (heavy use) |
|---|---|---|---|
| Tutor answer (~3k in / 300 out) | gpt-4o | ≈ $0.01 (+$0.003 with image) | 20 → $0.20–0.26 |
| Card proposal | gpt-4o-mini | < $0.001 | 20 → < $0.02 |
| Review batch (15 cards) | gpt-4o-mini | ≈ $0.003 | 1 → $0.003 |

About $6–8/month for one heavy user.

## 7. Error handling

- Stream fails midway: show what arrived plus "Réponse interrompue — réessayer"; do not
  save a partial assistant message, do not propose a card.
- Budget exhausted: `UserFacingError` with the daily-limit message; the explanation
  toggle still works.
- Proposal call fails: no card draft, silently (log server-side). The answer stands.
- Add fails: keep the draft on screen with an error, retry allowed.
- Review generation fails: self-graded fallback (§5.3).

## 8. Verification

There is no end-to-end test suite. Before calling it done:

- `npm run typecheck && npm run lint && npm test` (guard-coverage and owned-tables tests
  must pick up the new actions and tables).
- Real run in the dev server on at least: 2 reading questions with explanation, 1
  image-only reading question without explanation, 2 listening dialogue questions, 1
  exam-results question. Report counts: turns asked, cards proposed, Added, Skipped.
- Then a Today review over those cards: generated / fell back / answered, and the
  resulting boxes and due dates read back from the database.
- Inspect the staged diff for exam content before committing (no transcripts, passages
  or explanations in fixtures or logs).

## 9. Left to the builder

- Streaming mechanism (§6.3), panel component structure, prompt wording.
- Exact retrieval rule for the 8 notebook cards, and the review batch cap.
- The combined session's route and its cap.
- Whether the tutor panel and explanation toggle are shared between `DrillRunner` and
  `ExamRunner` as one component (expected).
