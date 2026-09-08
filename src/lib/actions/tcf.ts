"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  tcfSets,
  tcfQuestions,
  tcfAttempts,
  tcfQuestionAttempts,
  tcfLevelEnum,
  vocabularyGaps,
  vocabularyOccurrences,
} from "@/lib/db/schema";
import type { TcfPerLevel, TcfAttempt, TcfExplanationMeta } from "@/lib/db/schema";
import { eq, and, asc, desc, inArray, isNotNull } from "drizzle-orm";
import {
  deriveTcfLearningSummary,
  type TcfLearningAttempt,
  type TcfQuestionLearningSummary,
} from "@/lib/tcf/learning";
import { requireUser } from "@/lib/auth/session";

export type TcfLevel = (typeof tcfLevelEnum.enumValues)[number];

export interface TcfSetWithCounts {
  id: string;
  testNumber: number;
  skill: "listening" | "reading";
  title: string;
  source: string | null;
  levelCounts: Record<TcfLevel, number>;
  totalCount: number;
}

export async function listTcfSets(skill: "listening" | "reading" = "listening"): Promise<TcfSetWithCounts[]> {
  await requireUser();
  const sets = await db
    .select()
    .from(tcfSets)
    .where(eq(tcfSets.skill, skill))
    .orderBy(asc(tcfSets.testNumber));

  if (sets.length === 0) return [];

  const allQuestions = await db
    .select({ setId: tcfQuestions.setId, level: tcfQuestions.level })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfSets.skill, skill));

  const countsBySet: Record<string, Record<TcfLevel, number>> = {};
  for (const q of allQuestions) {
    if (!countsBySet[q.setId]) {
      countsBySet[q.setId] = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    }
    countsBySet[q.setId][q.level as TcfLevel]++;
  }

  return sets.map((s) => {
    const lc = countsBySet[s.id] ?? { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    return {
      id: s.id,
      testNumber: s.testNumber,
      skill: s.skill,
      title: s.title,
      source: s.source,
      levelCounts: lc,
      totalCount: Object.values(lc).reduce((a, b) => a + b, 0),
    };
  });
}

export interface TcfLevelSummary {
  level: TcfLevel;
  total: number;
  sets: number;
}

/** Aggregate across all sets for the overview cards */
export async function getTcfLevelSummaries(skill: "listening" | "reading" = "listening"): Promise<TcfLevelSummary[]> {
  await requireUser();
  const sets = await db.select({ id: tcfSets.id }).from(tcfSets).where(eq(tcfSets.skill, skill));
  if (sets.length === 0) return [];

  const questions = await db
    .select({ level: tcfQuestions.level })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfSets.skill, skill));

  const counts: Record<TcfLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  for (const q of questions) {
    counts[q.level as TcfLevel]++;
  }

  const LEVELS: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return LEVELS.map((level) => ({ level, total: counts[level], sets: sets.length }));
}

export interface TcfLevelProgress {
  level: TcfLevel;
  /** Questions in this level, across every set. */
  total: number;
  /** Distinct questions answered at least once. */
  answered: number;
  /** 0–100 over the latest answer of each answered question, or null if none. */
  accuracy: number | null;
  needsReview: number;
}

export interface TcfSetProgress {
  total: number;
  answered: number;
  /** Most recent whole-exam run of this set, if any. */
  lastExam: { score: number; total: number } | null;
}

export interface TcfProgressOverview {
  byLevel: TcfLevelProgress[];
  /** Keyed by test number. */
  bySet: Record<number, TcfSetProgress>;
}

/**
 * One pass over a skill's questions and answer history, for the TCF overview.
 *
 * Accuracy deliberately uses each question's *latest* answer rather than all
 * attempts: a question drilled wrong three times and then learnt should read as
 * known, which is also the stance `deriveTcfLearningSummary` takes.
 */
export async function getTcfProgressOverview(
  skill: "listening" | "reading" = "listening",
): Promise<TcfProgressOverview> {
  const user = await requireUser();
  const LEVELS: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const empty = (): TcfProgressOverview => ({
    byLevel: LEVELS.map((level) => ({ level, total: 0, answered: 0, accuracy: null, needsReview: 0 })),
    bySet: {},
  });

  const questions = await db
    .select({
      id: tcfQuestions.id,
      level: tcfQuestions.level,
      testNumber: tcfSets.testNumber,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfSets.skill, skill));

  if (questions.length === 0) return empty();

  const [attempts, exams] = await Promise.all([
    db
      .select({
        id: tcfQuestionAttempts.id,
        questionId: tcfQuestionAttempts.questionId,
        correct: tcfQuestionAttempts.correct,
        uncertain: tcfQuestionAttempts.uncertain,
        answeredAt: tcfQuestionAttempts.answeredAt,
      })
      .from(tcfQuestionAttempts)
      .innerJoin(tcfQuestions, eq(tcfQuestionAttempts.questionId, tcfQuestions.id))
      .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
      .where(and(eq(tcfSets.skill, skill), eq(tcfQuestionAttempts.userId, user.id))),
    db
      .select({
        testNumber: tcfAttempts.testNumber,
        score: tcfAttempts.score,
        total: tcfAttempts.total,
        answeredAt: tcfAttempts.answeredAt,
      })
      .from(tcfAttempts)
      .where(and(eq(tcfAttempts.skill, skill), eq(tcfAttempts.userId, user.id)))
      .orderBy(asc(tcfAttempts.answeredAt)),
  ]);

  const attemptsByQuestion = new Map<string, TcfLearningAttempt[]>();
  for (const attempt of attempts) {
    const bucket = attemptsByQuestion.get(attempt.questionId);
    if (bucket) bucket.push(attempt);
    else attemptsByQuestion.set(attempt.questionId, [attempt]);
  }

  const levelStats = new Map<TcfLevel, { total: number; answered: number; correct: number; needsReview: number }>(
    LEVELS.map((level) => [level, { total: 0, answered: 0, correct: 0, needsReview: 0 }]),
  );
  const bySet: Record<number, TcfSetProgress> = {};

  for (const question of questions) {
    const level = levelStats.get(question.level as TcfLevel)!;
    level.total += 1;

    const set = (bySet[question.testNumber] ??= { total: 0, answered: 0, lastExam: null });
    set.total += 1;

    const history = attemptsByQuestion.get(question.id);
    if (!history) continue;

    const summary = deriveTcfLearningSummary(history);
    level.answered += 1;
    set.answered += 1;
    if (summary.latestCorrect) level.correct += 1;
    if (summary.needsReview) level.needsReview += 1;
  }

  // Ordered ascending, so the last row for a test number is its latest run.
  for (const exam of exams) {
    const set = bySet[exam.testNumber];
    if (set) set.lastExam = { score: exam.score, total: exam.total };
  }

  return {
    byLevel: LEVELS.map((level) => {
      const stats = levelStats.get(level)!;
      return {
        level,
        total: stats.total,
        answered: stats.answered,
        accuracy: stats.answered === 0 ? null : Math.round((stats.correct / stats.answered) * 100),
        needsReview: stats.needsReview,
      };
    }),
    bySet,
  };
}

export interface TcfQuestionForDrill {
  id: string;
  setId: string;
  testNumber: number;
  orderIndex: number;
  level: TcfLevel;
  type: "image" | "spoken_options" | "dialogue" | "reading_mcq";
  questionText: string;
  options: string[];
  answer: number;
  transcript: string | null;
  passage: string | null;
  explanation: string | null;
  explanationMeta: TcfExplanationMeta | null;
  imagePath: string | null;
  audioPath: string | null;
  skillTags: string[] | null;
}

export type TcfQuestionLearning = TcfQuestionLearningSummary & {
  questionId: string;
};

export type TcfDrillSessionKind = "10" | "20" | "review" | "all";

export type TcfQuestionAttemptHistory = {
  id: string;
  mode: "drill" | "review" | "exam";
  chosen: number;
  correct: boolean;
  uncertain: boolean;
  answeredAt: Date;
};

/** All questions of one test set, in exam order (1–39) */
export async function getTcfSetQuestions(
  skill: "listening" | "reading",
  testNumber: number,
): Promise<TcfQuestionForDrill[]> {
  await requireUser();
  const rows = await db
    .select({
      id: tcfQuestions.id,
      setId: tcfQuestions.setId,
      testNumber: tcfSets.testNumber,
      orderIndex: tcfQuestions.orderIndex,
      level: tcfQuestions.level,
      type: tcfQuestions.type,
      questionText: tcfQuestions.questionText,
      options: tcfQuestions.options,
      answer: tcfQuestions.answer,
      transcript: tcfQuestions.transcript,
      passage: tcfQuestions.passage,
      explanation: tcfQuestions.explanation,
      explanationMeta: tcfQuestions.explanationMeta,
      imagePath: tcfQuestions.imagePath,
      audioPath: tcfQuestions.audioPath,
      skillTags: tcfQuestions.skillTags,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfSets.testNumber, testNumber)))
    .orderBy(asc(tcfQuestions.orderIndex));

  return rows.map((r) => ({
    ...r,
    level: r.level as TcfLevel,
    type: r.type as TcfQuestionForDrill["type"],
    options: r.options as string[],
    answer: r.answer,
    skillTags: r.skillTags,
  }));
}

/** Resolve a question's skill + level from its id, so a bare `?q=<id>` deep link
 *  can open the correct drill group instead of falling back to listening/A2. */
export async function getTcfQuestionById(
  id: string,
): Promise<{ skill: "listening" | "reading"; level: TcfLevel } | null> {
  await requireUser();
  try {
    const row = (
      await db
        .select({ skill: tcfSets.skill, level: tcfQuestions.level })
        .from(tcfQuestions)
        .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
        .where(eq(tcfQuestions.id, id))
        .limit(1)
    )[0];
    return row ? { skill: row.skill, level: row.level as TcfLevel } : null;
  } catch {
    // Malformed id (not a uuid) → Postgres throws; treat as not found.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Exam attempts — the only TCF signal that flows into progress       */
/* ------------------------------------------------------------------ */

export type TcfExamAnswer = { questionId: string; chosen: number; correct: boolean };

export async function recordTcfExamAttempt(input: {
  setId: string | null;
  skill: "listening" | "reading";
  testNumber: number;
  score: number;
  total: number;
  perLevel: TcfPerLevel;
  /** Per-question detail; unanswered questions are simply absent. */
  answers?: TcfExamAnswer[];
}): Promise<void> {
  const user = await requireUser();
  const total = Math.max(0, Math.round(input.total));
  const score = Math.min(total, Math.max(0, Math.round(input.score)));
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(tcfAttempts)
      .values({
        userId: user.id,
        setId: input.setId,
        skill: input.skill,
        testNumber: input.testNumber,
        score,
        total,
        perLevel: input.perLevel,
      })
      .returning({ id: tcfAttempts.id });
    if (input.answers && input.answers.length > 0) {
      await tx.insert(tcfQuestionAttempts).values(
        input.answers.map((a) => ({
          userId: user.id,
          questionId: a.questionId,
          mode: "exam" as const,
          examAttemptId: attempt.id,
          chosen: a.chosen,
          correct: a.correct,
        })),
      );
    }
  });
  revalidatePath("/progress");
}

/** Drill write-through: one row per answered question. Fire-and-forget from
 *  the client — no revalidate, the drill page keeps its own local state. */
export async function recordTcfQuestionAttempt(input: {
  questionId: string;
  chosen: number;
  /** Kept for call-site compatibility; the server always calculates this from the stored answer. */
  correct?: boolean;
  uncertain?: boolean;
  mode?: "drill" | "review";
}): Promise<void> {
  const user = await requireUser();
  if (!Number.isFinite(input.chosen)) throw new Error("Réponse invalide.");
  const chosen = Math.max(0, Math.round(input.chosen));
  const [question] = await db
    .select({ answer: tcfQuestions.answer })
    .from(tcfQuestions)
    .where(eq(tcfQuestions.id, input.questionId))
    .limit(1);
  if (!question) throw new Error("Question TCF introuvable.");

  await db.insert(tcfQuestionAttempts).values({
    userId: user.id,
    questionId: input.questionId,
    mode: input.mode ?? "drill",
    chosen,
    correct: chosen === question.answer,
    uncertain: input.uncertain ?? false,
  });
  revalidateTcfLearningPaths();
}

function assertUuid(id: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} invalide.`);
  }
}

/** Removes exactly one historical answer. Learning summaries are always
 * derived from the remaining rows, so there is no cache to repair. */
export async function deleteTcfQuestionAttempt(attemptId: string): Promise<void> {
  const user = await requireUser();
  assertUuid(attemptId, "Identifiant de tentative");
  await db
    .delete(tcfQuestionAttempts)
    .where(and(eq(tcfQuestionAttempts.id, attemptId), eq(tcfQuestionAttempts.userId, user.id)));
  revalidateTcfLearningPaths();
}

/** Deliberately separate from deleting one row: callers must ask the learner
 * for a second explicit confirmation before invoking it. */
export async function resetTcfQuestionLearningHistory(questionId: string): Promise<void> {
  const user = await requireUser();
  assertUuid(questionId, "Identifiant de question");
  await db
    .delete(tcfQuestionAttempts)
    .where(and(eq(tcfQuestionAttempts.questionId, questionId), eq(tcfQuestionAttempts.userId, user.id)));
  revalidateTcfLearningPaths();
}

function revalidateTcfLearningPaths(): void {
  revalidatePath("/tcf");
  revalidatePath("/tcf/drill");
  revalidatePath("/tcf/review");
  revalidatePath("/progress");
}

/** Learning facts intentionally exclude mock-exam attempts. This keeps the
 * exam score history independent from the learner-controlled drill loop. */
export async function getTcfQuestionLearning(
  skill: "listening" | "reading",
  level: TcfLevel,
): Promise<TcfQuestionLearning[]> {
  const user = await requireUser();
  const questions = await db
    .select({ id: tcfQuestions.id })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfQuestions.level, level)));
  if (questions.length === 0) return [];

  const ids = questions.map((question) => question.id);
  const attempts = await db
    .select({
      id: tcfQuestionAttempts.id,
      questionId: tcfQuestionAttempts.questionId,
      correct: tcfQuestionAttempts.correct,
      uncertain: tcfQuestionAttempts.uncertain,
      answeredAt: tcfQuestionAttempts.answeredAt,
    })
    .from(tcfQuestionAttempts)
    .where(
      and(
        eq(tcfQuestionAttempts.userId, user.id),
        inArray(tcfQuestionAttempts.questionId, ids),
        inArray(tcfQuestionAttempts.mode, ["drill", "review"]),
      ),
    );

  const byQuestion = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const history = byQuestion.get(attempt.questionId) ?? [];
    history.push(attempt);
    byQuestion.set(attempt.questionId, history);
  }

  return ids.map((questionId) => ({
    questionId,
    ...deriveTcfLearningSummary(byQuestion.get(questionId) ?? []),
  }));
}

export async function getTcfQuestionHistory(questionId: string): Promise<TcfQuestionAttemptHistory[]> {
  const user = await requireUser();
  assertUuid(questionId, "Identifiant de question");
  const rows = await db
    .select({
      id: tcfQuestionAttempts.id,
      mode: tcfQuestionAttempts.mode,
      chosen: tcfQuestionAttempts.chosen,
      correct: tcfQuestionAttempts.correct,
      uncertain: tcfQuestionAttempts.uncertain,
      answeredAt: tcfQuestionAttempts.answeredAt,
    })
    .from(tcfQuestionAttempts)
    .where(
      and(
        eq(tcfQuestionAttempts.questionId, questionId),
        eq(tcfQuestionAttempts.userId, user.id),
      ),
    )
    .orderBy(desc(tcfQuestionAttempts.answeredAt));
  return rows.map((row) => ({ ...row, mode: row.mode as TcfQuestionAttemptHistory["mode"] }));
}

function schedulingRank(summary: TcfQuestionLearningSummary, now: Date): number {
  if (summary.needsReview && summary.nextReviewAt && summary.nextReviewAt <= now) return 0;
  if (summary.status === "unseen") return 1;
  if (summary.status === "in_progress") return 2;
  return 3;
}

/** Produces a non-repeating, bounded drill round within one skill × level. */
export async function getTcfScheduledDrillQuestions(
  skill: "listening" | "reading",
  level: TcfLevel,
  kind: TcfDrillSessionKind,
): Promise<{ questions: TcfQuestionForDrill[]; learning: TcfQuestionLearning[] }> {
  const user = await requireUser();
  const [questions, learning, gapQuestionRows] = await Promise.all([
    getTcfDrillQuestions(skill, level),
    getTcfQuestionLearning(skill, level),
    db
      .selectDistinct({ questionId: vocabularyOccurrences.tcfQuestionId })
      .from(vocabularyOccurrences)
      .innerJoin(
        vocabularyGaps,
        and(
          eq(vocabularyOccurrences.userId, vocabularyGaps.userId),
          eq(vocabularyOccurrences.lemma, vocabularyGaps.lemma),
        ),
      )
      .where(
        and(
          eq(vocabularyOccurrences.userId, user.id),
          eq(vocabularyGaps.userId, user.id),
          eq(vocabularyGaps.status, "active"),
          isNotNull(vocabularyOccurrences.tcfQuestionId),
        ),
      ),
  ]);
  const gapQuestionIds = new Set(gapQuestionRows.map((r) => r.questionId));
  const summaryById = new Map(learning.map((summary) => [summary.questionId, summary]));
  const now = new Date();
  const eligible = questions.filter((question) => {
    const summary = summaryById.get(question.id);
    return kind !== "review" || Boolean(summary?.needsReview && summary.nextReviewAt && summary.nextReviewAt <= now);
  });
  const ordered = eligible
    .map((question, position) => ({
      question,
      summary: summaryById.get(question.id)!,
      // `getTcfDrillQuestions` already returns exam order (test number, then
      // question number); keeping the position makes that the tie-breaker.
      position,
    }))
    .sort((a, b) => {
      // "Toutes" browses the whole group and drops nothing, so ranking there
      // would only scatter answered questions to the end of an otherwise
      // sequential walk — and strand a `?q=` deep link on the last position.
      const rankDifference = kind === "all" ? 0 : schedulingRank(a.summary, now) - schedulingRank(b.summary, now);
      if (rankDifference !== 0) return rankDifference;
      const gapBoost = Number(gapQuestionIds.has(b.question.id)) - Number(gapQuestionIds.has(a.question.id));
      if (kind !== "all" && gapBoost !== 0) return gapBoost;
      if (a.summary.needsReview && b.summary.needsReview) {
        return (a.summary.lastAnsweredAt?.getTime() ?? 0) - (b.summary.lastAnsweredAt?.getTime() ?? 0);
      }
      return a.position - b.position;
    });
  const size = kind === "10" ? 10 : kind === "20" ? 20 : ordered.length;
  return { questions: ordered.slice(0, size).map(({ question }) => question), learning };
}

export async function getTcfReviewCount(
  skill: "listening" | "reading",
  level?: TcfLevel,
): Promise<number> {
  await requireUser();
  if (level) return (await getTcfQuestionLearning(skill, level)).filter((summary) => summary.needsReview).length;
  const levels: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const counts = await Promise.all(levels.map((currentLevel) => getTcfReviewCount(skill, currentLevel)));
  return counts.reduce((total, count) => total + count, 0);
}

export async function getTcfReviewQueue(filters: {
  skill?: "listening" | "reading";
  level?: TcfLevel;
  tag?: string;
} = {}): Promise<Array<TcfQuestionForDrill & { skill: "listening" | "reading"; learning: TcfQuestionLearning }>> {
  await requireUser();
  const skills: Array<"listening" | "reading"> = filters.skill ? [filters.skill] : ["listening", "reading"];
  const levels: TcfLevel[] = filters.level ? [filters.level] : ["A1", "A2", "B1", "B2", "C1", "C2"];
  const groups = await Promise.all(skills.flatMap((skill) => levels.map(async (level) => {
    const session = await getTcfScheduledDrillQuestions(skill, level, "review");
    const learningById = new Map(session.learning.map((item) => [item.questionId, item]));
    return session.questions.map((question) => ({ question, learning: learningById.get(question.id)!, skill }));
  })));
  return groups.flat().filter(({ question }) => !filters.tag || question.skillTags?.includes(filters.tag)).map(({ question, learning, skill }) => ({ ...question, learning, skill }));
}

/** Question ids of a drill group with at least one recorded attempt — the
 *  DB-derived "done" marks that replaced the old localStorage set. */
export async function getTcfDoneQuestionIds(
  skill: "listening" | "reading",
  level: TcfLevel,
): Promise<string[]> {
  const user = await requireUser();
  const rows = await db
    .selectDistinct({ questionId: tcfQuestionAttempts.questionId })
    .from(tcfQuestionAttempts)
    .innerJoin(tcfQuestions, eq(tcfQuestionAttempts.questionId, tcfQuestions.id))
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(
      and(
        eq(tcfSets.skill, skill),
        eq(tcfQuestions.level, level),
        eq(tcfQuestionAttempts.userId, user.id),
      ),
    );
  return rows.map((r) => r.questionId);
}

export async function listRecentTcfAttempts(limit = 10): Promise<TcfAttempt[]> {
  const user = await requireUser();
  return db
    .select()
    .from(tcfAttempts)
    .where(eq(tcfAttempts.userId, user.id))
    .orderBy(desc(tcfAttempts.answeredAt))
    .limit(limit);
}

export async function getTcfDrillQuestions(
  skill: "listening" | "reading",
  level: TcfLevel,
): Promise<TcfQuestionForDrill[]> {
  await requireUser();
  const rows = await db
    .select({
      id: tcfQuestions.id,
      setId: tcfQuestions.setId,
      testNumber: tcfSets.testNumber,
      orderIndex: tcfQuestions.orderIndex,
      level: tcfQuestions.level,
      type: tcfQuestions.type,
      questionText: tcfQuestions.questionText,
      options: tcfQuestions.options,
      answer: tcfQuestions.answer,
      transcript: tcfQuestions.transcript,
      passage: tcfQuestions.passage,
      explanation: tcfQuestions.explanation,
      explanationMeta: tcfQuestions.explanationMeta,
      imagePath: tcfQuestions.imagePath,
      audioPath: tcfQuestions.audioPath,
      skillTags: tcfQuestions.skillTags,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfQuestions.level, level)))
    .orderBy(asc(tcfSets.testNumber), asc(tcfQuestions.orderIndex));

  return rows.map((r) => ({
    ...r,
    level: r.level as TcfLevel,
    type: r.type as TcfQuestionForDrill["type"],
    options: r.options as string[],
    answer: r.answer,
    skillTags: r.skillTags,
  }));
}
