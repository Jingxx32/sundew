# Lumière — Product Requirements Document (PRD)

| Field | Value |
|------|------|
| **Product** | Lumière (French: *light / enlightenment*) |
| **Version** | v0.1 (Sprint 1 delivered; planned through Sprint 7) |
| **Document status** | Frozen after drafting; every change must be recorded in the changelog |
| **Last updated** | 2026-05-05 |
| **Audience** | The product author (personal use), future collaborators, and future users |

---

## 0. Reading Guide

This PRD is the product's constitution. It answers **why** and **what**, not implementation-level **how** details; those belong in ADRs and code comments.

In this document:

- **Strong decision** = mandatory; a change needs an explicit replacement decision.
- **Weak decision** = the current choice; it may evolve with evidence.
- **Out of scope** = explicitly excluded to prevent scope creep.

---

## 1. Executive Summary

**Lumière is an output-first training ground for intermediate and advanced independent learners of French.**

It addresses a problem existing tools collectively overlook: **mainstream AI learning tools (NotebookLM, Claude, and ChatGPT) make language comprehension so easy that they remove opportunities to produce the language, leaving learning inert.**

Lumière's core loop is:

```
You upload French source material → AI helps look up words while you read → AI generates a writing task based on the text that requires X vocabulary items / Y grammar points
        → You write in French → AI gives structured feedback classified by error taxonomy → Errors are archived in your profile
        → Profile blind spots influence the next task's prompt
```

**v0.1 is a personal tool** (run locally, SQLite, single user). Its purpose is to validate this loop for its author before deciding whether to turn it into a product.

---

## 2. Background and Problem Statement

### 2.1 Limitations of Existing Tools

| Tool | Strength | Critical limitation |
|------|------|---------|
| **NotebookLM** | Flashcards / quizzes / mind maps / file-grounded Q&A | Poor source-reading experience with no annotation; **no compulsory output step**; content remains inside its ecosystem |
| **Claude (Cowork/MCP)** | Flexible; can connect local notes | Not built for learning; **no structured review or progress tracking**; AI is too helpful and gives answers directly |
| **Anki / traditional SRS** | Mature spaced-repetition algorithms | Cards are **detached from their original context**; entirely passive recognition with no output; expensive to create |
| **General-purpose AI chat** | General capability | No learner profile—every conversation starts with a stranger; corrections are neither classified nor retained |

### 2.2 The Fundamental Tension in Language Learning

The **Output Hypothesis (Swain, 1985)** in second-language acquisition states:

> Only when learners are compelled to produce language do they discover the gap between “I think I understand” and “I can actually use it.”

Modern AI tools do the opposite by making comprehension too easy:

- Cannot understand? AI translates it instantly.
- Do not know a word? AI explains it instantly.
- Do not know how to say something? AI gives the answer directly.

**The result is the illusion of having learned**: after reading an article, viewing a summary, and answering a few quizzes in NotebookLM, the learner feels fluent; a week later, nothing remains because they **never truly produced** the language.

### 2.3 French-Specific Pain Points

| Pain point | How general AI handles it | Required approach |
|------|------------------|-----------|
| Gender (`le maison` vs `la maison`) | Corrects it without explaining or tracking it | Classify separately and track error rate over time |
| Tense selection (passé composé vs imparfait) | Corrects it without explaining the triggering context | Record `trigger_context` |
| Verb conjugation (être/avoir/aller…) | Corrects it without practice | Turn errors into follow-up drills automatically |
| Context anchor | Extracts vocabulary from source text and loses its memory anchor | Cards must link back to the original sentence |
| Reading vs output split | Reading and writing are entirely separate sessions | Generate writing tasks from the source text |

### 2.4 Why Now

- Structured LLM output (Structured Outputs / Zod schemas) matured in 2024, making taxonomy-classified corrections reliable for the first time.
- Server Components and Server Actions reduce deployment cost for a full-stack TypeScript personal project to nearly zero.
- SQLite and Drizzle make local-first learning tools practical.

---

## 3. Product Positioning

### 3.1 One-Sentence Positioning

> **An English-interface “read → write → improve over time” training ground for intermediate and advanced learners of French. You choose what to read by uploading it; AI generates writing prompts from what you just read, corrects your work, and archives each error in your language-growth profile.**

### 3.2 Three Core Value Propositions

1. **Output-first**
   Not “AI helps you understand material,” but “AI compels you to produce language from it.” Every reading session should end in French you wrote yourself.

2. **Persistent feedback**
   Every error receives a precise tag from nine categories and 33 subcategories and is written to your profile. After three months, you can see trends such as “subjunctive error rate fell from 80% to 30%.”

3. **Learner-driven**
   The profile is not a static statistics page; it influences AI prompts by deliberately activating your weakest grammar points, forcing targeted practice.

### 3.3 Differentiation Matrix

| Dimension | NotebookLM | Anki | Claude/ChatGPT | **Lumière** |
|------|-----------|------|----------------|-------------|
| Upload your own material | ✓ | △ (manual card creation) | △ (paste) | ✓ |
| Reading experience | Weak | — | Weak | **Strong** (S2) |
| AI definition on selection | △ | — | ✓ | ✓ (S2) |
| Compulsory output | ✗ | △ (cloze) | ✗ | **✓ (S3+S4)** |
| Structured correction (by error category) | ✗ | ✗ | ✗ | **✓ (S4)** |
| Persistent errors + profile | ✗ | △ (individual-card history) | ✗ | **✓ (S5)** |
| Long-term trend visualization | ✗ | ✗ | ✗ | **✓ (S6)** |
| Learner profile influences prompts | ✗ | ✗ | ✗ | **✓ (S7)** |
| Spaced-repetition SRS | ✗ | ✓ | ✗ | △ (v2 candidate) |

**Moat**: rows 4–7. NotebookLM **cannot structurally provide** this because it lacks the “output → archived errors → influence on next input” loop.

---

## 4. Target Users

### 4.1 Primary Persona (P0)

> **“Independent learner”**: native English speaker (secondarily Chinese), CEFR A2–B1, self-studying French for at least six months, investing three to eight hours weekly, technically fluent (developer, scholar, or creator), and experienced with NotebookLM, Claude, and Anki and their limitations.

Specific traits:
- **Does not rely on external accountability** (no teacher, class, or ranking needed).
- **Willing to exert cognitive effort** (accepts feedback in which AI does not supply direct answers).
- **Motivated by long-term data** (trend charts are motivating).
- **Uses self-selected authentic material** (novels, news, podcast transcripts), not pre-made textbook content.

### 4.2 Secondary Personas (P1, considered after v2)

- Learners preparing for DELF B1/B2 who need targeted writing work.
- People moving to a French-speaking country who need to build workplace writing ability quickly.
- French teachers using it to assist with marking student work.

### 4.3 Users We Do Not Serve (P3)

- A0–A1 beginners (many existing beginner apps already do this well; do not duplicate them).
- People who only want to passively watch videos to learn French (conflicts with the product philosophy).
- People seeking gamification, streaks, and badges (conflicts with the design principles).

### 4.4 Primary User-Journey Example

> **At 22:00, the primary user finishes a Le Monde article about climate change.**
> 1. In Reader, they look up eight new words and read each AI explanation and example.
> 2. They select “Generate task from these 8 words.”
> 3. AI prompts a reflection using five of those words and the plus-que-parfait.
> 4. The user writes six lines.
> 5. AI reports three errors (one `tense_choice`, one `noun_gender`, one `preposition`), one praise item, and one suggestion.
> 6. The user reads the explanations, opens a micro-drill, and writes two more reinforcing sentences.
> 7. They close the app.
> 8. **The following week, they reopen Progress and see that the `noun_gender` error rate fell this week.**

---

## 5. Product Principles

These five principles are Lumière's constitution. Every feature decision must be tested against them.

### 5.1 Output-first
> “If a feature only makes material easier to understand and does not compel output, it is not a core Lumière feature.”

Direct implications:
- Do not prioritize input-only features such as “AI summarize the whole text” or mind maps.
- Do not build passive-consumption features such as “AI read the whole text to me.”

### 5.2 Errors are Fuel
> “Every mistake a user makes is the product's most valuable data, not evidence of failure.”

Direct implications:
- Errors must be structured, persistent, and analyzable.
- Include a praise layer so users remain willing to expose errors.
- **Do not build correct/incorrect points or error-rate rankings.**

### 5.3 Learner-driven
> “Every piece of AI feedback should know who you are.”

Direct implications:
- The accumulated error profile must feed the correction prompt.
- Writing-task difficulty and vocabulary must derive from the learner profile.
- The user's current CEFR level influences the complexity of AI wording.

### 5.4 Reading Is the Entry, Not the Destination
> “Every reading session should ultimately lead to output.”

Direct implications:
- Reader must always offer a one-second-access “generate writing task” entry point.
- Vocabulary collected while reading must feed writing tasks directly.

### 5.5 No Spoilers
> “AI should act like Socrates, not Wikipedia.”

Direct implications:
- Writing feedback should not reveal a fully corrected version by default; ask questions or give hints first.
- “Show full correction” is an intentional second click by the user.
- Word explanations must say why the word is used in this sentence, not provide a dry dictionary definition.

---

## 6. The Core Loop

```
┌─────────────────────────────────────────────────────────────┐
│  Source text (material you upload)                          │
│         ↓ AI extracts: new words + grammar points + theme   │
│  AI generates a writing task based on the source text       │
│   Example: "Using 'bouleverser', 'malgré tout' and the      │
│        plus-que-parfait, write a 5-sentence reflection      │
│        on the protagonist's decision."                      │
│         ↓ You write in French                               │
│  AI correction (English explanations + French examples)     │
│         ↓ Classify errors → write to your profile           │
│  ┌──────────────────────────────────────┐                  │
│  │  Your language profile (persistent)    │                  │
│  │  - Total errors: 234 (by category)    │                  │
│  │  - Subjunctive error rate: 80% → 30% ↓│                  │
│  │  - Words you command: 1,847 (produced)│                  │
│  │  - Top five recurring error patterns  │                  │
│  └──────────────────────────────────────┘                  │
│         ↓ In turn, influences the next task                 │
│  The next writing task deliberately activates weak points   │
└─────────────────────────────────────────────────────────────┘
```

**This loop is Lumière.** Without it, the product degrades into “NotebookLM + a French dictionary.”

---

## 7. Functional Requirements

### 7.1 Library

**Purpose:** Let users manage their French-learning materials; it is the entry point on every visit.

#### 7.1.1 Required Features

| Feature | Description | Sprint |
|------|------|--------|
| **Add document** | Paste or upload French text in a dialog; `title` and `content` are required, while `source`, `type`, and `url` are optional | S1 ✓ |
| **Document list** | Sort by most recently read, then creation time; show title, source, word count, CEFR level, and total error count | S1 ✓ |
| **Continue Reading card** | Pin the most recently opened document in a large card with progress, excerpt preview, and dual CTAs | S1 ✓ |
| **Delete document** | Available from a menu and requires a second confirmation | S2 |
| **Search** | Full-text search over titles and content | S2 |
| **Type filter** | Filter chips for News, Literature, Personal, and Other | S2 |

#### 7.1.2 Design Details

- Do not add cover images or thumbnails: this is a learning tool, not Goodreads.
- The error-count chip is a reverse entry point. It links to `/progress?documentId=<id>`. The S6 Progress page must support composable `documentId`, `category`, and `window` query parameters to filter all errors for that document.
- Color-code level chips (A2 green / B1 blue / B2 amber) to help users assess whether their source-material difficulty distribution is healthy.

#### 7.1.3 Out of Scope (v1)

- ❌ PDF/EPUB parsing (v1 supports only pasted plain text or Markdown)
- ❌ Web clipping or YouTube-subtitle import
- ❌ Hierarchical folders or tags
- ❌ Importing or exporting the whole library
- ❌ Shared material for multiple people

---

### 7.2 Document Reader

**Purpose:** Provide an immersive “reading salon” environment where AI help is one second away without interrupting flow.

#### 7.2.1 Required Features

| Feature | Description | Sprint |
|------|------|--------|
| **Reading column** | 680px centered layout, Source Serif at 18px, 1.75 line height, and generous paragraph spacing | S1 ✓ |
| **Document header** | Title, author/source, CEFR chip, word count, and reading progress | S1 ✓ |
| **Selection lookup popover** | Selecting any word or phrase opens a popover with translation, conjugation, “in this context,” and two French examples | **S2** |
| **Save to vocabulary** | A popover button that adds the item to the current session's collected list | S2 |
| **This Session sidebar** | Shows reading duration, number of words looked up, and the collected vocabulary list | S2 |
| **Generate Writing Task (header)** | Generates a writing task from the full document | S3 |
| **Generate task from these N words (sidebar footer)** | Generates a writing task from vocabulary collected in this session | S3 |
| **Automatic reading-progress tracking** | Watches scroll position and updates `readingProgress` live | S2 |

#### 7.2.2 Selection-Popover Content Contract

**Strong decision:** the popover's six sections have a fixed, non-reorderable sequence:

```
┌──────────────────────────────────┐
│ <word>           verb · trans.   │ ← Header + part of speech
│ [B2 word]                        │ ← Level chip
│                                  │
│ TRANSLATION                      │
│ to deeply move, to overwhelm     │
│                                  │
│ CONJUGATION (présent)            │ ← Verbs only
│ je bouleverse · tu bouleverses…  │
│                                  │
│ IN THIS CONTEXT                  │ ← ★ Key differentiator ★
│ Past participle agrees with…     │
│                                  │
│ EXAMPLES                         │
│ La nouvelle a bouleversé…        │
│ Cette rencontre m'a bouleversé…  │
│                                  │
│ [+ Save to vocabulary] [Dict →]  │
└──────────────────────────────────┘
```

**“IN THIS CONTEXT” is the central difference from a general AI dictionary.** It explains why the word is used in **this specific sentence**—conjugation, agreement, idiom, or figurative meaning—not just a general dictionary definition.

#### 7.2.3 Out of Scope

- ❌ Highlighting, underlining, or annotation (these are reading-tool features and deliberately conflict with the output-first principle)
- ❌ Reading-along or TTS playback (v1 does not cover listening or pronunciation)
- ❌ Shared reading or comments

---

### 7.3 Practice (Writing + Feedback)

**This is the product's defining experience. Every other module serves this moment.**

#### 7.3.1 Task Stage

| Feature | Description | Sprint |
|------|------|--------|
| **Task card** | Shows source (`FROM` document name), English prompt, target-word chips, and target-grammar chips | S3 |
| **Writing input** | Large Source Serif textarea with live word count and paste support | S3 |
| **Word-count prompt** | Shows the recommended range (for example, 50–200); the button stays available below it but shows a warning | S3 |
| **Submit** | Calls the correction server action | S3 |

#### 7.3.2 Feedback Stage

| Feature | Description | Sprint |
|------|------|--------|
| **Three-column layout** | Collapsible source excerpt on the left, submission with inline highlights in the middle, and feedback panel on the right | **S4** |
| **Inline highlights** | Underline each error in its category color plus a superscript number, paired one-to-one with the right-side error card | **S4** |
| **Error card** | One card per error with original → correction, `explanation_en`, two French examples, and a link to the relevant rule | **S4** |
| **Praise card** | An A2–B1 motivational necessity: at least one acknowledgement of what was done well | **S4** |
| **Improvement card** | Something that is not wrong but could be better; it does not enter error-profile statistics | **S4** |
| **Overall summary** | AI-estimated CEFR level for this submission plus a one-sentence English summary | **S4** |
| **Show full correction (second click)** | Do not reveal the full correction by default; encourage the user to revise it themselves | **S4** |
| **Micro-drill** | A “write two more sentences” entry point in an error card | S5 |

#### 7.3.3 Writing-Task Sources (Strong Decision)

Writing tasks **must** come from one of these three sources; they may not be generated without context:

1. **Full document** — triggered from Reader's header button.
2. **Words collected in the current session** — triggered from the bottom of Reader's sidebar.
3. **Error profile** — triggered from the Progress page's “Practice” button (S7).

Do **not** build random prompt generation. Every output activity needs a learning-context anchor.

**`target_words` constraints (strong decision):**
- `target_words` must be a **subset** of words the user collected this session; AI may not add uncollected words to its response.
- When the collection contains **five words or fewer**, `target_words` must include every collected word.
- When it contains **more than five words**, AI may choose a subset, but `target_words` must contain at least three and remain a subset.
- This constraint does not apply when the full document is used without collected words; AI may choose vocabulary freely.
- Post-processing validation happens in the `generateWritingTask` server action and does not call AI again.

#### 7.3.4 Five Layers of Excellent Feedback

| Layer | Content | Sprint |
|----|------|--------|
| **5. Progress visualization** | You made X subjunctive errors; the rate has now fallen from 80% to 20% | S6 |
| **4. Persistent errors + return flow** | A sentence pattern written incorrectly appears tomorrow in the review/task queue | S5 + S7 |
| **3. Explanation engine** | Do not merely identify the error: explain why, give the rule, and provide similar examples | **S4** |
| **2. Correction prompt engineering + post-processing** | Require AI to output the Zod schema rather than improvise freely | **S4** |
| **1. Error taxonomy** | Nine categories and 33 subcategories: the foundation | S1 ✓ |

---

### 7.4 Progress (Profile and Trends)

**Purpose:** Let users **see their own growth** and provide a reverse entry into targeted practice.

#### 7.4.1 Required Features

| Feature | Description | Sprint |
|------|------|--------|
| **Four top statistic cards** | Submissions / Errors logged / Active days / Most improved | S6 |
| **Error-rate trend chart** | Multiple lines by category, switchable between 30, 90, and 365 days | S6 |
| **Error-distribution bar chart** | Horizontal bars for cumulative errors in every category | S6 |
| **Top three recurring patterns** | Three repeated errors, each with a “Practice” button that generates a targeted writing task | S6 + S7 |
| **Encouragement banner** | One positive note at the bottom | S6 |
| **Error-detail page** | Drill into a category to see every error and jump back to its original sentence | S6 |

#### 7.4.2 Exclusions (Strong Decision)

- ❌ Streaks / consecutive-day counts (A2–B1 learners can be psychologically vulnerable; broken-streak anxiety drives users away. Use the gentler “Active days” instead.)
- ❌ Levels / experience points / badges (gamification distorts the motivation to learn for learning's sake).
- ❌ Leaderboards / comparisons with others (this is a personal tool and conflicts with the product tone).

---

### 7.5 Settings

| Feature | Sprint |
|------|--------|
| OpenAI API-key validation + link to the OpenAI usage dashboard | S2 |
| Current CEFR level (manually set / AI-estimated) | S6 |
| Metalanguage switcher (EN by default; ZH later) | v2 |
| Data export (SQLite or JSON) | v2 |
| Theme switcher (dark mode) | v2 |

---

## 8. Error Taxonomy — The Product's Core

> **This is Lumière's most important design decision.**
> It is both a human-readable classification system and the structured schema of AI output.
> Changing it means changing the product's DNA.

### 8.1 Design Principles

1. **Mutually exclusive leaves** — every error must unambiguously map to one leaf.
2. **Keep granularity to about 33 leaves** — too many labels are unstable for AI; too few make analysis worthless.
3. **Focus on A2–B1 needs** — emphasize tense, gender, and articles; de-emphasize style, register, and collocation.
4. **No severity field** — treat all errors equally and avoid adding another AI judgment dimension.

### 8.2 Full Taxonomy v1

```
GRAMMAR (high-risk area)
├── conjugation_present       Present-tense conjugation
├── conjugation_passe_compose Past-tense conjugation
├── auxiliary_choice          Incorrect être / avoir auxiliary
├── tense_choice              Incorrect tense choice (for example, présent in past context)
├── pc_vs_imparfait           ★ passé composé vs imparfait
├── past_participle_agreement Past-participle gender and number agreement
├── subjonctif_basic          Basic subjunctive
└── futur_vs_conditionnel     Futur / conditionnel misuse

GENDER & AGREEMENT
├── noun_gender               Incorrect noun gender
├── adjective_agreement       Adjective gender and number agreement
├── adjective_position        Adjective position
└── article_noun_mismatch     Article–noun gender or number mismatch

ARTICLES
├── definite_vs_indefinite    Incorrect le/la vs un/une choice
├── partitive                 du/de la/des
├── article_omission          Missing or unnecessary article
├── negation_de_rule          ★ un/une/des → de in negation
└── contraction               à+le=au, de+le=du

PREPOSITIONS
├── verb_preposition          Incorrect preposition after a verb
├── place_preposition         Preposition of place
├── time_preposition          Preposition of time
└── general_preposition       Other preposition

PRONOUNS
├── subject_pronoun           Incorrect subject pronoun
├── object_pronoun            COD/COI
├── y_en                      y / en
└── stressed_pronoun          Stressed pronoun

NEGATION & QUESTION
├── negation_structure        *ne...pas* structure
└── question_formation        Question structure

VOCABULARY
├── wrong_word                Incorrect word choice, including faux amis
├── anglicism                 Literal English transfer
└── word_form                 Incorrect part of speech

ORTHOGRAPHY
├── accent                    Accent mark
├── cedilla                   Missing ç
├── homophone                 Homophone
├── liaison_elision           Liaison / elision (l'arbre, d'amis)
└── spelling                  Other spelling

SYNTAX
├── word_order                Word order
└── awkward_structure         Awkward structure
```

**Total: nine categories and 33 leaves.**

### 8.3 Schema for Each Error (Required AI Output)

```typescript
{
  span: { start: number, end: number },     // Character offsets in the original text
  original: string,                          // "je vais"
  correction: string,                        // "je suis allé"
  category: ErrorCategory,                   // "Grammar"
  subcategory: string,                       // "tense_choice"
  trigger_context: string | null,            // "Hier" ← what triggered this context
  explanation_en: string,                    // English explanation
  fr_examples: string[],                     // Two or three French examples
  rule_id: string | null,                    // Links to the rule knowledge base
  micro_drill: string | null                 // Optional immediate mini-practice
}
```

### 8.4 Complete Feedback Packet (AI Output for One Submission)

```typescript
{
  errors: Error[],              // Actual errors (affect profile statistics)
  improvements: Suggestion[],   // Not errors, but could be improved (not added to profile)
  praise: string[],             // ★ A2–B1 encouragement layer ★
  overall_level_estimate: CefrLevel,
  summary_en: string            // One-sentence summary comparing progress with the last time
}
```

### 8.5 Taxonomy Evolution Strategy

- **Now:** focus on core A2–B1 grammar.
- **When the user reaches B2+:** add `Style`, `Register`, and `Collocation` categories and split `subjonctif_basic` by its triggers.
- **Do not** support user-defined taxonomies. Keep the schema stable or historical data becomes incomparable.

---

## 9. Data Model

### 9.1 ER Diagram

```
┌────────────┐         ┌──────────────────┐
│ documents  │←───────│ reading_sessions │
│            │         └──────────────────┘
│            │
│            │←───┐
└────────────┘    │
                  │
            ┌─────┴────────┐
            │ writing_tasks │
            └───────┬───────┘
                    │
                    ↓
            ┌──────────────┐
            │ submissions  │
            └───────┬──────┘
                    │
                    ↓
            ┌──────────────┐         ┌────────┐
            │   errors     │────────→│ rules  │
            └──────────────┘         └────────┘
```

### 9.2 Responsibilities of the Six Tables

| Table | Responsibility | Key fields |
|----|------|---------|
| `documents` | French source text uploaded by the user | content, type, estimated_level, reading_progress |
| `reading_sessions` | One reading session plus words looked up during it | duration_seconds, vocabulary_looked_up (JSON) |
| `writing_tasks` | AI-generated writing task | prompt_en, target_words, target_grammar |
| `submissions` | French composition submitted by the user | content_fr, feedback_json, praise, summary_en |
| `errors` | **★ Core table ★** all structured errors | category, subcategory, trigger_context, explanation_en |
| `rules` | Grammar-rule knowledge base | description_en, examples |

### 9.3 Key Design Decisions

- **No `user` table** (v0.1 is a single-user tool, avoiding one abstraction layer).
- **The `errors` table is an event stream, not state** — never update an existing error; append rows for every submission.
- **JSON fields versus relational modeling** — store `target_words`, `fr_examples`, and `vocabulary_looked_up` as JSON because they are small arrays that need no joins.
- **Use PostgreSQL `timestamp`** — the former SQLite Unix-epoch approach was retired with the database migration.
- **Foreign-key cascade policy:**
  - Delete a `submission` → delete its `errors` (cascade).
  - Delete a `document` → set `writing_tasks.documentId` to NULL, preserving historical compositions.
  - Delete a `document` → set `reading_sessions.documentId` to NULL, **preserving vocabulary-learning history** rather than cascading deletion. `documentTitleSnapshot` retains the original title so vocabulary history remains attributable.

---

## 10. Information Architecture and Navigation

```
Lumière
├── Library              ← entry point and material management
│   └── Document Reader  ← reading, lookup, and writing-task trigger
├── Practice             ← task, writing, and feedback
│   ├── Task Stage
│   └── Feedback Stage
├── Progress             ← profile and trends
│   └── Errors Drill-down
└── Settings
```

**Strong decision:** The 200px left Sidebar is fixed navigation. **Do not** use top-bar tabs or a hamburger menu; this is a desktop-first tool.

---

## 11. UI/UX Design Principles

### 11.1 Visual Language

| Element | Choice | Rationale |
|------|------|------|
| Primary colors | Warm cream `#FAF8F4` + French blue `#3B5BA9` | Reading-friendly and non-glaring; avoids a cheap “tech company” or gamified look |
| Cards | White background + extremely subtle shadow + 16px radius | Academic-tool character without excess |
| Heading font | Source Serif 4 | Matches the character of French print |
| Body font | Inter | Modern and highly legible |
| Reading font | Source Serif (18px text / 1.75 line height) | Essential to the “reading salon” feeling |
| Icons | Lucide line icons (1.7 stroke) | More stable and consistent than emoji |
| Interaction feedback | Hover/focus only; no sound, vibration, or animation | Quiet academic character |

### 11.2 Deliberate Exclusions (Strong Decision)

- ❌ Streaks / combo counters / experience points
- ❌ Leaderboards / rankings
- ❌ Bullet comments / notifications / red-dot badges
- ❌ Celebration animation / fireworks / confetti
- ❌ Role-playing / cartoon characters / anthropomorphized AI
- ❌ Onboarding tour (the app should be usable on the first visit)

### 11.3 Key Page Wireframes Delivered

See the mockup screenshots in the repository root, delivered alongside this PRD:
- `french-app-library-screen.png`
- `french-app-document-reader.png`
- `french-app-feedback-screen.png`
- `french-app-progress-dashboard.png`

---

## 12. Technical Architecture

### 12.1 Technology Stack (v0.1)

| Layer | Choice | Rationale |
|----|------|------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | One codebase for UI and API; Server Actions call OpenAI cleanly |
| Styling | Tailwind CSS v4 + custom CSS variables | Fastest iteration for a personal project; Tailwind v4 performance is sufficient |
| Database | **PostgreSQL** via `node-postgres` + Drizzle ORM | The original SQLite plan (see the v0.1.1 changelog) was migrated to Azure PostgreSQL before S3.5 to support multi-device access and concurrent S4+ writes; Drizzle schema uses `pgTable / jsonb / timestamp` |
| AI | OpenAI API (GPT-4o / GPT-5) + Structured Outputs (Zod) | Most reliable structured output; essential for correction |
| UI primitives | Radix UI (Dialog / Popover / Slot) | No dependency lock-in; component code lives in this repository |
| Icons | Lucide React | Fits Radix's style and is lightweight |
| Fonts | Inter + Source Serif 4 (`next/font`) | Self-hosted; no FOUT |
| Charts | Recharts (introduced in S6) | Cleanest React integration |

### 12.2 Deployment Model

| Stage | Deployment |
|------|------|
| **v0.1** | Run locally with `npm run dev` |
| v0.2 candidate | Package as a Tauri `.app` if opening a browser is inconvenient |
| v1.0 candidate | Vercel + Postgres / Turso if the product becomes multi-user |

### 12.3 AI Model-Selection Strategy

| Use case | Default model | Alternative | Rationale |
|------|---------|------|------|
| Selection lookup explanation | `gpt-4o-mini` | `gpt-4o` | High frequency and low-latency requirement; cost-sensitive |
| Writing-task generation | `gpt-4o` | `gpt-5` | Medium frequency and needs creativity; quality first |
| Writing correction | `gpt-4o` | `gpt-5` | **Quality is absolutely first**; per-call cost is acceptable |

**Strong decision:** every AI call must use Structured Outputs (a Zod schema). **Do not** parse free-text JSON.

### 12.4 Data Privacy

- **v0.1:** all data is stored in local SQLite; only OpenAI calls leave the machine, sending the user's writing content to OpenAI.
- Users must be explicitly told that submitted content is sent to OpenAI for correction.
- Future v2 candidate: an entirely offline local-model option (Ollama + Mistral / Qwen).

---

## 13. Implementation Roadmap

### 13.1 Sprint Overview

| Sprint | Theme | Delivered value | Status |
|--------|------|---------|------|
| **S1** | Scaffolding + DB schema + Library + Reader basics | Read your own French articles | ✅ Complete |
| **S2** | Selection lookup (OpenAI) + reading-progress tracking + vocabulary collection | Reading experience surpasses NotebookLM | next |
| **S3** | First half of the “Generate Writing Task” loop | Receive the first personalized writing task | |
| **S4** | **★ Writing-correction core ★** structured feedback + error archiving | Receive structured feedback for the first time | |
| **S5** | Error-profile page + Micro-drill | Errors begin to accumulate meaningfully | |
| **S6** | Progress Dashboard + trend charts | See long-term changes | |
| **S7** | Integrate learner profile into task generation | Close the loop | |

### 13.2 Detailed Scope by Sprint

#### Sprint 1 ✅
- [x] Next.js 16 + TypeScript + Tailwind v4 scaffolding
- [x] Drizzle schema and migration for six tables
- [x] Error-taxonomy constants
- [x] Warm-cream + French-blue design system
- [x] Global Sidebar navigation
- [x] Library page (Continue Reading + list + filter-chip placeholder)
- [x] Add Document dialog (Server Action + Zod validation)
- [x] Basic Document Reader view
- [x] Seed data with three example articles
- [x] Placeholder pages (Practice / Progress / Settings)
- [x] README + .env.example

#### Sprint 2 (next)
- OpenAI client wrapper + key-configuration UI
- Selection-triggered popover (Radix Popover + selection listener)
- AI definition endpoint (Structured Output: translation, conjugation, `in_context`, examples)
- Persist “Save to vocabulary” to `reading_sessions`
- This Session sidebar (live vocabulary list + timer)
- Reading-progress `IntersectionObserver`

#### Sprint 3
- “Generate Writing Task” Server Action (input: document + collected vocabulary → output: `prompt_en` + targets)
- Practice / Task Stage page (task card + writing input)
- Submit navigation to Feedback Stage (with loading state)

#### Sprint 4 (★ Core Sprint ★)
- Complete feedback Zod-schema definition
- Writing-correction Server Action (OpenAI structured output)
- Write error data to the `errors` table
- Feedback Stage three-column layout
- Inline highlights + numbered superscripts
- Error, Praise, and Improvement cards
- “Show full correction” second-click interaction

#### Sprint 5
- Errors archive page (browse by category)
- Click an error to return to the original sentence (requires the submission's `contentFr` reference)
- Micro-drill UI (error-card entry point → two-sentence practice)

#### Sprint 6
- Progress Dashboard (four cards + trend chart + distribution chart + top three patterns)
- Recharts integration
- Trend calculations (weekly/monthly aggregation)

#### Sprint 7
- Learner Profile data structure (aggregated from the `errors` table)
- Inject profile context during writing-task generation
- “Practice” button in Progress directly generates a targeted task

### 13.3 v2+ Candidate Features (Unscheduled)

- Spaced-repetition SRS (automatically generate review cards from the `errors` table)
- PDF / EPUB parsing
- Web clipping / YouTube-subtitle import
- Listening cloze (Whisper forced alignment)
- Read-aloud scoring
- Multi-user accounts
- Mobile
- Desktop app (Tauri)
- Local-model option (Ollama)

---

## 14. Success Measures

### 14.1 Subjective Metric (the Only Important One During v0.1 Personal Use)

> **The author voluntarily uses it at least three times per week for four consecutive weeks.**

If this does not happen, the product has a fundamental problem—either insufficient functionality or too much friction—making every objective metric meaningless.

### 14.2 Objective Metrics (Tracked Late in v0.1)

| Metric | Target | Measurement |
|------|------|---------|
| Read → write conversion | More than 30% of reading sessions become at least one submission | Compare `reading_sessions` and `submissions` counts |
| Feedback completeness | 95% of submissions receive at least one structured feedback item | `submissions JOIN errors` |
| Error-label accuracy | In a sample of 50 errors, at least 90% have the correct category | Manual evaluation |
| Long-term trend visibility | After 30 days, see distinct trend changes in at least three categories | Progress page |

### 14.3 Anti-Metrics (Warning Signs)

- Time spent reading ÷ time spent writing > 5: the output stage is not truly activated.
- The same error keeps recurring without declining: feedback is not truly working.
- “Add Document” clicks continue to fall: material is running dry and clipping is needed.

---

## 15. Risks and Open Questions

### 15.1 Identified Risks

| Risk | Impact | Mitigation |
|------|------|------|
| Unstable OpenAI correction quality | Incorrect feedback misleads learning | Calibrate the prompt with manual sampling after S4 launches; retain raw feedback JSON for traceability |
| Taxonomy does not match real errors | Many errors fall into the `wrong_word` fallback | Review distribution weekly during S4–S5 and add leaves when needed |
| Uncontrolled AI cost | Frequent lookup + long correction creates meaningful monthly cost | Use a mini model for lookup, cap correction `max_tokens`, and cache repeated lookups locally |
| The user (the author) writes too little, producing a sparse profile | Progress has nothing to show | In S6, indicate that at least N submissions unlock certain charts |
| French-character / accent-processing bug | Selection lookup or span offsets misalign | Use NFC normalization throughout; test with é/è/ê and related characters |

### 15.2 Open Questions (Require Later Decisions)

1. **Should the selection popover's “in this context” text come from a general model or a prebuilt index?**
   - Direction: start with on-the-fly LLM generation; it is affordable and flexible.
2. **How many Praise items should there be? Too many feel perfunctory; too few are not encouraging.**
   - Direction: one to three per submission, selected by AI.
3. **Binary correct/incorrect errors versus soft scoring?**
   - Decision: remain binary to avoid subjective scoring.
4. **Should a submission support version history after revision and resubmission?**
   - Direction: not in v1; reassess in v2 based on use.
5. **Should `micro_drill` count in error statistics?**
   - Decision: no; it is follow-up practice and must not pollute the main profile.

---

## 16. Out of Scope — Explicit Exclusions

To keep the product focused, the following features are **explicitly excluded** from v1 and require the change process to add:

- Listening / pronunciation training (other tools are better suited to speaking and listening)
- Video / audio content
- A dictionary itself (users should use WordReference / Larousse; Lumière should not duplicate it)
- Quiz / multiple-choice question types
- Flashcard / SRS review cards
- Mind-map / summary generation (overlaps with NotebookLM)
- Multiple languages (for now, only French → English/Chinese feedback for the user)
- Collaboration / sharing / teacher correction
- Native mobile app
- Offline work (unless a local model is added later)

---

## Appendices

### Appendix A. Complete Feedback-JSON Schema Example

```json
{
  "errors": [
    {
      "span": { "start": 23, "end": 30 },
      "original": "je vais",
      "correction": "j'allais",
      "category": "Grammar",
      "subcategory": "tense_choice",
      "trigger_context": "Quand j'étais enfant",
      "explanation_en": "The phrase 'Quand j'étais enfant' establishes a habitual past context, which requires the imparfait tense rather than the present.",
      "fr_examples": [
        "Quand j'étais petit, j'allais à l'école à pied.",
        "Elle allait souvent au marché le samedi."
      ],
      "rule_id": "imparfait_for_habitual_past",
      "micro_drill": "Write 2 more sentences starting with 'Quand j'étais...' using the imparfait."
    },
    {
      "span": { "start": 47, "end": 56 },
      "original": "le maison",
      "correction": "la maison",
      "category": "GenderAgreement",
      "subcategory": "noun_gender",
      "trigger_context": null,
      "explanation_en": "'Maison' is a feminine noun in French, so it requires the feminine definite article 'la'.",
      "fr_examples": [
        "La maison de mes parents est grande.",
        "Cette maison a été construite en 1920."
      ],
      "rule_id": "feminine_nouns_ending_in_son",
      "micro_drill": null
    }
  ],
  "improvements": [
    {
      "span": { "start": 80, "end": 95 },
      "original": "c'était bien",
      "suggestion": "c'était merveilleux",
      "explanation_en": "Stylistic upgrade: 'merveilleux' is more vivid than 'bien' for describing a memorable experience."
    }
  ],
  "praise": [
    "Great use of 'malgré tout' — natural placement and accurate meaning.",
    "Your sentence rhythm is improving — varied lengths feel more natural."
  ],
  "overall_level_estimate": "B1",
  "summary_en": "Tense usage is your main growth area — the same imparfait/passé composé confusion appeared in your last 4 submissions. Gender agreement is improving steadily."
}
```

### Appendix B. Writing-Task Prompt Template Example (v0.1 First Draft)

> System: You are an expert French teacher creating writing tasks for a student at level {{level}}. The student has just read the following text. Generate a writing task that requires the student to use specific vocabulary from the text and practice specific grammar points.
>
> User: Document title: {{title}}
> Document type: {{type}}
> Document excerpt: {{first_500_chars}}
>
> Vocabulary to incorporate (must be used): {{collected_words}}
> Grammar points to target (from learner's weak areas): {{weak_grammar_subcategories}}
>
> Output format (JSON, conform to TaskSchema):
> - prompt_en: A clear, engaging task instruction in English (2-3 sentences)
> - target_words: array of strings (subset of collected_words actually required)
> - target_grammar: array of subcategory IDs
> - difficulty: CEFR level
> - min_word_count: integer
> - max_word_count: integer

### Appendix C. Design Artifacts Accompanying This PRD

See the v0.1 mockups (delivered in conversation with the author and not committed to this repository):
- Library page
- Document Reader (including selection lookup popover)
- Practice / Feedback page
- Progress Dashboard

---

## Changelog

| Date | Version | Change |
|------|------|------|
| 2026-05-05 | v0.1 | Initial version, delivered alongside Sprint 1 |
| 2026-05-15 | v0.1.1 | **Sprint 3.5 decision synchronization:** (1) migrate the database from SQLite to Azure PostgreSQL and replace the §12.1 strong decision; (2) change `reading_sessions` to SET NULL, rather than cascade, when a document is deleted and add `documentTitleSnapshot`; (3) clarify §7.5's API-key balance test as key-validity validation plus a link to the OpenAI dashboard; (4) set the §7.1.2 error-chip destination to `/progress?documentId=<id>`; (5) add strong `target_words` constraints to §7.3.3 |

---

*This PRD was written by the author as Lumière's product constitution. Any implementation choice that conflicts with it must be explained explicitly in a PR and recorded in the changelog.*
