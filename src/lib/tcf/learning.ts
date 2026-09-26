export type TcfLearningAttempt = {
  id: string;
  correct: boolean;
  uncertain: boolean;
  answeredAt: Date;
};

export type TcfLearningStatus = "unseen" | "needs_review" | "in_progress" | "stable";

export type TcfQuestionLearningSummary = {
  attemptCount: number;
  correctCount: number;
  uncertainCount: number;
  lastAnsweredAt: Date | null;
  latestCorrect: boolean | null;
  latestUncertain: boolean | null;
  consecutiveConfidentCorrect: number;
  nextReviewAt: Date | null;
  status: TcfLearningStatus;
  needsReview: boolean;
};

/** A confident answer can become due again after its review interval. */
export function isTcfReviewDue(summary: TcfQuestionLearningSummary, now: Date): boolean {
  return summary.nextReviewAt !== null && summary.nextReviewAt <= now;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first version intentionally uses a small, inspectable policy instead of
 * an opaque SRS model. A confident streak of three is stable; any incorrect or
 * uncertain answer resets it and is eligible in the next training round.
 */
export function deriveTcfLearningSummary(
  attempts: readonly TcfLearningAttempt[],
): TcfQuestionLearningSummary {
  const ordered = [...attempts].sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime());
  const latest = ordered[0];

  if (!latest) {
    return {
      attemptCount: 0,
      correctCount: 0,
      uncertainCount: 0,
      lastAnsweredAt: null,
      latestCorrect: null,
      latestUncertain: null,
      consecutiveConfidentCorrect: 0,
      nextReviewAt: null,
      status: "unseen",
      needsReview: false,
    };
  }

  let consecutiveConfidentCorrect = 0;
  for (const attempt of ordered) {
    if (!attempt.correct || attempt.uncertain) break;
    consecutiveConfidentCorrect++;
  }

  const needsReview = !latest.correct || latest.uncertain;
  const reviewDays = needsReview ? 0 : consecutiveConfidentCorrect === 1 ? 3 : consecutiveConfidentCorrect === 2 ? 7 : 14;
  const nextReviewAt = new Date(latest.answeredAt.getTime() + reviewDays * DAY_MS);
  const status: TcfLearningStatus = needsReview
    ? "needs_review"
    : consecutiveConfidentCorrect >= 3
      ? "stable"
      : "in_progress";

  return {
    attemptCount: ordered.length,
    correctCount: ordered.filter((attempt) => attempt.correct).length,
    uncertainCount: ordered.filter((attempt) => attempt.uncertain).length,
    lastAnsweredAt: latest.answeredAt,
    latestCorrect: latest.correct,
    latestUncertain: latest.uncertain,
    consecutiveConfidentCorrect,
    nextReviewAt,
    status,
    needsReview,
  };
}
