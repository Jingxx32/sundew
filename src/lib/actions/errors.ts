"use server";

import { createHash, randomUUID } from "node:crypto";
import { eq, and, desc, count, inArray, gte, asc, lt, or, type SQL, sql } from "drizzle-orm";
import { format, parseISO, startOfWeek, addWeeks } from "date-fns";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { errors, submissions, writingTasks, documents, rules, microDrills } from "@/lib/db/schema";
import type { ErrorRecord, Rule, MicroDrill } from "@/lib/db/schema";
import type { ErrorCategory } from "@/lib/taxonomy";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import { evaluateMicroDrill } from "@/lib/ai/micro-drill";
import type { MicroDrillFeedback } from "@/lib/ai/micro-drill";
import { requireUser } from "@/lib/auth/session";

export type ErrorWithContext = ErrorRecord & {
  submissionContentFr: string;
  submissionId: string;
  submittedAt: Date;
  documentTitle: string | null;
  documentId: string | null;
  errorIndex: number;
};

export type MicroDrillView = Pick<MicroDrill, "id" | "errorId" | "promptText" | "responseFr" | "feedbackJson" | "feedbackStatus" | "createdAt">;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

async function resolveSubmissionIds(documentId: string, userId: string): Promise<string[] | null> {
  const tasks = await db
    .select({ id: writingTasks.id })
    .from(writingTasks)
    .where(and(eq(writingTasks.documentId, documentId), eq(writingTasks.userId, userId)));
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const subs = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(inArray(submissions.taskId, taskIds), eq(submissions.userId, userId)));
  return subs.map((s) => s.id);
}

/* ------------------------------------------------------------------ */
/*  listErrors                                                          */
/* ------------------------------------------------------------------ */

export async function listErrors(opts?: {
  category?: ErrorCategory;
  subcategory?: string;
  documentId?: string;
  limit?: number;
  offset?: number;
}): Promise<ErrorWithContext[]> {
  const user = await requireUser();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let allowedSubmissionIds: string[] | null = null;
  if (opts?.documentId) {
    allowedSubmissionIds = await resolveSubmissionIds(opts.documentId, user.id);
    if (allowedSubmissionIds !== null && allowedSubmissionIds.length === 0) return [];
  }

  const conditions: SQL[] = [eq(errors.userId, user.id)];
  if (opts?.category) conditions.push(eq(errors.category, opts.category));
  if (opts?.subcategory) conditions.push(eq(errors.subcategory, opts.subcategory));
  if (allowedSubmissionIds) conditions.push(inArray(errors.submissionId, allowedSubmissionIds));

  const errorRows = await db
    .select()
    .from(errors)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(errors.createdAt))
    .limit(limit)
    .offset(offset);

  if (errorRows.length === 0) return [];

  // Fetch related submissions
  const submissionIds = [...new Set(errorRows.map((e) => e.submissionId))];
  const submissionRows = await db
    .select()
    .from(submissions)
    .where(and(inArray(submissions.id, submissionIds), eq(submissions.userId, user.id)));
  const submissionMap = new Map(submissionRows.map((s) => [s.id, s]));

  // Fetch related tasks
  const taskIds = [...new Set(submissionRows.map((s) => s.taskId))];
  const taskRows =
    taskIds.length > 0
      ? await db
          .select()
          .from(writingTasks)
          .where(and(inArray(writingTasks.id, taskIds), eq(writingTasks.userId, user.id)))
      : [];
  const taskMap = new Map(taskRows.map((t) => [t.id, t]));

  // Fetch related documents
  const docIds = [
    ...new Set(taskRows.map((t) => t.documentId).filter(Boolean) as string[]),
  ];
  const docRows =
    docIds.length > 0
      ? await db
          .select({ id: documents.id, title: documents.title })
          .from(documents)
          .where(and(inArray(documents.id, docIds), eq(documents.userId, user.id)))
      : [];
  const docMap = new Map(docRows.map((d) => [d.id, d.title]));

  // Compute errorIndex: position within submission ordered by spanStart.
  // One query for all involved submissions (grouped/numbered in JS) instead of
  // one query per submission.
  const allSpanRows = await db
    .select({ id: errors.id, submissionId: errors.submissionId, spanStart: errors.spanStart })
    .from(errors)
    .where(and(inArray(errors.submissionId, submissionIds), eq(errors.userId, user.id)))
    .orderBy(asc(errors.submissionId), asc(errors.spanStart));

  const indexMaps = new Map<string, Map<string, number>>();
  const counters = new Map<string, number>();
  for (const row of allSpanRows) {
    let m = indexMaps.get(row.submissionId);
    if (!m) {
      m = new Map();
      indexMaps.set(row.submissionId, m);
    }
    const i = counters.get(row.submissionId) ?? 0;
    m.set(row.id, i);
    counters.set(row.submissionId, i + 1);
  }

  return errorRows.map((err) => {
    const submission = submissionMap.get(err.submissionId);
    const task = submission ? taskMap.get(submission.taskId) : undefined;
    const documentId = task?.documentId ?? null;
    const documentTitle = documentId ? (docMap.get(documentId) ?? null) : null;
    const errorIndex = indexMaps.get(err.submissionId)?.get(err.id) ?? 0;

    return {
      ...err,
      submissionContentFr: submission?.contentFr ?? "",
      submissionId: err.submissionId,
      submittedAt: submission?.submittedAt ?? err.createdAt,
      documentTitle,
      documentId,
      errorIndex,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  getErrorCounts                                                      */
/* ------------------------------------------------------------------ */

export async function getErrorCounts(opts?: {
  documentId?: string;
}): Promise<Record<ErrorCategory, number>> {
  const user = await requireUser();
  let allowedSubmissionIds: string[] | null = null;
  if (opts?.documentId) {
    allowedSubmissionIds = await resolveSubmissionIds(opts.documentId, user.id);
    if (allowedSubmissionIds !== null && allowedSubmissionIds.length === 0) {
      return Object.fromEntries(
        Object.keys(ERROR_TAXONOMY).map((k) => [k, 0]),
      ) as Record<ErrorCategory, number>;
    }
  }

  const conditions: SQL[] = [eq(errors.userId, user.id)];
  if (allowedSubmissionIds) {
    conditions.push(inArray(errors.submissionId, allowedSubmissionIds));
  }

  const rows = await db
    .select({ category: errors.category, count: count() })
    .from(errors)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(errors.category);

  const result = Object.fromEntries(
    Object.keys(ERROR_TAXONOMY).map((k) => [k, 0]),
  ) as Record<ErrorCategory, number>;

  for (const row of rows) {
    result[row.category as ErrorCategory] = Number(row.count);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  getMicroDrillsForError                                              */
/* ------------------------------------------------------------------ */

export async function getMicroDrillsForError(errorId: string): Promise<MicroDrillView[]> {
  const user = await requireUser();
  return db
    .select({
      id: microDrills.id,
      errorId: microDrills.errorId,
      promptText: microDrills.promptText,
      responseFr: microDrills.responseFr,
      feedbackJson: microDrills.feedbackJson,
      feedbackStatus: microDrills.feedbackStatus,
      createdAt: microDrills.createdAt,
    })
    .from(microDrills)
    .where(and(eq(microDrills.errorId, errorId), eq(microDrills.userId, user.id)))
    .orderBy(desc(microDrills.createdAt));
}

/* ------------------------------------------------------------------ */
/*  createMicroDrill                                                    */
/* ------------------------------------------------------------------ */

export async function createMicroDrill(
  errorId: string,
  responseFr: string,
  requestKey: string,
): Promise<MicroDrillView> {
  const user = await requireUser();
  if (!responseFr.trim() || responseFr.length > 1000) throw new Error("Response must contain 1–1000 characters.");
  if (!/^[a-zA-Z0-9-]{12,100}$/.test(requestKey)) throw new Error("Invalid request key");

  const errorRow = await db
    .select()
    .from(errors)
    .where(and(eq(errors.id, errorId), eq(errors.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!errorRow) throw new Error("Error not found.");

  const normalised = responseFr.normalize("NFC");
  const promptText = errorRow.microDrill ?? errorRow.explanationEn;
  const requestHash = createHash("sha256").update(JSON.stringify({ errorId, normalised })).digest("hex");
  const [created] = await db.insert(microDrills).values({
    id: randomUUID(),
    userId: user.id,
    errorId,
    promptText,
    responseFr: normalised,
    feedbackStatus: "pending",
    feedbackAttempts: 1,
    feedbackLeaseUntil: new Date(Date.now() + 5 * 60_000),
    requestKey,
    requestHash,
  }).onConflictDoNothing({ target: [microDrills.userId, microDrills.requestKey] })
    .returning({ id: microDrills.id });
  if (!created) {
    const [existing] = await db.select().from(microDrills).where(and(
      eq(microDrills.userId, user.id), eq(microDrills.requestKey, requestKey),
    )).limit(1);
    if (!existing || existing.requestHash !== requestHash) throw new Error("Request key was reused for another response");
    return toMicroDrillView(existing);
  }
  const saved = await evaluateSavedMicroDrill(created.id, user.id, errorRow);
  revalidatePath("/progress");
  revalidatePath("/review");
  return saved;
}

function toMicroDrillView(row: MicroDrill): MicroDrillView {
  return { id: row.id, errorId: row.errorId, promptText: row.promptText,
    responseFr: row.responseFr, feedbackJson: row.feedbackJson,
    feedbackStatus: row.feedbackStatus, createdAt: row.createdAt };
}

async function evaluateSavedMicroDrill(id: string, userId: string, errorRow: ErrorRecord): Promise<MicroDrillView> {
  const [saved] = await db.select().from(microDrills).where(and(eq(microDrills.id, id), eq(microDrills.userId, userId))).limit(1);
  if (!saved) throw new Error("Saved response was not found");
  let feedback: MicroDrillFeedback;
  try {
    feedback = await evaluateMicroDrill(saved.promptText, errorRow.original, errorRow.correction, saved.responseFr);
  } catch {
    const [failed] = await db.update(microDrills).set({ feedbackStatus: "failed", feedbackLeaseUntil: null })
      .where(and(eq(microDrills.id, id), eq(microDrills.userId, userId),
        eq(microDrills.feedbackAttempts, saved.feedbackAttempts), eq(microDrills.feedbackStatus, "pending")))
      .returning();
    return failed ? toMicroDrillView(failed) : readCurrentMicroDrill(id, userId);
  }
  // A lease can expire while the provider is still running. Only the generation
  // that started this call may publish; late success/failure must not overwrite a retry.
  const [ready] = await db.update(microDrills).set({ feedbackJson: feedback, feedbackStatus: "ready", feedbackLeaseUntil: null })
    .where(and(eq(microDrills.id, id), eq(microDrills.userId, userId),
      eq(microDrills.feedbackAttempts, saved.feedbackAttempts), eq(microDrills.feedbackStatus, "pending")))
    .returning();
  return ready ? toMicroDrillView(ready) : readCurrentMicroDrill(id, userId);
}

async function readCurrentMicroDrill(id: string, userId: string): Promise<MicroDrillView> {
  const [row] = await db.select().from(microDrills)
    .where(and(eq(microDrills.id, id), eq(microDrills.userId, userId))).limit(1);
  if (!row) throw new Error("Saved response was removed");
  return toMicroDrillView(row);
}

export async function retryMicroDrillFeedback(id: string): Promise<MicroDrillView> {
  const user = await requireUser();
  const [row] = await db.select().from(microDrills).where(and(eq(microDrills.id, id), eq(microDrills.userId, user.id))).limit(1);
  if (!row) throw new Error("Response not found");
  if (row.feedbackStatus === "ready" || row.feedbackAttempts >= 2) return toMicroDrillView(row);
  const [claimed] = await db.update(microDrills).set({ feedbackStatus: "pending",
    feedbackAttempts: row.feedbackAttempts + 1, feedbackLeaseUntil: new Date(Date.now() + 5 * 60_000) })
    .where(and(eq(microDrills.id, id), eq(microDrills.userId, user.id),
      eq(microDrills.feedbackAttempts, row.feedbackAttempts),
      or(eq(microDrills.feedbackStatus, "failed"),
        and(eq(microDrills.feedbackStatus, "pending"), lt(microDrills.feedbackLeaseUntil, new Date())))))
    .returning({ id: microDrills.id });
  if (!claimed) {
    const [current] = await db.select().from(microDrills).where(and(eq(microDrills.id, id), eq(microDrills.userId, user.id))).limit(1);
    return toMicroDrillView(current);
  }
  const [errorRow] = await db.select().from(errors).where(and(eq(errors.id, row.errorId), eq(errors.userId, user.id))).limit(1);
  if (!errorRow) throw new Error("Source error was removed");
  const result = await evaluateSavedMicroDrill(id, user.id, errorRow);

  revalidatePath("/progress");
  revalidatePath("/review");
  return result;
}

/* ------------------------------------------------------------------ */
/*  getRule                                                             */
/* ------------------------------------------------------------------ */

export async function getRule(ruleId: string): Promise<Rule | null> {
  await requireUser();
  return db
    .select()
    .from(rules)
    .where(eq(rules.id, ruleId))
    .limit(1)
    .then((r) => r[0] ?? null);
}

/* ------------------------------------------------------------------ */
/*  batchGetRules — fetch multiple rules in one query                  */
/* ------------------------------------------------------------------ */

export async function batchGetRules(ruleIds: string[]): Promise<Map<string, Rule>> {
  await requireUser();
  if (ruleIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(rules)
    .where(inArray(rules.id, ruleIds));
  return new Map(rows.map((r) => [r.id, r]));
}

/* ------------------------------------------------------------------ */
/*  getDashboardStats                                                   */
/* ------------------------------------------------------------------ */

export async function getDashboardStats(): Promise<{
  totalSubmissions: number;
  totalErrors: number;
  activeDays: number;
  mostImprovedCategory: string | null;
}> {
  const user = await requireUser();
  const [subResult, errResult, daysResult] = await Promise.all([
    db.select({ count: count() }).from(submissions).where(eq(submissions.userId, user.id)),
    db.select({ count: count() }).from(errors).where(eq(errors.userId, user.id)),
    db.select({
      days: sql<number>`count(distinct date_trunc('day', ${submissions.submittedAt})::date)`,
    }).from(submissions).where(eq(submissions.userId, user.id)),
  ]);

  const totalSubmissions = Number(subResult[0]?.count ?? 0);
  const totalErrors = Number(errResult[0]?.count ?? 0);
  const activeDays = Number(daysResult[0]?.days ?? 0);

  // Find most improved: compare last 30 days vs prior 30 days
  const now = new Date();
  const cutoff60 = new Date(now.getTime() - 60 * 86_400_000);
  const cutoff30 = new Date(now.getTime() - 30 * 86_400_000);

  const recentErrors = await db
    .select({ category: errors.category, createdAt: errors.createdAt })
    .from(errors)
    .where(and(eq(errors.userId, user.id), gte(errors.createdAt, cutoff60)));

  const prior = new Map<string, number>();
  const current = new Map<string, number>();
  for (const row of recentErrors) {
    const map = row.createdAt >= cutoff30 ? current : prior;
    map.set(row.category, (map.get(row.category) ?? 0) + 1);
  }

  let mostImprovedCategory: string | null = null;
  let bestImprovement = 0;
  for (const [cat, priorCount] of prior.entries()) {
    const currentCount = current.get(cat) ?? 0;
    const improvement = priorCount - currentCount;
    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      mostImprovedCategory = cat;
    }
  }

  return { totalSubmissions, totalErrors, activeDays, mostImprovedCategory };
}

/* ------------------------------------------------------------------ */
/*  getErrorTrend                                                       */
/* ------------------------------------------------------------------ */

export type TrendBucket = {
  weekLabel: string;
  /** Absolute error count that week (tooltip context, not the headline). */
  errors: number;
  /** Words written that week — practice volume. */
  words: number;
  /** Errors per 100 words. null when nothing was written that week. */
  density: number | null;
};

/** Weekly error *density* (errors / 100 words), not raw counts: more writing
 *  used to push the old absolute-count line up, reading as regression. */
export async function getErrorTrend(windowDays: 30 | 90 | 365): Promise<TrendBucket[]> {
  const user = await requireUser();
  const startDate = new Date(Date.now() - windowDays * 86_400_000);

  const [errorRows, wordRows] = await Promise.all([
    db
      .select({
        week: sql<string>`date_trunc('week', ${errors.createdAt})::text`,
        count: count(),
      })
      .from(errors)
      .where(and(eq(errors.userId, user.id), gte(errors.createdAt, startDate)))
      .groupBy(sql`date_trunc('week', ${errors.createdAt})`),
    db
      .select({
        week: sql<string>`date_trunc('week', ${submissions.submittedAt})::text`,
        words: sql<number>`coalesce(sum(${submissions.wordCount}), 0)::int`,
      })
      .from(submissions)
      .where(and(eq(submissions.userId, user.id), gte(submissions.submittedAt, startDate)))
      .groupBy(sql`date_trunc('week', ${submissions.submittedAt})`),
  ]);

  // Bucket by week-start (Postgres date_trunc('week') is Monday-based,
  // matched here with weekStartsOn: 1).
  const weekKey = (iso: string) => startOfWeek(parseISO(iso), { weekStartsOn: 1 }).getTime();
  const errorsByWeek = new Map(errorRows.map((r) => [weekKey(r.week), Number(r.count)]));
  const wordsByWeek = new Map(wordRows.map((r) => [weekKey(r.week), Number(r.words)]));

  // Emit a bucket for every week in the window — including empty ones — so the
  // chart advances one step per week instead of "skipping" quiet weeks.
  const result: TrendBucket[] = [];
  const end = startOfWeek(new Date(), { weekStartsOn: 1 });
  let cursor = startOfWeek(startDate, { weekStartsOn: 1 });
  while (cursor.getTime() <= end.getTime()) {
    const errorCount = errorsByWeek.get(cursor.getTime()) ?? 0;
    const words = wordsByWeek.get(cursor.getTime()) ?? 0;
    result.push({
      weekLabel: format(cursor, "MMM d"),
      errors: errorCount,
      words,
      density: words > 0 ? Math.round((errorCount / words) * 1000) / 10 : null,
    });
    cursor = addWeeks(cursor, 1);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  getTopRecurringPatterns                                             */
/* ------------------------------------------------------------------ */

export type RecurringPattern = {
  category: string;
  subcategory: string;
  subcategoryLabel: string;
  count: number;
  exampleOriginal: string;
  exampleCorrection: string;
  exampleExplanation: string;
};

export async function getTopRecurringPatterns(limit = 3): Promise<RecurringPattern[]> {
  const user = await requireUser();
  const groups = await db
    .select({ category: errors.category, subcategory: errors.subcategory, count: count() })
    .from(errors)
    .where(eq(errors.userId, user.id))
    .groupBy(errors.category, errors.subcategory)
    .orderBy(desc(count()))
    .limit(limit);

  const patterns: RecurringPattern[] = [];
  for (const group of groups) {
    const example = await db
      .select({
        original: errors.original,
        correction: errors.correction,
        explanationEn: errors.explanationEn,
      })
      .from(errors)
      .where(and(eq(errors.userId, user.id), eq(errors.category, group.category), eq(errors.subcategory, group.subcategory)))
      .orderBy(desc(errors.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);

    const categoryDef = ERROR_TAXONOMY[group.category as ErrorCategory];
    const subcategoryLabel =
      (categoryDef?.subcategories as Record<string, string>)?.[group.subcategory] ??
      group.subcategory;

    patterns.push({
      category: group.category,
      subcategory: group.subcategory,
      subcategoryLabel,
      count: Number(group.count),
      exampleOriginal: example?.original ?? "",
      exampleCorrection: example?.correction ?? "",
      exampleExplanation: example?.explanationEn ?? "",
    });
  }

  return patterns;
}
