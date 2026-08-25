import { pgEnum, pgTable, text, integer, timestamp, jsonb, boolean, uuid, uniqueIndex, unique, index } from "drizzle-orm/pg-core";
// Type-only imports (erased at build — they do NOT pull the OpenAI SDK into the
// schema module, so drizzle-kit stays unaffected).
import type { FeedbackResult } from "../ai/feedback";
import type { FrenchVocabEntry } from "../ai/enrich";
import type { MicroDrillFeedback } from "../ai/micro-drill";

/* ------------------------------------------------------------------ */
/*  Enums                                                               */
/* ------------------------------------------------------------------ */

export const documentTypeEnum = pgEnum("document_type", [
  "news",
  "literature",
  "personal",
  "other",
]);

/* ------------------------------------------------------------------ */
/*  documents — your library of French source material                 */
/* ------------------------------------------------------------------ */

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source"),
  sourceUrl: text("source_url"),
  type: documentTypeEnum("type").notNull().default("other"),
  /** Raw French text. Paragraph breaks preserved with \n\n. */
  content: text("content").notNull(),
  language: text("language").notNull().default("fr"),
  estimatedLevel: text("estimated_level"),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
  /** 0 - 100, updated by Document Reader as user scrolls. */
  readingProgress: integer("reading_progress").notNull().default(0),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

/* ------------------------------------------------------------------ */
/*  reading_sessions — captures vocab looked up while reading a doc    */
/* ------------------------------------------------------------------ */

export const readingSessions = pgTable("reading_sessions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  /** Snapshot of the document title at session creation time — preserved after document deletion. */
  documentTitleSnapshot: text("document_title_snapshot"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
});

export type ReadingSession = typeof readingSessions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  writing_tasks — AI-generated prompts anchored to a document        */
/* ------------------------------------------------------------------ */

export const writingTasks = pgTable("writing_tasks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  promptEn: text("prompt_en").notNull(),
  /** JSON string[] — vocab the user must use */
  targetWords: jsonb("target_words").notNull().$type<string[]>(),
  /** JSON string[] — taxonomy subcategory ids the task targets */
  targetGrammar: jsonb("target_grammar").notNull().$type<string[]>(),
  difficulty: text("difficulty"),
  minWordCount: integer("min_word_count").notNull().default(50),
  maxWordCount: integer("max_word_count").notNull().default(200),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WritingTask = typeof writingTasks.$inferSelect;

/* ------------------------------------------------------------------ */
/*  submissions — what the user wrote in response to a task            */
/* ------------------------------------------------------------------ */

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => writingTasks.id, { onDelete: "cascade" }),
    contentFr: text("content_fr").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    /** Raw AI feedback packet for replay/debug — stored as JSON. */
    feedbackJson: jsonb("feedback_json").$type<FeedbackResult>(),
    estimatedLevel: text("estimated_level"),
    /** JSON string[] of praise sentences shown in the Praise card */
    praise: jsonb("praise").$type<string[]>(),
    summaryEn: text("summary_en"),
    /** Feedback lifecycle: 'pending' (generating in after()), 'ready', 'failed'.
     *  Default 'ready' so pre-existing rows render normally. */
    feedbackStatus: text("feedback_status").notNull().default("ready"),
  },
  (t) => [index("submissions_task_id_idx").on(t.taskId)],
);

export type Submission = typeof submissions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  errors — THE SOUL TABLE — every classified error from the AI       */
/* ------------------------------------------------------------------ */

export const errors = pgTable(
  "errors",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    spanStart: integer("span_start").notNull(),
    spanEnd: integer("span_end").notNull(),
    original: text("original").notNull(),
    correction: text("correction").notNull(),
    /** Top-level taxonomy key, e.g. "Grammar" */
    category: text("category").notNull(),
    /** Leaf taxonomy key, e.g. "tense_choice" */
    subcategory: text("subcategory").notNull(),
    triggerContext: text("trigger_context"),
    explanationEn: text("explanation_en").notNull(),
    /** JSON string[] of 2-3 French example sentences */
    frExamples: jsonb("fr_examples").$type<string[]>(),
    ruleId: text("rule_id"),
    microDrill: text("micro_drill"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("errors_submission_id_idx").on(t.submissionId),
    index("errors_category_subcategory_idx").on(t.category, t.subcategory),
    index("errors_created_at_idx").on(t.createdAt),
  ],
);

export type ErrorRecord = typeof errors.$inferSelect;

/* ------------------------------------------------------------------ */
/*  rules — knowledge base of grammar rules (referenced by errors)     */
/* ------------------------------------------------------------------ */

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  name: text("name").notNull(),
  descriptionEn: text("description_en").notNull(),
  /** JSON string[] of canonical example sentences */
  examples: jsonb("examples").$type<string[]>(),
});

export type Rule = typeof rules.$inferSelect;

/* ------------------------------------------------------------------ */
/*  micro_drills — practice attempts triggered from error cards        */
/* ------------------------------------------------------------------ */

export const microDrills = pgTable(
  "micro_drills",
  {
    id: text("id").primaryKey(),
    errorId: text("error_id")
      .notNull()
      .references(() => errors.id, { onDelete: "cascade" }),
    /** The drill prompt shown to the user — snapshotted from errors.microDrill at creation time. */
    promptText: text("prompt_text").notNull(),
    /** The user's 2-sentence French response. NFC-normalised before insert. */
    responseFr: text("response_fr").notNull(),
    /** Light AI feedback packet — see MicroDrillFeedbackSchema. */
    feedbackJson: jsonb("feedback_json").$type<MicroDrillFeedback>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("micro_drills_error_id_idx").on(t.errorId)],
);
export type MicroDrill = typeof microDrills.$inferSelect;

/* ------------------------------------------------------------------ */
/*  vocabulary_lookups — every word the user investigates              */
/* ------------------------------------------------------------------ */

export const vocabularyLookups = pgTable("vocabulary_lookups", {
  id: text("id").primaryKey(),
  /** NFC-lowercased dictionary lemma — global dedupe key */
  lemma: text("lemma").notNull().unique(),
  /** First-seen surface form (original casing) */
  surface: text("surface").notNull(),
  pos: text("pos"),
  translation: text("translation"),
  cefrLevel: text("cefr_level"),
  inContext: text("in_context"),
  /** JSON string[] of example sentences */
  examples: jsonb("examples").$type<string[]>(),
  conjugation: text("conjugation"),
  sentenceContext: text("sentence_context"),
  /** Full FrenchVocabEntry per verb_schema_spec.md — null until enriched */
  richEntry: jsonb("rich_entry").$type<FrenchVocabEntry>(),
  enrichedAt: timestamp("enriched_at"),
  lookedUpAt: timestamp("looked_up_at").notNull().defaultNow(),
  /** null = looked up only; non-null = explicitly saved */
  savedAt: timestamp("saved_at"),
});

export type VocabularyLookup = typeof vocabularyLookups.$inferSelect;

export const vocabSourceEnum = pgEnum("vocab_source", ["reading", "tcf"]);

export const vocabularyAliases = pgTable("vocabulary_aliases", {
  /** NFC + lowercase surface form, e.g. "fait" */
  surface: text("surface").primaryKey(),
  lemma: text("lemma")
    .notNull()
    .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vocabularyOccurrences = pgTable(
  "vocabulary_occurrences",
  {
    id: text("id").primaryKey(),
    lemma: text("lemma")
      .notNull()
      .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
    sourceType: vocabSourceEnum("source_type").notNull(),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    tcfQuestionId: uuid("tcf_question_id").references(() => tcfQuestions.id, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    sentenceContext: text("sentence_context"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // nullsNotDistinct: the always-null source column would otherwise make every row unique
    // and break dedupe (spec §3.3). unique().on() supports nullsNotDistinct; uniqueIndex does not.
    unique("vocab_occ_unique_idx")
      .on(t.lemma, t.sourceType, t.documentId, t.tcfQuestionId)
      .nullsNotDistinct(),
    index("vocab_occ_lemma_idx").on(t.lemma),
  ],
);

export type VocabularyOccurrence = typeof vocabularyOccurrences.$inferSelect;


/* ------------------------------------------------------------------ */
/*  Quiz engine — shared substrate for TCF / dictation / conjugation   */
/*  (PRD v0.2 §5 — strong decision D-0: one set of tables, no forks)   */
/* ------------------------------------------------------------------ */

export const quizSectionEnum = pgEnum("quiz_section", [
  "reading",
  "listening",
  "grammar",
  "vocabulary",
  "dictation",
  "conjugation",
]);

export const quizTypeEnum = pgEnum("quiz_type", [
  "single",
  "multi",
  "true_false",
  "fill_blank",
]);

/* ------------------------------------------------------------------ */
/*  quiz_sets — one exam paper / podcast episode / drill batch         */
/* ------------------------------------------------------------------ */

export const quizSets = pgTable("quiz_sets", {
  id: text("id").primaryKey(),
  /** Exam system identifier: 'TCF' | 'TEF' | 'DELF_B1' | 'podcast' | 'conjugation' … */
  exam: text("exam").notNull(),
  /** Paper number within the exam series, e.g. TCF blanc nº 3 */
  number: integer("number"),
  section: quizSectionEnum("section").notNull(),
  title: text("title").notNull(),
  /** Source material / podcast name */
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type QuizSet = typeof quizSets.$inferSelect;

/* ------------------------------------------------------------------ */
/*  quiz_passages — shared stimulus a group of questions hangs off     */
/* ------------------------------------------------------------------ */

export const quizPassages = pgTable(
  "quiz_passages",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => quizSets.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    /** Reading passage / listening script / podcast transcript */
    text: text("text").notNull(),
    /** TCF listening = local mp3 path; podcast = original remote URL */
    audioUrl: text("audio_url"),
    /** How the audio came to be: 'tts' | 'asr' */
    sourceType: text("source_type"),
    /** Podcast / source-material URL */
    sourceUrl: text("source_url"),
    /** Audio duration in seconds */
    mediaDuration: integer("media_duration"),
    /** Segment carved from the original audio — start (seconds) */
    segmentStart: integer("segment_start"),
    /** Segment end (seconds) */
    segmentEnd: integer("segment_end"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_passages_set_id_idx").on(t.setId)],
);

export type QuizPassage = typeof quizPassages.$inferSelect;

/* ------------------------------------------------------------------ */
/*  quiz_questions — typed questions; answer shape varies by type      */
/* ------------------------------------------------------------------ */

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: text("id").primaryKey(),
    passageId: text("passage_id")
      .notNull()
      .references(() => quizPassages.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    type: quizTypeEnum("type").notNull(),
    questionText: text("question_text").notNull(),
    /** JSON string[] for choice questions; null for fill_blank/true_false */
    options: jsonb("options").$type<string[]>(),
    /** Flexible answer (D-9): single=index, multi=index[], true_false=bool, fill_blank=string|string[] */
    answer: jsonb("answer").notNull(),
    explanation: text("explanation"),
    /** fill_blank: start of the blanked word in the audio (seconds) */
    audioStart: integer("audio_start"),
    /** fill_blank: end of the blanked word in the audio (seconds) */
    audioEnd: integer("audio_end"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_questions_passage_id_idx").on(t.passageId)],
);

export type QuizQuestion = typeof quizQuestions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  quiz_attempts — one row per completed run of a set (W-5)           */
/* ------------------------------------------------------------------ */

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => quizSets.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_attempts_set_id_idx").on(t.setId)],
);

export type QuizAttempt = typeof quizAttempts.$inferSelect;

/* ------------------------------------------------------------------ */
/*  conjugation_attempts — drill history; the answer key itself is     */
/*  computed at runtime from the french-verbs library (D-7), never     */
/*  stored as a data table                                             */
/* ------------------------------------------------------------------ */

export const conjugationAttempts = pgTable(
  "conjugation_attempts",
  {
    id: text("id").primaryKey(),
    /** Display infinitive, e.g. "se lever" */
    verb: text("verb").notNull(),
    /** One of the 6 drill tenses, e.g. "passé composé" */
    tense: text("tense").notNull(),
    /** 0–5 = je, tu, il/elle, nous, vous, ils/elles */
    person: integer("person").notNull(),
    /** What the learner typed (NFC-normalised) */
    userInput: text("user_input").notNull(),
    /** Canonical correct form snapshotted at answer time */
    expected: text("expected").notNull(),
    correct: boolean("correct").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [index("conjugation_attempts_verb_tense_idx").on(t.verb, t.tense)],
);

export type ConjugationAttempt = typeof conjugationAttempts.$inferSelect;

/* ------------------------------------------------------------------ */
/*  user_settings — key/value store for per-user preferences           */
/* ------------------------------------------------------------------ */

export const userSettings = pgTable("user_settings", {
  /** Stable key, e.g. "cefr_level" */
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserSetting = typeof userSettings.$inferSelect;

/* ------------------------------------------------------------------ */
/*  TCF — dedicated tables for Compréhension orale / écrite drills     */
/* ------------------------------------------------------------------ */

export const tcfSkillEnum = pgEnum("tcf_skill", ["listening", "reading"]);
export const tcfLevelEnum = pgEnum("tcf_level", ["A1", "A2", "B1", "B2", "C1", "C2"]);
export const tcfQuestionTypeEnum = pgEnum("tcf_question_type", [
  "image",
  "spoken_options",
  "dialogue",
  "reading_mcq",
]);

export const tcfSets = pgTable(
  "tcf_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testNumber: integer("test_number").notNull(),
    skill: tcfSkillEnum("skill").notNull(),
    title: text("title").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tcf_sets_test_skill_idx").on(t.testNumber, t.skill)],
);

export type TcfSet = typeof tcfSets.$inferSelect;

/** The "速判" head of a hand-written explanation — see CLAUDE.md 「写入单题 TCF 讲解」. */
export type TcfExplanationMeta = {
  /** One line naming what in the text decides the answer. */
  keyPoint: string | null;
  /** One line per option, positionally aligned with `options`; null where unwritten. */
  options: (string | null)[];
};

export const tcfQuestions = pgTable(
  "tcf_questions",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => tcfSets.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  level: tcfLevelEnum("level").notNull(),
  type: tcfQuestionTypeEnum("type").notNull(),
  /** Instruction text shown on screen */
  questionText: text("question_text").notNull(),
  /** string[4] — French option texts */
  options: jsonb("options").notNull().$type<string[]>(),
  /** 0-based index of the correct option */
  answer: integer("answer").notNull(),
  /** French transcript / dialogue text — fed to TTS later (listening only) */
  transcript: text("transcript"),
  /** Comprehension skill-tag ids (1–2, primary first) — see the TCF error-loop
   *  spec §3.3. null = not yet tagged (tagging script is a later step). */
  skillTags: jsonb("skill_tags").$type<string[]>(),
  /** Reading passage text — set for text-sourced reading questions (e.g. test 40 PDF); null when the passage is an image */
  passage: text("passage"),
  translationEn: text("translation_en"),
  explanation: text("explanation"),
  /** Structured head of the explanation — the "速判" section. Drives the verdict
   *  bar and the per-option one-liners, which the full markdown cannot: it is
   *  one opaque blob to the renderer. null = the explanation has no 速判 section. */
  explanationMeta: jsonb("explanation_meta").$type<TcfExplanationMeta>(),
  /** Relative path, e.g. /media/tcf/test1/q01.png */
  imagePath: text("image_path"),
  /** Relative path, e.g. /media/tcf/test1/q01.mp3 — filled after TTS */
  audioPath: text("audio_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tcf_questions_set_id_idx").on(t.setId)],
);

export type TcfQuestion = typeof tcfQuestions.$inferSelect;

/* Per-CEFR-level score breakdown for one exam run. */
export type TcfPerLevel = Record<string, { correct: number; total: number }>;

export const tcfAttempts = pgTable(
  "tcf_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // set null (not cascade) so attempt history survives a set being re-imported/removed
    setId: uuid("set_id").references(() => tcfSets.id, { onDelete: "set null" }),
    // Denormalised for display after a set is gone
    skill: tcfSkillEnum("skill").notNull(),
    testNumber: integer("test_number").notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    perLevel: jsonb("per_level").$type<TcfPerLevel>(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tcf_attempts_set_id_idx").on(t.setId)],
);

export type TcfAttempt = typeof tcfAttempts.$inferSelect;

/* One row per answered question — drill answers write-through, exam answers
 * batch on submit. The foundation of the TCF error loop (spec §3.1). */
export const tcfAttemptModeEnum = pgEnum("tcf_attempt_mode", ["drill", "review", "exam"]);

export const tcfQuestionAttempts = pgTable(
  "tcf_question_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade: re-importing a set wipes its per-question history — accepted
    // tradeoff (spec §2); whole-exam totals in tcf_attempts survive.
    questionId: uuid("question_id")
      .notNull()
      .references(() => tcfQuestions.id, { onDelete: "cascade" }),
    mode: tcfAttemptModeEnum("mode").notNull(),
    examAttemptId: uuid("exam_attempt_id").references(() => tcfAttempts.id, {
      onDelete: "set null",
    }),
    /** Chosen option index 0–3 */
    chosen: integer("chosen").notNull(),
    /** Denormalised on purpose: aggregations skip a join, and history keeps
     *  the verdict as judged even if a question's answer is later corrected. */
    correct: boolean("correct").notNull(),
    /** A correct guess still counts for accuracy, but is scheduled like a wrong answer. */
    uncertain: boolean("uncertain").notNull().default(false),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tcf_qa_question_id_idx").on(t.questionId),
    index("tcf_qa_answered_at_idx").on(t.answeredAt),
    index("tcf_qa_exam_attempt_id_idx").on(t.examAttemptId),
  ],
);

export type TcfQuestionAttempt = typeof tcfQuestionAttempts.$inferSelect;

/* ------------------------------------------------------------------ */
/*  Speaking — TCF Expression orale practice                           */
/* ------------------------------------------------------------------ */

export const speakingModeEnum = pgEnum("speaking_mode", ["script_practice", "simulation"]);
export const speakingSessionStatusEnum = pgEnum("speaking_session_status", [
  "active",
  "completed",
  "abandoned",
]);
export const speakingRoleEnum = pgEnum("speaking_role", ["examiner", "user"]);

export const speakingPrompts = pgTable(
  "speaking_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tâche number: 1 (entretien dirigé) | 2 (interaction) | 3 (point de vue) */
    task: integer("task").notNull(),
    /** Question / scenario card / opinion topic, in French */
    prompt: text("prompt").notNull(),
    /** Extra context, e.g. which role the examiner plays (Tâche 2) */
    context: text("context"),
    /** Source annotation, e.g. "test 12" */
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("speaking_prompts_task_prompt_idx").on(t.task, t.prompt)],
);

export type SpeakingPrompt = typeof speakingPrompts.$inferSelect;

export const speakingScripts = pgTable("speaking_scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => speakingPrompts.id, { onDelete: "cascade" }),
  /** AI-generated reference script; user-editable */
  content: text("content").notNull(),
  /** speaking_profile value used at generation time */
  profileSnapshot: text("profile_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpeakingScript = typeof speakingScripts.$inferSelect;

/** Azure word-level detail stored per user turn */
export type TurnAssessment = {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  words: {
    word: string;
    accuracyScore: number;
    errorType: string;
    phonemes: { phoneme: string; accuracyScore: number }[];
  }[];
};

/** Aggregated per-session scores (0–100) */
export type SessionScores = {
  accuracy: number;
  fluency: number;
  completeness: number;
  overall: number;
};

export const speakingSessions = pgTable("speaking_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => speakingPrompts.id, { onDelete: "cascade" }),
  mode: speakingModeEnum("mode").notNull(),
  status: speakingSessionStatusEnum("status").notNull().default("active"),
  /** End-of-session report (Phase 2: GPT content feedback) */
  report: jsonb("report"),
  scores: jsonb("scores").$type<SessionScores>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type SpeakingSession = typeof speakingSessions.$inferSelect;

export const speakingTurns = pgTable("speaking_turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => speakingSessions.id, { onDelete: "cascade" }),
  /** Script practice: sentence index. Simulation: dialogue turn order. */
  orderIndex: integer("order_index").notNull(),
  role: speakingRoleEnum("role").notNull(),
  /** Examiner line, or user speech transcript from Azure */
  text: text("text").notNull(),
  /** Relative path, e.g. /media/speaking/<sessionId>/003.wav */
  audioPath: text("audio_path"),
  /** Azure word-level assessment — user turns only */
  assessment: jsonb("assessment").$type<TurnAssessment>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpeakingTurn = typeof speakingTurns.$inferSelect;

/* ------------------------------------------------------------------ */
/*  grammar_points — A2–B1 grammar reference library                   */
/*  Outline (slug/name/level/category/mapping) lives in                */
/*  src/lib/grammar-outline.ts; AI drafts content as status='draft',   */
/*  the user verifies while reading.                                   */
/* ------------------------------------------------------------------ */

export const grammarPoints = pgTable(
  "grammar_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable key from the outline; used for URLs and idempotent generation. */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    level: text("level").notNull(), // 'A2' | 'B1'
    category: text("category").notNull(), // pedagogical group, see GRAMMAR_CATEGORIES
    orderIndex: integer("order_index").notNull(),
    summary: text("summary").notNull(),
    /** Markdown-lite: paragraphs, **bold**, *italic*, "- " bullets only. */
    descriptionEn: text("description_en").notNull(),
    examples: jsonb("examples").$type<{ fr: string; en: string }[]>().notNull(),
    /** ERROR_TAXONOMY leaf keys this point maps to (may be empty). */
    taxonomySubcategories: jsonb("taxonomy_subcategories").$type<string[]>().notNull(),
    status: text("status").notNull().default("draft"), // 'draft' | 'verified'
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grammar_points_category_order_idx").on(t.category, t.orderIndex)],
);

export type GrammarPoint = typeof grammarPoints.$inferSelect;
