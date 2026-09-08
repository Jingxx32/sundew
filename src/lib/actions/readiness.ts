"use server";

import { desc, gte, isNotNull, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcfAttempts, submissions, speakingSessions } from "@/lib/db/schema";
import type { SessionScores, TcfPerLevel } from "@/lib/db/schema";
import { getStudyGoal, type StudyGoal } from "./settings";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/cefr";
import { requireUser } from "@/lib/auth/session";

export type SkillReadiness = {
  skill: "listening" | "reading" | "writing" | "speaking";
  status: "no_data" | "low_sample" | "ok";
  /** CEFR level ("B1") for the four-skills scale, or "78/100" for speaking. */
  label: string | null;
  /** Honest human sentence, always includes sample size. */
  detail: string;
  samples: number;
};

export type ReadinessSummary = {
  goal: StudyGoal & { daysLeft: number | null; targetCefr: CefrLevel | null };
  skills: SkillReadiness[];
};

/** Coarse NCLC/CLB → CEFR display mapping (TCF Canada context). */
const CLB_TO_CEFR: Record<number, CefrLevel> = {
  4: "B1", 5: "B1", 6: "B2", 7: "B2", 8: "C1", 9: "C1", 10: "C2",
};

const WINDOW_DAYS = 90;
/** A level counts as "held" with ≥60% accuracy over ≥8 answered questions. */
const MIN_ANSWERED = 8;
const HOLD_ACCURACY = 0.6;

function estimateTcfSkill(
  skill: "listening" | "reading",
  attempts: { perLevel: TcfPerLevel | null }[],
): SkillReadiness {
  const agg: Record<string, { correct: number; total: number }> = {};
  for (const a of attempts) {
    for (const [level, s] of Object.entries(a.perLevel ?? {})) {
      const e = (agg[level] ??= { correct: 0, total: 0 });
      e.correct += s.correct;
      e.total += s.total;
    }
  }
  const samples = Object.values(agg).reduce((n, e) => n + e.total, 0);
  if (samples === 0) {
    return {
      skill, status: "no_data", label: null, samples,
      detail: "No exam runs yet — finish one full TCF exam for a first signal.",
    };
  }

  let held: CefrLevel | null = null;
  for (const level of CEFR_LEVELS) {
    const e = agg[level];
    if (e && e.total >= MIN_ANSWERED && e.correct / e.total >= HOLD_ACCURACY) {
      held = level; // keep climbing — highest qualifying level wins
    }
  }
  if (!held) {
    return {
      skill, status: "low_sample", label: null, samples,
      detail: `${samples} questions in ${WINDOW_DAYS} days — not enough per level to estimate yet.`,
    };
  }
  // Show progress toward the next level when there's data for it.
  const nextLevel = CEFR_LEVELS[CEFR_LEVELS.indexOf(held) + 1];
  const next = nextLevel ? agg[nextLevel] : undefined;
  const nextPart =
    nextLevel && next && next.total > 0
      ? ` · ${nextLevel}: ${Math.round((next.correct / next.total) * 100)}% (${next.total} answered)`
      : "";
  return {
    skill, status: "ok", label: held, samples,
    detail: `Holding ${held} at ≥${HOLD_ACCURACY * 100}%${nextPart}`,
  };
}

export async function getReadinessSummary(): Promise<ReadinessSummary> {
  const user = await requireUser();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const [goalBase, tcfRows, writingRows, speakingRows] = await Promise.all([
    getStudyGoal(),
    db
      .select({ skill: tcfAttempts.skill, perLevel: tcfAttempts.perLevel })
      .from(tcfAttempts)
      .where(and(eq(tcfAttempts.userId, user.id), gte(tcfAttempts.answeredAt, cutoff))),
    db
      .select({ estimatedLevel: submissions.estimatedLevel })
      .from(submissions)
      .where(and(eq(submissions.userId, user.id), isNotNull(submissions.estimatedLevel)))
      .orderBy(desc(submissions.submittedAt))
      .limit(5),
    db
      .select({ scores: speakingSessions.scores })
      .from(speakingSessions)
      .where(
        and(
          eq(speakingSessions.userId, user.id),
          eq(speakingSessions.status, "completed"),
          isNotNull(speakingSessions.scores),
        ),
      ),
  ]);

  const listening = estimateTcfSkill(
    "listening",
    tcfRows.filter((r) => r.skill === "listening"),
  );
  const reading = estimateTcfSkill(
    "reading",
    tcfRows.filter((r) => r.skill === "reading"),
  );

  const writing: SkillReadiness =
    writingRows.length === 0
      ? {
          skill: "writing", status: "no_data", label: null, samples: 0,
          detail: "No feedback-graded writing yet — submit a task to get an estimate.",
        }
      : {
          skill: "writing",
          status: writingRows.length >= 3 ? "ok" : "low_sample",
          label: writingRows[0].estimatedLevel,
          samples: writingRows.length,
          detail: `AI estimate from your last ${writingRows.length} submission${writingRows.length > 1 ? "s" : ""}${
            writingRows.length < 3 ? " — small sample, treat as rough" : ""
          }.`,
        };

  const overalls = speakingRows
    .map((r) => (r.scores as SessionScores | null)?.overall)
    .filter((n): n is number => typeof n === "number");
  const speaking: SkillReadiness =
    overalls.length === 0
      ? {
          skill: "speaking", status: "no_data", label: null, samples: 0,
          detail: "No assessed sessions yet — needs the Azure Speech key configured.",
        }
      : {
          skill: "speaking",
          status: overalls.length >= 3 ? "ok" : "low_sample",
          label: `${Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length)}/100`,
          samples: overalls.length,
          detail: `Average pronunciation score over ${overalls.length} session${overalls.length > 1 ? "s" : ""}.`,
        };

  const daysLeft = goalBase.examDate
    ? Math.ceil((new Date(`${goalBase.examDate}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    goal: {
      ...goalBase,
      daysLeft,
      targetCefr: goalBase.targetClb !== null ? (CLB_TO_CEFR[goalBase.targetClb] ?? null) : null,
    },
    skills: [listening, reading, writing, speaking],
  };
}
