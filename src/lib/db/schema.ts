import { pgEnum, pgTable, text, integer, bigint, timestamp, jsonb, boolean, uuid, uniqueIndex, unique, index, primaryKey, foreignKey, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ReviewSnapshot } from "../review/types";
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

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Legacy Easy Auth identity, unread since Better Auth; dropped by the post-cutover cleanup.
    authIssuer: text("auth_issuer"),
    authSubject: text("auth_subject"),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("member"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    // Legacy flag copied into `banned` by 0037; unread, dropped with authIssuer.
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_auth_identity_key").on(t.authIssuer, t.authSubject),
    unique("users_email_unique").on(t.email),
    index("users_email_idx").on(t.email),
  ],
);

export type AppUser = typeof users.$inferSelect;

/* ------------------------------------------------------------------ */
/*  auth — Better Auth sessions, sign-in methods, codes, rate limits    */
/*  Property names must match Better Auth's field names exactly.        */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sessions_token_key").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("accounts_provider_account_key").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [unique("rate_limits_key_key").on(t.key)],
);

/* ------------------------------------------------------------------ */
/*  documents — your library of French source material                 */
/* ------------------------------------------------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
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
  },
  (t) => [index("documents_user_id_idx").on(t.userId)],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

/* ------------------------------------------------------------------ */
/*  reading_sessions — captures vocab looked up while reading a doc    */
/* ------------------------------------------------------------------ */

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    documentId: text("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** Snapshot of the document title at session creation time — preserved after document deletion. */
    documentTitleSnapshot: text("document_title_snapshot"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
  },
  (t) => [index("reading_sessions_user_id_idx").on(t.userId)],
);

export type ReadingSession = typeof readingSessions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  writing_tasks — AI-generated prompts anchored to a document        */
/* ------------------------------------------------------------------ */

export const writingTasks = pgTable("writing_tasks", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  documentId: text("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  promptEn: text("prompt_en").notNull(),
  /** JSON string[] — vocab the user must use */
  targetWords: jsonb("target_words").notNull().$type<string[]>(),
  /** JSON string[] — taxonomy subcategory ids the task targets */
  targetGrammar: jsonb("target_grammar").notNull().$type<string[]>(),
  /** JSON string[] — production-gap lemmas the prompt was asked to elicit; null when none were active */
  targetLemmas: jsonb("target_lemmas").$type<string[]>(),
  difficulty: text("difficulty"),
  minWordCount: integer("min_word_count").notNull().default(50),
  maxWordCount: integer("max_word_count").notNull().default(200),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("writing_tasks_user_id_idx").on(t.userId)]);

export type WritingTask = typeof writingTasks.$inferSelect;

/* ------------------------------------------------------------------ */
/*  submissions — what the user wrote in response to a task            */
/* ------------------------------------------------------------------ */

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
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
  (t) => [
    index("submissions_task_id_idx").on(t.taskId),
    index("submissions_user_id_idx").on(t.userId),
  ],
);

export type Submission = typeof submissions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  errors — THE SOUL TABLE — every classified error from the AI       */
/* ------------------------------------------------------------------ */

export const errors = pgTable(
  "errors",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
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
    index("errors_user_id_idx").on(t.userId),
    index("errors_category_subcategory_idx").on(t.category, t.subcategory),
    index("errors_created_at_idx").on(t.createdAt),
    unique("errors_user_id_id_key").on(t.userId, t.id),
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
    userId: uuid("user_id").notNull().references(() => users.id),
    runItemId: uuid("run_item_id").unique().references((): AnyPgColumn => practiceRunItems.id, { onDelete: "set null" }),
    errorId: text("error_id")
      .notNull()
      .references(() => errors.id, { onDelete: "cascade" }),
    /** The drill prompt shown to the user — snapshotted from errors.microDrill at creation time. */
    promptText: text("prompt_text").notNull(),
    /** The user's 2-sentence French response. NFC-normalised before insert. */
    responseFr: text("response_fr").notNull(),
    /** Light AI feedback packet — see MicroDrillFeedbackSchema. */
    feedbackJson: jsonb("feedback_json").$type<MicroDrillFeedback>(),
    feedbackStatus: text("feedback_status").notNull().default("ready"),
    feedbackAttempts: integer("feedback_attempts").notNull().default(0),
    feedbackLeaseUntil: timestamp("feedback_lease_until", { withTimezone: true }),
    requestKey: text("request_key"),
    requestHash: text("request_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("micro_drills_error_id_idx").on(t.errorId),
    index("micro_drills_user_id_idx").on(t.userId),
    uniqueIndex("micro_drills_user_request_key").on(t.userId, t.requestKey),
    foreignKey({ columns: [t.userId, t.errorId], foreignColumns: [errors.userId, errors.id], name: "micro_drills_user_error_fk" }).onDelete("cascade"),
  ],
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

/** Per-user vocabulary state. The legacy contextual fields remain on
 * vocabulary_lookups for one recovery window, but application reads/writes use
 * this table so private contexts and learning state never cross users. */
export const userVocabulary = pgTable(
  "user_vocabulary",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    lemma: text("lemma")
      .notNull()
      .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    pos: text("pos"),
    translation: text("translation"),
    cefrLevel: text("cefr_level"),
    inContext: text("in_context"),
    examples: jsonb("examples").$type<string[]>(),
    conjugation: text("conjugation"),
    sentenceContext: text("sentence_context"),
    richEntry: jsonb("rich_entry").$type<FrenchVocabEntry>(),
    enrichedAt: timestamp("enriched_at"),
    lookedUpAt: timestamp("looked_up_at").notNull().defaultNow(),
    savedAt: timestamp("saved_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.lemma] }),
    index("user_vocabulary_user_saved_idx").on(t.userId, t.savedAt),
    index("user_vocabulary_user_looked_up_idx").on(t.userId, t.lookedUpAt),
  ],
);

export type UserVocabulary = typeof userVocabulary.$inferSelect;

export const vocabSourceEnum = pgEnum("vocab_source", ["reading", "tcf"]);

export const vocabularyAliases = pgTable("vocabulary_aliases", {
  /** NFC + lowercase surface form, e.g. "fait" */
  surface: text("surface").primaryKey(),
  lemma: text("lemma")
    .notNull()
    .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** User-created surface-to-lemma mappings. Global vocabularyAliases remains
 * read-only application data so one learner cannot influence another's lookup. */
export const userVocabularyAliases = pgTable(
  "user_vocabulary_aliases",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    surface: text("surface").notNull(),
    lemma: text("lemma").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.surface] }),
    foreignKey({
      columns: [t.userId, t.lemma],
      foreignColumns: [userVocabulary.userId, userVocabulary.lemma],
      name: "user_vocab_alias_user_lemma_fk",
    }).onDelete("cascade"),
    index("user_vocab_alias_user_lemma_idx").on(t.userId, t.lemma),
  ],
);

export const vocabularyOccurrences = pgTable(
  "vocabulary_occurrences",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
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
      .on(t.userId, t.lemma, t.sourceType, t.documentId, t.tcfQuestionId)
      .nullsNotDistinct(),
    foreignKey({
      columns: [t.userId, t.lemma],
      foreignColumns: [userVocabulary.userId, userVocabulary.lemma],
      name: "vocab_occ_user_lemma_fk",
    }).onDelete("cascade"),
    index("vocab_occ_user_lemma_idx").on(t.userId, t.lemma),
  ],
);

export type VocabularyOccurrence = typeof vocabularyOccurrences.$inferSelect;

/* ------------------------------------------------------------------ */
/*  vocabulary_gaps — per-(lemma, skill-dimension) knowledge gaps      */
/*  Historical design: docs/archive/specs/2026-08-31-vocab-gap-profile-design.md */
/* ------------------------------------------------------------------ */

export const vocabGapTypeEnum = pgEnum("vocab_gap_type", [
  "listening",     // Understands in text but not by ear
  "recognition",   // Does not recognize it on sight
  "production",    // Understands it but cannot produce it
]);

export const vocabGapSourceEnum = pgEnum("vocab_gap_source", ["lookup", "feedback", "manual"]);

export const vocabGapStatusEnum = pgEnum("vocab_gap_status", ["active", "mastered", "dismissed"]);

export const vocabularyGaps = pgTable(
  "vocabulary_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    lemma: text("lemma")
      .notNull()
      .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
    gapType: vocabGapTypeEnum("gap_type").notNull(),
    source: vocabGapSourceEnum("source").notNull(),
    status: vocabGapStatusEnum("status").notNull().default("active"),
    /** Leitner box 1–5 */
    box: integer("box").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("vocab_gaps_user_lemma_type_key").on(t.userId, t.lemma, t.gapType),
    unique("vocab_gaps_user_id_id_key").on(t.userId, t.id),
    foreignKey({
      columns: [t.userId, t.lemma],
      foreignColumns: [userVocabulary.userId, userVocabulary.lemma],
      name: "vocab_gaps_user_lemma_fk",
    }).onDelete("cascade"),
    index("vocab_gaps_user_status_due_idx").on(t.userId, t.status, t.dueAt),
  ],
);

export type VocabularyGap = typeof vocabularyGaps.$inferSelect;
export type VocabGapType = (typeof vocabGapTypeEnum.enumValues)[number];
export type VocabGapStatus = (typeof vocabGapStatusEnum.enumValues)[number];

export const vocabularyReviewAttempts = pgTable("vocabulary_review_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
    runItemId: uuid("run_item_id").unique().references((): AnyPgColumn => practiceRunItems.id, { onDelete: "set null" }),
  gapId: uuid("gap_id").notNull().references(() => vocabularyGaps.id, { onDelete: "cascade" }),
  answer: text("answer"),
  correct: boolean("correct").notNull(),
  gradingMethod: text("grading_method").notNull(),
  boxBefore: integer("box_before").notNull(),
  boxAfter: integer("box_after").notNull(),
  statusAfter: vocabGapStatusEnum("status_after").notNull(),
  requestKey: text("request_key"),
  requestHash: text("request_hash"),
  policyVersion: integer("policy_version").notNull().default(1),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("vocab_review_attempts_user_gap_time").on(t.userId, t.gapId, t.answeredAt),
  uniqueIndex("vocab_review_attempts_user_request_key").on(t.userId, t.requestKey),
  foreignKey({ columns: [t.userId, t.gapId], foreignColumns: [vocabularyGaps.userId, vocabularyGaps.id], name: "vocab_review_attempts_user_gap_fk" }).onDelete("cascade"),
]);

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

export const quizSets = pgTable(
  "quiz_sets",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** Exam system identifier: 'TCF' | 'TEF' | 'DELF_B1' | 'podcast' | 'conjugation' … */
    exam: text("exam").notNull(),
    /** Paper number within the exam series, e.g. TCF blanc nº 3 */
    number: integer("number"),
    section: quizSectionEnum("section").notNull(),
    title: text("title").notNull(),
    /** Source material / podcast name */
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("quiz_sets_user_id_created_at_idx").on(t.userId, t.createdAt), unique("quiz_sets_user_id_id_key").on(t.userId, t.id)],
);

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
    userId: uuid("user_id").notNull().references(() => users.id),
    setId: text("set_id")
      .notNull()
      .references(() => quizSets.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    requestKey: text("request_key"),
    requestHash: text("request_hash"),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [
    index("quiz_attempts_set_id_idx").on(t.setId),
    index("quiz_attempts_user_id_answered_at_idx").on(t.userId, t.answeredAt),
    uniqueIndex("quiz_attempts_user_request_key").on(t.userId, t.requestKey),
    unique("quiz_attempts_user_id_id_key").on(t.userId, t.id),
    foreignKey({ columns: [t.userId, t.setId], foreignColumns: [quizSets.userId, quizSets.id], name: "quiz_attempts_user_set_fk" }).onDelete("cascade"),
  ],
);

export type QuizAttempt = typeof quizAttempts.$inferSelect;

export const quizQuestionAttempts = pgTable("quiz_question_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
    runItemId: uuid("run_item_id").unique().references((): AnyPgColumn => practiceRunItems.id, { onDelete: "set null" }),
  attemptId: text("attempt_id").references(() => quizAttempts.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull().references(() => quizQuestions.id, { onDelete: "cascade" }),
  answer: jsonb("answer").notNull().$type<string | number>(),
  correct: boolean("correct").notNull(),
  uncertain: boolean("uncertain").notNull().default(false),
  graderVersion: integer("grader_version").notNull().default(1),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("quiz_question_attempts_attempt_question").on(t.attemptId, t.questionId),
  index("quiz_question_attempts_user_question_time").on(t.userId, t.questionId, t.answeredAt),
  foreignKey({ columns: [t.userId, t.attemptId], foreignColumns: [quizAttempts.userId, quizAttempts.id], name: "quiz_question_attempts_user_attempt_fk" }).onDelete("cascade"),
]);

/* ------------------------------------------------------------------ */
/*  conjugation_attempts — drill history; the answer key itself is     */
/*  computed at runtime from the french-verbs library (D-7), never     */
/*  stored as a data table                                             */
/* ------------------------------------------------------------------ */

export const conjugationAttempts = pgTable(
  "conjugation_attempts",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    runItemId: uuid("run_item_id").unique().references((): AnyPgColumn => practiceRunItems.id, { onDelete: "set null" }),
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
    requestKey: text("request_key"),
    requestHash: text("request_hash"),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [
    index("conjugation_attempts_verb_tense_idx").on(t.verb, t.tense),
    index("conjugation_attempts_user_id_answered_at_idx").on(t.userId, t.answeredAt),
    uniqueIndex("conjugation_attempts_user_request_key").on(t.userId, t.requestKey),
  ],
);

export type ConjugationAttempt = typeof conjugationAttempts.$inferSelect;

/* ------------------------------------------------------------------ */
/*  user_settings — key/value store for per-user preferences           */
/* ------------------------------------------------------------------ */

export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    /** Stable key, e.g. "cefr_level" */
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

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

/** The structured verdict header of a hand-written explanation — see CLAUDE.md's TCF explanation authoring guide. */
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
  /** Structured head of the explanation — the verdict section. Drives the verdict
   *  bar and the per-option one-liners, which the full markdown cannot: it is
   *  one opaque blob to the renderer. null = the explanation has no verdict section. */
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
    userId: uuid("user_id").notNull().references(() => users.id),
    // set null (not cascade) so attempt history survives a set being re-imported/removed
    setId: uuid("set_id").references(() => tcfSets.id, { onDelete: "set null" }),
    // Denormalised for display after a set is gone
    skill: tcfSkillEnum("skill").notNull(),
    testNumber: integer("test_number").notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    perLevel: jsonb("per_level").$type<TcfPerLevel>(),
    requestKey: text("request_key"),
    requestHash: text("request_hash"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tcf_attempts_set_id_idx").on(t.setId),
    index("tcf_attempts_user_id_answered_at_idx").on(t.userId, t.answeredAt),
    uniqueIndex("tcf_attempts_user_request_key").on(t.userId, t.requestKey),
    unique("tcf_attempts_user_id_id_key").on(t.userId, t.id),
  ],
);

export type TcfAttempt = typeof tcfAttempts.$inferSelect;

/* One row per answered question — drill answers write-through, exam answers
 * batch on submit. The foundation of the TCF error loop (spec §3.1). */
export const tcfAttemptModeEnum = pgEnum("tcf_attempt_mode", ["drill", "review", "exam"]);

export const tcfQuestionAttempts = pgTable(
  "tcf_question_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    runItemId: uuid("run_item_id").unique().references((): AnyPgColumn => practiceRunItems.id, { onDelete: "set null" }),
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
    gradeVersion: integer("grade_version"),
    requestKey: text("request_key"),
    requestHash: text("request_hash"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tcf_qa_question_id_idx").on(t.questionId),
    index("tcf_qa_answered_at_idx").on(t.answeredAt),
    index("tcf_qa_exam_attempt_id_idx").on(t.examAttemptId),
    index("tcf_qa_user_id_answered_at_idx").on(t.userId, t.answeredAt),
    uniqueIndex("tcf_qa_user_request_key").on(t.userId, t.requestKey),
    // Existing examAttemptId FK sets only that nullable column to null on deletion.
    // Keep the owner intact while checking parent ownership whenever an exam is linked.
    foreignKey({ columns: [t.userId, t.examAttemptId], foreignColumns: [tcfAttempts.userId, tcfAttempts.id], name: "tcf_qa_user_exam_fk" }),
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

export const speakingScripts = pgTable(
  "speaking_scripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => speakingPrompts.id, { onDelete: "cascade" }),
    /** AI-generated reference script; user-editable */
    content: text("content").notNull(),
    /** speaking_profile value used at generation time */
    profileSnapshot: text("profile_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("speaking_scripts_user_id_prompt_id_idx").on(t.userId, t.promptId)],
);

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

export const speakingSessions = pgTable(
  "speaking_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    promptId: uuid("prompt_id")
      .references(() => speakingPrompts.id, { onDelete: "set null" }),
    mode: speakingModeEnum("mode").notNull(),
    status: speakingSessionStatusEnum("status").notNull().default("active"),
    /** End-of-session report (Phase 2: GPT content feedback) */
    report: jsonb("report"),
    scores: jsonb("scores").$type<SessionScores>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("speaking_sessions_user_id_started_at_idx").on(t.userId, t.startedAt)],
);

export type SpeakingSession = typeof speakingSessions.$inferSelect;

export const speakingTurns = pgTable(
  "speaking_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
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
    /** Nullable for historical/script retries; unique within new simulations. */
    requestKey: uuid("request_key"),
    /** Azure word-level assessment — user turns only */
    assessment: jsonb("assessment").$type<TurnAssessment>(),
    transcriptionDisputedAt: timestamp("transcription_disputed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("speaking_turns_user_id_session_id_idx").on(t.userId, t.sessionId),
    uniqueIndex("speaking_turns_session_request_key_idx").on(t.sessionId, t.requestKey),
  ],
);

export type SpeakingTurn = typeof speakingTurns.$inferSelect;

/** A simulation's state is separate from legacy sentence practice. */
export const speakingSimulations = pgTable("speaking_simulations", {
  sessionId: uuid("session_id").primaryKey().references(() => speakingSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  startRequestKey: uuid("start_request_key").notNull(),
  scenarioVersion: integer("scenario_version").notNull(),
  scenarioSnapshot: jsonb("scenario_snapshot").notNull().$type<{ title: string; instruction: string }>(),
  phase: text("phase").notNull().default("preparing"),
  revision: integer("revision").notNull().default(0),
  preparationEndsAt: timestamp("preparation_ends_at", { withTimezone: true }).notNull(),
  conversationStartedAt: timestamp("conversation_started_at", { withTimezone: true }),
  conversationEndsAt: timestamp("conversation_ends_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  finishReason: text("finish_reason"),
  excludedWaitMs: integer("excluded_wait_ms").notNull().default(0),
}, (t) => [
  index("speaking_simulations_user_id_idx").on(t.userId),
  uniqueIndex("speaking_simulations_user_start_key_idx").on(t.userId, t.startRequestKey),
]);

export const speakingAssets = pgTable("speaking_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  sessionId: uuid("session_id").notNull().references(() => speakingSessions.id, { onDelete: "cascade" }),
  turnId: uuid("turn_id").references(() => speakingTurns.id, { onDelete: "set null" }),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("speaking_assets_user_session_idx").on(t.userId, t.sessionId)]);

export type SpeakingPracticeFeedback = {
  summary: string;
  strengths: { text: string; turnId: string; quote: string }[];
  issues: { id: string; category: string; explanation: string; turnId: string; quote: string; example: string; drillId: string | null }[];
  limitations: string[];
};

export const speakingAssessments = pgTable("speaking_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  sessionId: uuid("session_id").notNull().references(() => speakingSessions.id, { onDelete: "cascade" }),
  transcriptRevision: integer("transcript_revision").notNull(),
  rubricVersion: integer("rubric_version").notNull().default(1),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<SpeakingPracticeFeedback>(),
  failure: text("failure"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("speaking_assessments_session_revision_idx").on(t.sessionId, t.transcriptRevision)]);

export const speakingFollowUps = pgTable("speaking_follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  assessmentId: uuid("assessment_id").notNull().references(() => speakingAssessments.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull(),
  drillId: text("drill_id").notNull(),
  prompt: text("prompt").notNull(),
  transcript: text("transcript"),
  audioPath: text("audio_path"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("speaking_follow_ups_assessment_idx").on(t.assessmentId),
  uniqueIndex("speaking_follow_ups_issue_idx").on(t.assessmentId, t.issueId),
]);

export const speakingOperations = pgTable("speaking_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  /** Retained after session deletion so deleting history cannot reset spending. */
  sessionId: uuid("session_id").references(() => speakingSessions.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  requestKey: uuid("request_key").notNull(),
  requestHash: text("request_hash"),
  status: text("status").notNull().default("reserved"),
  reservedCents: integer("reserved_cents").notNull(),
  actualCents: integer("actual_cents"),
  usage: jsonb("usage").$type<{ audioSeconds?: number; chatInputTokens?: number; chatOutputTokens?: number; speechCharacters?: number; latencyMs?: number }>(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("speaking_operations_request_idx").on(t.sessionId, t.kind, t.requestKey),
  index("speaking_operations_user_created_idx").on(t.userId, t.createdAt),
]);

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

export const reviewSourceEnum = pgEnum("review_source", ["tcf", "quiz", "writing", "vocabulary", "conjugation"]);
export const reviewManagementEnum = pgEnum("review_management", ["active", "paused", "archived"]);
export const reviewLearningEnum = pgEnum("review_learning", ["needs_practice", "consolidating", "stable"]);
export const reviewAvailabilityEnum = pgEnum("review_availability", ["ready", "feedback_pending", "disputed", "source_missing", "unsupported"]);

export const reviewItems = pgTable("review_items", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id),
  source: reviewSourceEnum("source").notNull(), sourceKey: text("source_key").notNull(),
  // Concrete deletion edges ensure private content is revoked even on a cascading source delete.
  tcfQuestionId: uuid("tcf_question_id").references(() => tcfQuestions.id, { onDelete: "cascade" }),
  quizQuestionId: text("quiz_question_id").references(() => quizQuestions.id, { onDelete: "cascade" }),
  errorId: text("error_id").references(() => errors.id, { onDelete: "cascade" }),
  gapId: uuid("gap_id").references(() => vocabularyGaps.id, { onDelete: "cascade" }),
  title: text("title").notNull(), skill: text("skill").notNull(), href: text("href").notNull(),
  management: reviewManagementEnum("management").notNull().default("active"), pauseUntil: timestamp("pause_until", { withTimezone: true }),
  note: text("note").notNull().default(""), disputedAt: timestamp("disputed_at", { withTimezone: true }), disputeReason: text("dispute_reason"),
  availability: reviewAvailabilityEnum("availability").notNull().default("ready"),
  learningState: reviewLearningEnum("learning_state").notNull().default("needs_practice"),
  dueAt: timestamp("due_at", { withTimezone: true }), eligibleAfter: timestamp("eligible_after", { withTimezone: true }),
  successCount: integer("success_count").notNull().default(0), policyVersion: integer("policy_version").notNull().default(1),
  revision: integer("revision").notNull().default(0), contentHash: text("content_hash").notNull(),
  firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
}, t => [unique("review_items_owner_source").on(t.userId, t.source, t.sourceKey), unique("review_items_owner_id").on(t.userId,t.id),
  index("review_items_due").on(t.userId,t.management,t.availability,t.dueAt,t.id),
  index("review_items_recent").on(t.userId,t.lastObservedAt,t.id),
  check("review_note_bound", sql`length(${t.note}) <= 2000`),
  foreignKey({ columns: [t.userId,t.errorId], foreignColumns: [errors.userId,errors.id], name: "review_items_owner_error" }).onDelete("cascade"),
  foreignKey({ columns: [t.userId,t.gapId], foreignColumns: [vocabularyGaps.userId,vocabularyGaps.id], name: "review_items_owner_gap" }).onDelete("cascade"),
]);
export type ReviewItem = typeof reviewItems.$inferSelect;

export const reviewEvidence = pgTable("review_evidence", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull(), itemId: uuid("item_id").notNull(),
  attemptId: text("attempt_id").notNull(), attemptType: text("attempt_type").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(), correct: boolean("correct"), uncertain: boolean("uncertain").notNull().default(false),
  valid: boolean("valid").notNull(), independent: boolean("independent").notNull().default(false), permitted: boolean("permitted").notNull().default(true),
  revealedAt: timestamp("revealed_at", { withTimezone: true }), provenance: text("provenance").notNull(),
}, t => [unique("review_evidence_once").on(t.userId,t.itemId,t.attemptType,t.attemptId),
  foreignKey({ columns: [t.userId,t.itemId], foreignColumns: [reviewItems.userId,reviewItems.id], name: "review_evidence_owner_item" }).onDelete("cascade"),
  index("review_evidence_history").on(t.userId,t.itemId,t.answeredAt),
]);
export const reviewChanges = pgTable("review_item_changes", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull(), itemId: uuid("item_id").notNull(),
  command: text("command").notNull(), requestKey: text("request_key").notNull(), requestHash: text("request_hash").notNull(),
  revision: integer("revision").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique("review_changes_request").on(t.userId,t.requestKey),
  foreignKey({ columns: [t.userId,t.itemId], foreignColumns: [reviewItems.userId,reviewItems.id], name: "review_changes_owner_item" }).onDelete("cascade")]);
export const reviewBackfillJobs = pgTable("review_backfill_jobs", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id),
  source: reviewSourceEnum("source").notNull(), cursor: text("cursor").notNull().default(""),
  cutoff: timestamp("cutoff", { withTimezone: true }).notNull().defaultNow(), fingerprint: text("fingerprint").notNull(),
  processed: integer("processed").notNull().default(0), unresolved: integer("unresolved").notNull().default(0),
  status: text("status", { enum: ["running","completed"] }).notNull().default("running"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practiceRuns = pgTable("practice_runs", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id),
  state: text("state", { enum: ["active","paused","completed","cancelled"] }).notNull().default("active"),
  revision: integer("revision").notNull().default(0), count: integer("count").notNull(),
  requestKey: text("request_key").notNull(), requestHash: text("request_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, t => [unique("practice_runs_owner_id").on(t.userId,t.id), unique("practice_runs_request").on(t.userId,t.requestKey),
  check("practice_run_count", sql`${t.count} between 1 and 20`)]);
export const practiceRunItems = pgTable("practice_run_items", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull(), runId: uuid("run_id").notNull(),
  // Scrubbing trigger clears private data before deletion of the source item.
  reviewItemId: uuid("review_item_id").references(() => reviewItems.id, { onDelete: "set null" }),
  position: integer("position").notNull(), snapshot: jsonb("snapshot").$type<ReviewSnapshot>(),
  state: text("state", { enum: ["pending","saved","blocked"] }).notNull().default("pending"),
  draft: jsonb("draft").$type<string | number | null>(), draftRevision: integer("draft_revision").notNull().default(0),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  attemptType: text("attempt_type"), attemptId: text("attempt_id"),
  correct: boolean("correct"), uncertain: boolean("uncertain").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
}, t => [unique("practice_item_position").on(t.runId,t.position), unique("practice_item_target").on(t.runId,t.reviewItemId),
  unique("practice_items_owner_id").on(t.userId,t.id),
  foreignKey({ columns: [t.userId,t.runId], foreignColumns: [practiceRuns.userId,practiceRuns.id], name: "practice_items_owner_run" }).onDelete("cascade"),
  foreignKey({ columns: [t.userId,t.reviewItemId], foreignColumns: [reviewItems.userId,reviewItems.id], name: "practice_items_owner_review" }),
]);
export const practiceRequests = pgTable("practice_requests", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull(), runId: uuid("run_id").notNull(),
  requestKey: text("request_key").notNull(), requestHash: text("request_hash").notNull(), command: text("command").notNull(),
  itemId: uuid("item_id"), revision: integer("revision").notNull(),
}, t => [unique("practice_request_once").on(t.userId,t.requestKey),
  foreignKey({ columns: [t.userId,t.runId], foreignColumns: [practiceRuns.userId,practiceRuns.id], name: "practice_request_owner_run" }).onDelete("cascade"),
  foreignKey({ columns: [t.userId,t.itemId], foreignColumns: [practiceRunItems.userId,practiceRunItems.id], name: "practice_request_owner_item" }).onDelete("cascade"),
]);
