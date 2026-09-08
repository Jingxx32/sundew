"use server";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  submissions,
  tcfQuestionAttempts,
  tcfQuestions,
  tcfSets,
  conjugationAttempts,
  quizAttempts,
  userVocabulary,
} from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { getCefrLevel, getStudyGoal } from "./settings";
import { getTopRecurringPatterns } from "./errors";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/cefr";
import { requireUser } from "@/lib/auth/session";

export type TodayBlock = {
  key: "tcf" | "writing" | "review";
  title: string;
  /** Why this was chosen — the plan explains itself. */
  detail: string;
  /** null → the block renders its own CTA (writing uses QuickWriteButton). */
  href: string | null;
  done: boolean;
  progress?: { done: number; target: number };
};

export type TodayPlan = {
  /** Consecutive active days ending today (or yesterday if today is quiet). */
  streak: number;
  activeToday: boolean;
  cefr: CefrLevel;
  goal: { targetClb: number | null; daysLeft: number | null };
  blocks: TodayBlock[];
};

const DRILL_TARGET = 10;
/** A (skill, level) accuracy needs this many answers before "weakest" applies. */
const MIN_SAMPLE = 5;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function getTodayPlan(): Promise<TodayPlan> {
  const user = await requireUser();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff30 = new Date(now.getTime() - 30 * 86_400_000);
  const cutoff60 = new Date(now.getTime() - 60 * 86_400_000);

  const [
    cefrRaw,
    goal,
    drillRows,
    lastSubmissionRow,
    subDates,
    tcfDates,
    conjDates,
    quizDates,
    savedCountRow,
    patterns,
  ] = await Promise.all([
    getCefrLevel(),
    getStudyGoal(),
    db
      .select({
        skill: tcfSets.skill,
        level: tcfQuestions.level,
        correct: tcfQuestionAttempts.correct,
        answeredAt: tcfQuestionAttempts.answeredAt,
      })
      .from(tcfQuestionAttempts)
      .innerJoin(tcfQuestions, eq(tcfQuestionAttempts.questionId, tcfQuestions.id))
      .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
      .where(
        and(
          eq(tcfQuestionAttempts.userId, user.id),
          gte(tcfQuestionAttempts.answeredAt, cutoff30),
        ),
      ),
    db
      .select({ submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.userId, user.id))
      .orderBy(desc(submissions.submittedAt))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ at: submissions.submittedAt })
      .from(submissions)
      .where(and(eq(submissions.userId, user.id), gte(submissions.submittedAt, cutoff60))),
    db
      .select({ at: tcfQuestionAttempts.answeredAt })
      .from(tcfQuestionAttempts)
      .where(
        and(
          eq(tcfQuestionAttempts.userId, user.id),
          gte(tcfQuestionAttempts.answeredAt, cutoff60),
        ),
      ),
    db
      .select({ at: conjugationAttempts.answeredAt })
      .from(conjugationAttempts)
      .where(
        and(
          eq(conjugationAttempts.userId, user.id),
          gte(conjugationAttempts.answeredAt, cutoff60),
        ),
      ),
    db
      .select({ at: quizAttempts.answeredAt })
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.userId, user.id), gte(quizAttempts.answeredAt, cutoff60)),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, user.id), isNotNull(userVocabulary.savedAt)))
      .then((r) => r[0]),
    getTopRecurringPatterns(1),
  ]);

  const cefr: CefrLevel = cefrRaw ?? "A2";

  /* ---- TCF block: weakest allowed (skill, level), P5 difficulty filter ---- */
  const idx = CEFR_LEVELS.indexOf(cefr);
  const allowed = new Set<CefrLevel>(
    CEFR_LEVELS.slice(Math.max(0, idx - 1), Math.min(CEFR_LEVELS.length, idx + 2)),
  );

  type Group = { skill: "listening" | "reading"; level: CefrLevel; correct: number; total: number };
  const groups = new Map<string, Group>();
  for (const row of drillRows) {
    const level = row.level as CefrLevel;
    if (!allowed.has(level)) continue;
    const key = `${row.skill}:${level}`;
    const g = groups.get(key) ?? { skill: row.skill, level, correct: 0, total: 0 };
    g.total++;
    if (row.correct) g.correct++;
    groups.set(key, g);
  }

  let tcfSkill: "listening" | "reading";
  let tcfLevel: CefrLevel;
  let tcfWhy: string;
  const scored = [...groups.values()].filter((g) => g.total >= MIN_SAMPLE);
  if (scored.length > 0) {
    const weakest = scored.reduce((a, b) =>
      a.correct / a.total <= b.correct / b.total ? a : b,
    );
    tcfSkill = weakest.skill;
    tcfLevel = weakest.level;
    tcfWhy = `Your weakest: ${weakest.skill} ${weakest.level} — ${Math.round(
      (weakest.correct / weakest.total) * 100,
    )}% over the last 30 days (${weakest.total} answered).`;
  } else {
    // Cold start: alternate skill by day parity, drill at your own level.
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
    tcfSkill = dayOfYear % 2 === 0 ? "listening" : "reading";
    tcfLevel = cefr;
    tcfWhy = `No drill history at your level yet — starting with ${tcfSkill} at ${cefr}.`;
  }

  const todayDrillCount = drillRows.filter((r) => r.answeredAt >= startOfToday).length;

  /* ---- Writing block ---- */
  const lastSub = lastSubmissionRow?.submittedAt ?? null;
  const wroteToday = lastSub !== null && lastSub >= startOfToday;
  const daysSince =
    lastSub === null ? null : Math.floor((startOfToday.getTime() - new Date(lastSub.getFullYear(), lastSub.getMonth(), lastSub.getDate()).getTime()) / 86_400_000);

  /* ---- Review block ---- */
  const conjToday = conjDates.filter((r) => r.at >= startOfToday).length;
  const topPattern = patterns[0] ?? null;
  const savedCount = Number(savedCountRow?.count ?? 0);
  const reviewParts: string[] = [];
  if (topPattern) reviewParts.push(`Top weak spot: ${topPattern.subcategoryLabel} (${topPattern.count}×)`);
  if (savedCount > 0) reviewParts.push(`${savedCount} saved word${savedCount > 1 ? "s" : ""} waiting`);
  const reviewDetail =
    reviewParts.length > 0
      ? `${reviewParts.join(" · ")} — 10 conjugation reps target your error profile.`
      : "10 conjugation reps — the queue targets your error profile once you have one.";

  /* ---- Streak ---- */
  const activeDays = new Set<string>();
  for (const list of [subDates, tcfDates, conjDates, quizDates]) {
    for (const r of list) activeDays.add(dayKey(r.at));
  }
  const activeToday = activeDays.has(dayKey(now));
  let streak = 0;
  const cursor = new Date(startOfToday);
  if (!activeToday) cursor.setDate(cursor.getDate() - 1); // grace: today isn't over
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const daysLeft = goal.examDate
    ? Math.ceil((new Date(`${goal.examDate}T00:00:00`).getTime() - now.getTime()) / 86_400_000)
    : null;

  const blocks: TodayBlock[] = [
    {
      key: "tcf",
      title: `TCF ${tcfSkill === "listening" ? "listening" : "reading"} · ${tcfLevel} × ${DRILL_TARGET}`,
      detail: tcfWhy,
      href: `/tcf/drill?skill=${tcfSkill}&level=${tcfLevel}`,
      done: todayDrillCount >= DRILL_TARGET,
      progress: { done: Math.min(todayDrillCount, DRILL_TARGET), target: DRILL_TARGET },
    },
    {
      key: "writing",
      title: "One short writing task",
      detail: wroteToday
        ? "Submitted today — feedback is flowing into your error archive."
        : daysSince === null
          ? "No writing yet — this is where the whole error loop starts."
          : `Last writing: ${daysSince} day${daysSince === 1 ? "" : "s"} ago.`,
      href: null, // renders QuickWriteButton
      done: wroteToday,
    },
    {
      key: "review",
      title: "Review · conjugation",
      detail: reviewDetail,
      href: "/conjugation",
      done: conjToday > 0,
    },
  ];

  return {
    streak,
    activeToday,
    cefr,
    goal: { targetClb: goal.targetClb, daysLeft },
    blocks,
  };
}
