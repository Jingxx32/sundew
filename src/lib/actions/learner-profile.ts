"use server";

import { and, eq, desc, count, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import { errors, submissions, userSettings } from "@/lib/db/schema";
import type { CefrLevel } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/cefr";
import type { ErrorCategory } from "@/lib/taxonomy";
import { ALL_SUBCATEGORIES } from "@/lib/taxonomy";
import type { LearnerProfile, WeakGrammarEntry } from "@/lib/learner-profile";
import {
  PROFILE_MIN_ERRORS,
  PROFILE_MIN_SUBMISSIONS,
} from "@/lib/learner-profile";
import { requireUser } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const STRONG_WINDOW_DAYS = 90;
const TREND_WINDOW_DAYS = 30;

function classifyTrend(
  recent: number,
  prior: number,
): WeakGrammarEntry["trend"] {
  if (prior === 0 && recent === 0) return "stable";
  if (prior === 0) return "worsening";
  if (recent * 2 <= prior) return "improving";
  if (recent >= prior * 2) return "worsening";
  return "stable";
}

/* ------------------------------------------------------------------ */
/*  buildLearnerProfile                                                 */
/* ------------------------------------------------------------------ */

export async function buildLearnerProfile(): Promise<LearnerProfile> {
  const user = await requireUser();
  const now = Date.now();
  const cutoff60 = new Date(now - 60 * 86_400_000);
  const cutoff30 = new Date(now - TREND_WINDOW_DAYS * 86_400_000);
  const cutoff90 = new Date(now - STRONG_WINDOW_DAYS * 86_400_000);

  const [
    cefrRow,
    subTotalRow,
    errTotalRow,
    weakRows,
    trendRows,
    recentSubcatRows,
  ] = await Promise.all([
    db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, "cefr_level")))
      .limit(1)
      .then((r) => r[0] ?? null),
    db.select({ count: count() }).from(submissions).where(eq(submissions.userId, user.id)),
    db.select({ count: count() }).from(errors).where(eq(errors.userId, user.id)),
    db
      .select({
        category: errors.category,
        subcategory: errors.subcategory,
        count: count(),
      })
      .from(errors)
      .where(eq(errors.userId, user.id))
      .groupBy(errors.category, errors.subcategory)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        category: errors.category,
        subcategory: errors.subcategory,
        createdAt: errors.createdAt,
      })
      .from(errors)
      .where(and(eq(errors.userId, user.id), gte(errors.createdAt, cutoff60))),
    db
      .select({ subcategory: errors.subcategory })
      .from(errors)
      .where(and(eq(errors.userId, user.id), gte(errors.createdAt, cutoff90))),
  ]);

  const declaredLevel = cefrRow?.value;
  const cefrLevel: CefrLevel = CEFR_LEVELS.includes(declaredLevel as CefrLevel)
    ? (declaredLevel as CefrLevel)
    : "B1";

  const totalSubmissions = Number(subTotalRow[0]?.count ?? 0);
  const totalErrors = Number(errTotalRow[0]?.count ?? 0);

  // Trend per weak subcategory: split last-60d errors into [30,60)d prior and [0,30)d recent.
  const recentMap = new Map<string, number>();
  const priorMap = new Map<string, number>();
  for (const row of trendRows) {
    const key = `${row.category}::${row.subcategory}`;
    const target = row.createdAt >= cutoff30 ? recentMap : priorMap;
    target.set(key, (target.get(key) ?? 0) + 1);
  }

  const weakGrammar: WeakGrammarEntry[] = weakRows.map((row) => {
    const key = `${row.category}::${row.subcategory}`;
    return {
      category: row.category as ErrorCategory,
      subcategory: row.subcategory,
      count: Number(row.count),
      trend: classifyTrend(recentMap.get(key) ?? 0, priorMap.get(key) ?? 0),
    };
  });

  // Strong grammar: subcategories absent from the last 90 days of errors.
  const erredRecently = new Set(recentSubcatRows.map((r) => r.subcategory));
  const strongGrammar = ALL_SUBCATEGORIES.filter(
    (s) => !erredRecently.has(s.subcategory),
  ).map((s) => s.subcategory);

  const hasEnoughSignal =
    totalSubmissions >= PROFILE_MIN_SUBMISSIONS &&
    totalErrors >= PROFILE_MIN_ERRORS;

  return {
    cefrLevel,
    totalSubmissions,
    totalErrors,
    weakGrammar,
    strongGrammar,
    hasEnoughSignal,
  };
}
