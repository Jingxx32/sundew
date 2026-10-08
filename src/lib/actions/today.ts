"use server";

import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  conjugationAttempts,
  errors,
  readingSessions,
  speakingSessions,
  submissions,
  tcfQuestionAttempts,
  tcfQuestions,
  tcfSets,
  userSettings,
  userVocabulary,
  vocabularyGaps,
  writingTasks,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { canUse } from "@/lib/access/features";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/cefr";
import { ERROR_TAXONOMY, type ErrorCategory } from "@/lib/taxonomy";
import { getCefrLevel, getStudyGoal, type StudyGoal } from "./settings";
import { quickWrite } from "./tasks";
import {
  addCalendarDays,
  calendarDayDifference,
  startOfLocalWeek,
  zonedDateKey,
  zonedStartOfDay,
} from "@/lib/date/time-zone";
import { recommendActivity, type TodayActivityKey } from "@/lib/today/recommendation";

export type TodayActivity = {
  key: TodayActivityKey;
  title: string;
  detail: string;
  href: string;
  cta: string;
  estimatedMinutes: number;
  done: boolean;
  progress?: { done: number; target: number };
};

export type TodayFocusArea = {
  category: string;
  label: string;
  submissionCount: number;
  lastSeenAt: Date;
  href: string;
};

export type TodayPlan = {
  dateKey: string;
  timeZone: string;
  cefr: CefrLevel;
  goal: StudyGoal & { daysLeft: number | null; examState: "future" | "today" | "past" | null };
  activity: TodayActivity;
  alternatives: TodayActivity[];
  skills: Array<{ key: "listening" | "speaking" | "reading" | "writing"; title: string; href: string; detail: string; locked: boolean }>;
  focusAreas: TodayFocusArea[];
  week: { from: Date; tcfAnswers: number; writingSubmissions: number; conjugationAnswers: number };
};

const DRILL_TARGET = 10;
const MIN_SAMPLE = 5;
const ACTIVITY_KEYS: TodayActivityKey[] = ["vocabulary", "tcf-listening", "tcf-reading", "writing", "conjugation"];

function parseFocus(value: string | undefined): { dateKey: string; key: TodayActivityKey } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { dateKey?: unknown; key?: unknown };
    return typeof parsed.dateKey === "string" && ACTIVITY_KEYS.includes(parsed.key as TodayActivityKey)
      ? { dateKey: parsed.dateKey, key: parsed.key as TodayActivityKey }
      : null;
  } catch {
    return null;
  }
}

function activityDateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, month: "short", day: "numeric" }).format(date);
}

export async function getTodayPlan(): Promise<TodayPlan> {
  const user = await requireUser();
  const now = new Date();
  const [cefrRaw, goal] = await Promise.all([getCefrLevel(), getStudyGoal()]);
  const cefr = cefrRaw ?? "A2";
  const dateKey = zonedDateKey(now, goal.timeZone);
  const todayStart = zonedStartOfDay(dateKey, goal.timeZone);
  const tomorrowStart = zonedStartOfDay(addCalendarDays(dateKey, 1), goal.timeZone);
  const weekStart = startOfLocalWeek(dateKey, goal.timeZone);
  const recentStart = zonedStartOfDay(addCalendarDays(dateKey, -29), goal.timeZone);

  const [focusSetting, tcfRows, submissionRows, conjugationRows, dueVocabularyRow, errorRows, readingRows, speakingRows, unfinishedWriting] = await Promise.all([
    db.select({ value: userSettings.value }).from(userSettings).where(and(eq(userSettings.userId, user.id), eq(userSettings.key, "today_focus"))).limit(1).then((rows) => rows[0] ?? null),
    db
      .select({ questionId: tcfQuestionAttempts.questionId, skill: tcfSets.skill, level: tcfQuestions.level, correct: tcfQuestionAttempts.correct, mode: tcfQuestionAttempts.mode, answeredAt: tcfQuestionAttempts.answeredAt })
      .from(tcfQuestionAttempts)
      .innerJoin(tcfQuestions, eq(tcfQuestionAttempts.questionId, tcfQuestions.id))
      .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
      .where(and(eq(tcfQuestionAttempts.userId, user.id), gte(tcfQuestionAttempts.answeredAt, recentStart), lte(tcfQuestionAttempts.answeredAt, now))),
    db.select({ id: submissions.id, taskId: submissions.taskId, submittedAt: submissions.submittedAt, feedbackStatus: submissions.feedbackStatus }).from(submissions).where(and(eq(submissions.userId, user.id), gte(submissions.submittedAt, weekStart), lte(submissions.submittedAt, now))).orderBy(desc(submissions.submittedAt)),
    db.select({ id: conjugationAttempts.id, answeredAt: conjugationAttempts.answeredAt }).from(conjugationAttempts).where(and(eq(conjugationAttempts.userId, user.id), gte(conjugationAttempts.answeredAt, weekStart), lte(conjugationAttempts.answeredAt, now))),
    db.select({ count: sql<number>`count(*)::int` }).from(vocabularyGaps).innerJoin(userVocabulary, and(eq(vocabularyGaps.userId, userVocabulary.userId), eq(vocabularyGaps.lemma, userVocabulary.lemma))).where(and(eq(vocabularyGaps.userId, user.id), eq(vocabularyGaps.status, "active"), lte(vocabularyGaps.dueAt, now), sql`${userVocabulary.translation} is not null`)).then((rows) => rows[0]),
    db.select({ category: errors.category, subcategory: errors.subcategory, submissionId: errors.submissionId, createdAt: errors.createdAt }).from(errors).where(and(eq(errors.userId, user.id), gte(errors.createdAt, recentStart), lte(errors.createdAt, now))).orderBy(desc(errors.createdAt)),
    db.select({ startedAt: readingSessions.startedAt }).from(readingSessions).where(and(eq(readingSessions.userId, user.id), gte(readingSessions.startedAt, recentStart), lte(readingSessions.startedAt, now))).orderBy(desc(readingSessions.startedAt)).limit(1),
    db.select({ startedAt: speakingSessions.startedAt }).from(speakingSessions).where(and(eq(speakingSessions.userId, user.id), gte(speakingSessions.startedAt, recentStart), lte(speakingSessions.startedAt, now))).orderBy(desc(speakingSessions.startedAt)).limit(1),
    db.select({ id: writingTasks.id, createdAt: writingTasks.createdAt }).from(writingTasks).leftJoin(submissions, and(eq(submissions.taskId, writingTasks.id), eq(submissions.userId, user.id))).where(and(eq(writingTasks.userId, user.id), isNull(submissions.id))).orderBy(desc(writingTasks.createdAt)).limit(1).then((rows) => rows[0] ?? null),
  ]);

  const allowedLevels = new Set<CefrLevel>();
  const cefrIndex = CEFR_LEVELS.indexOf(cefr);
  for (const level of CEFR_LEVELS.slice(Math.max(0, cefrIndex - 1), Math.min(CEFR_LEVELS.length, cefrIndex + 2))) allowedLevels.add(level);
  const groups = new Map<string, { skill: "listening" | "reading"; level: CefrLevel; correct: number; total: number }>();
  for (const row of tcfRows) {
    const level = row.level as CefrLevel;
    if (!allowedLevels.has(level)) continue;
    const key = `${row.skill}:${level}`;
    const group = groups.get(key) ?? { skill: row.skill, level, correct: 0, total: 0 };
    group.total += 1;
    if (row.correct) group.correct += 1;
    groups.set(key, group);
  }
  const scored = [...groups.values()].filter((group) => group.total >= MIN_SAMPLE);
  const weakest = scored.length > 0
    ? scored.reduce((current, next) => current.correct / current.total <= next.correct / next.total ? current : next)
    : null;
  const suggestedSkill: "listening" | "reading" = weakest?.skill ?? (Number(dateKey.slice(-2)) % 2 === 0 ? "listening" : "reading");
  const suggestedLevel = weakest?.level ?? cefr;

  const todayTcf = tcfRows.filter((row) => row.mode === "drill" && row.answeredAt >= todayStart && row.answeredAt < tomorrowStart);
  const countTcf = (skill: "listening" | "reading", level: CefrLevel) => new Set(todayTcf.filter((row) => row.skill === skill && row.level === level).map((row) => row.questionId)).size;
  const todaySubmissions = submissionRows.filter((row) => row.submittedAt >= todayStart && row.submittedAt < tomorrowStart);
  const todayConjugation = conjugationRows.filter((row) => row.answeredAt >= todayStart && row.answeredAt < tomorrowStart).length;
  const dueVocabulary = Number(dueVocabularyRow?.count ?? 0);

  const focusGroups = new Map<string, { category: string; subcategory: string; submissions: Set<string>; lastSeenAt: Date }>();
  for (const row of errorRows) {
    const key = `${row.category}:${row.subcategory}`;
    const group = focusGroups.get(key) ?? { category: row.category, subcategory: row.subcategory, submissions: new Set(), lastSeenAt: row.createdAt };
    group.submissions.add(row.submissionId);
    if (row.createdAt > group.lastSeenAt) group.lastSeenAt = row.createdAt;
    focusGroups.set(key, group);
  }
  const focusAreas = [...focusGroups.values()]
    .sort((a, b) => b.submissions.size - a.submissions.size || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .slice(0, 3)
    .map((group) => ({
      category: group.category,
      label: (ERROR_TAXONOMY[group.category as ErrorCategory]?.subcategories as Record<string, string> | undefined)?.[group.subcategory] ?? group.subcategory,
      submissionCount: group.submissions.size,
      lastSeenAt: group.lastSeenAt,
      href: `/progress?category=${encodeURIComponent(group.category)}&subcategory=${encodeURIComponent(group.subcategory)}`,
    }));
  const repeatedConjugationIssue = focusAreas.some((area) => area.submissionCount >= 2 && /conjugation|auxiliary|tense|participle/i.test(area.label));
  const writingDone = todaySubmissions.length > 0;
  const latestSubmission = todaySubmissions[0];
  const tcfWhy = weakest
    ? `${weakest.skill === "listening" ? "Listening" : "Reading"} ${weakest.level} has the lowest recent accuracy among comparable groups (${weakest.total} answers).`
    : `There is not enough comparable drill history yet, so this starts at your ${cefr} practice level.`;

  const tcfActivity = (skill: "listening" | "reading"): TodayActivity => {
    const level = skill === suggestedSkill ? suggestedLevel : cefr;
    const done = countTcf(skill, level);
    return { key: `tcf-${skill}`, title: `TCF ${skill} · ${level} × ${DRILL_TARGET}`, detail: skill === suggestedSkill ? tcfWhy : `A ${cefr} ${skill} drill using the exam question bank.`, href: `/tcf/drill?skill=${skill}&level=${level}`, cta: done > 0 ? "Continue drill" : "Start drill", estimatedMinutes: 12, done: done >= DRILL_TARGET, progress: { done: Math.min(done, DRILL_TARGET), target: DRILL_TARGET } };
  };
  const activities: TodayActivity[] = [
    { key: "vocabulary", title: "Review due vocabulary", detail: dueVocabulary > 0 ? `${dueVocabulary} word${dueVocabulary === 1 ? " is" : "s are"} due now. This count comes from the review queue.` : "The vocabulary cards that were due today are complete.", href: "/vocabulary/review", cta: dueVocabulary > 0 ? "Review words" : "View vocabulary", estimatedMinutes: 8, done: dueVocabulary === 0, progress: dueVocabulary > 0 ? { done: 0, target: dueVocabulary } : undefined },
    tcfActivity("listening"),
    tcfActivity("reading"),
    { key: "writing", title: unfinishedWriting && !writingDone ? "Continue your writing task" : "Write one short response", detail: writingDone ? `Submitted today; feedback is ${latestSubmission.feedbackStatus}.` : unfinishedWriting ? "A saved prompt is ready for your response." : focusAreas.length > 0 ? `Use a fresh prompt to revisit ${focusAreas[0].label.toLowerCase()}.` : "A short response will begin building an evidence-backed writing history.", href: unfinishedWriting && !writingDone ? `/practice?taskId=${unfinishedWriting.id}` : "/practice", cta: writingDone ? "View writing" : unfinishedWriting ? "Continue writing" : "Start writing", estimatedMinutes: 15, done: writingDone },
    { key: "conjugation", title: `Conjugation × ${DRILL_TARGET}`, detail: repeatedConjugationIssue ? "Recent writing shows the same verb-form issue in more than one submission." : "A short deterministic drill keeps high-frequency forms active.", href: "/conjugation", cta: todayConjugation > 0 ? "Continue drill" : "Start drill", estimatedMinutes: 7, done: todayConjugation >= DRILL_TARGET, progress: { done: Math.min(todayConjugation, DRILL_TARGET), target: DRILL_TARGET } },
  ];

  const recommendedKey = recommendActivity({ learningMode: goal.learningMode, dueVocabulary, repeatedConjugationIssue, wroteToday: writingDone, suggestedTcfSkill: suggestedSkill });
  const savedFocus = parseFocus(focusSetting?.value);
  const activeKey = savedFocus?.dateKey === dateKey ? savedFocus.key : recommendedKey;
  // Guests cannot open TCF drills; never recommend one.
  const available = canUse(user.access, "tcf") === true ? activities : activities.filter((candidate) => !candidate.key.startsWith("tcf-"));
  const activity = available.find((candidate) => candidate.key === activeKey) ?? available.find((candidate) => candidate.key === recommendedKey) ?? available[0];
  const alternatives = available.filter((candidate) => candidate.key !== activity.key && (!candidate.done || candidate.key === "writing"));

  const daysLeft = goal.examDate ? calendarDayDifference(dateKey, goal.examDate) : null;
  const examState = daysLeft === null ? null : daysLeft < 0 ? "past" : daysLeft === 0 ? "today" : "future";
  const recentForSkill = (dates: Date[], empty: string) => dates[0] ? `Last activity ${activityDateLabel(dates[0], goal.timeZone)}` : empty;
  const lastListening = tcfRows.filter((row) => row.skill === "listening").map((row) => row.answeredAt).sort((a, b) => b.getTime() - a.getTime());
  const lastReading = [...tcfRows.filter((row) => row.skill === "reading").map((row) => row.answeredAt), ...readingRows.map((row) => row.startedAt)].sort((a, b) => b.getTime() - a.getTime());
  const lastWriting = submissionRows.map((row) => row.submittedAt);

  return {
    dateKey,
    timeZone: goal.timeZone,
    cefr,
    goal: { ...goal, daysLeft, examState },
    activity,
    alternatives,
    skills: [
      { key: "listening", title: "Listening", href: "/tcf?skill=listening", detail: recentForSkill(lastListening, "TCF listening practice"), locked: canUse(user.access, "tcf") !== true },
      { key: "speaking", title: "Speaking", href: "/speaking", detail: recentForSkill(speakingRows.map((row) => row.startedAt), "Script and pronunciation"), locked: canUse(user.access, "speaking") !== true },
      { key: "reading", title: "Reading", href: "/training#reading", detail: recentForSkill(lastReading, "Library or TCF reading"), locked: false },
      { key: "writing", title: "Writing", href: "/practice", detail: recentForSkill(lastWriting, "Short writing with feedback"), locked: false },
    ],
    focusAreas,
    week: { from: weekStart, tcfAnswers: tcfRows.filter((row) => row.answeredAt >= weekStart).length, writingSubmissions: submissionRows.length, conjugationAnswers: conjugationRows.length },
  };
}

async function saveFocus(key: TodayActivityKey): Promise<TodayActivity> {
  const user = await requireUser();
  const plan = await getTodayPlan();
  const activity = [plan.activity, ...plan.alternatives].find((candidate) => candidate.key === key);
  if (!activity) throw new Error("Activity is not available");
  await db.insert(userSettings).values({ userId: user.id, key: "today_focus", value: JSON.stringify({ dateKey: plan.dateKey, key }) }).onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value: JSON.stringify({ dateKey: plan.dateKey, key }), updatedAt: new Date() } });
  revalidatePath("/today");
  return activity;
}

export async function selectTodayActivity(key: TodayActivityKey): Promise<void> {
  await saveFocus(key);
  redirect("/today");
}

export async function startTodayActivity(key: TodayActivityKey): Promise<void> {
  const activity = await saveFocus(key);
  if (key === "writing" && !activity.done && activity.href === "/practice") await quickWrite();
  redirect(activity.href);
}
