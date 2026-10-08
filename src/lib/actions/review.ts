"use server";

import { and, desc, eq } from "drizzle-orm";
import { canUse } from "@/lib/access/features";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { conjugationAttempts, quizPassages, quizQuestionAttempts, quizQuestions, quizSets } from "@/lib/db/schema";
import { listErrors } from "./errors";
import { getTcfReviewQueue } from "./tcf";
import { listGaps } from "./vocab-gaps";

export type ReviewSource = "tcf" | "writing" | "vocabulary" | "conjugation" | "quiz";
export type ReviewCenterItem = {
  id: string;
  source: ReviewSource;
  title: string;
  detail: string;
  href: string;
  observedAt: Date | null;
};

export async function getReviewCenterItems(): Promise<{
  items: ReviewCenterItem[];
  unavailable: ReviewSource[];
}> {
  const user = await requireUser();
  const now = new Date();
  const sources: ReviewSource[] = ["tcf", "writing", "vocabulary", "conjugation", "quiz"];
  const results = await Promise.allSettled([
    // Guests have no TCF access; an empty queue keeps it out of "unavailable".
    canUse(user.access, "tcf") === true ? getTcfReviewQueue() : Promise.resolve([]),
    listErrors({ limit: 60 }),
    listGaps(),
    db.select({ id: conjugationAttempts.id, verb: conjugationAttempts.verb,
      tense: conjugationAttempts.tense, person: conjugationAttempts.person,
      correct: conjugationAttempts.correct, answeredAt: conjugationAttempts.answeredAt })
      .from(conjugationAttempts).where(eq(conjugationAttempts.userId, user.id))
      .orderBy(desc(conjugationAttempts.answeredAt)).limit(300),
    db.select({ id: quizQuestionAttempts.id, questionId: quizQuestions.id,
      questionText: quizQuestions.questionText, setId: quizSets.id,
      title: quizSets.title, correct: quizQuestionAttempts.correct,
      uncertain: quizQuestionAttempts.uncertain, answeredAt: quizQuestionAttempts.answeredAt })
      .from(quizQuestionAttempts).innerJoin(quizQuestions, eq(quizQuestionAttempts.questionId, quizQuestions.id))
      .innerJoin(quizPassages, eq(quizQuestions.passageId, quizPassages.id))
      .innerJoin(quizSets, and(eq(quizPassages.setId, quizSets.id), eq(quizSets.userId, user.id)))
      .where(eq(quizQuestionAttempts.userId, user.id))
      .orderBy(desc(quizQuestionAttempts.answeredAt)).limit(300),
  ] as const);

  const unavailable = sources.filter((_, index) => results[index].status === "rejected");
  const items: ReviewCenterItem[] = [];
  const [tcf, writing, vocabulary, conjugation, quiz] = results;
  if (tcf.status === "fulfilled") items.push(...tcf.value.slice(0, 60).map((item) => ({
    id: `tcf:${item.id}`,
    source: "tcf" as const,
    title: `TCF ${item.skill === "listening" ? "listening" : "reading"} · ${item.level}`,
    detail: item.learning.latestUncertain ? "Marked uncertain" : item.learning.needsReview ? "Incorrect answer" : "Due for another review",
    href: `/tcf/review?q=${encodeURIComponent(item.id)}`,
    observedAt: item.learning.lastAnsweredAt,
  })));
  if (writing.status === "fulfilled") items.push(...writing.value.map((item) => ({
    id: `writing:${item.id}`,
    source: "writing" as const,
    title: `${item.category} · ${item.subcategory}`,
    detail: `From a writing submission on ${item.submittedAt.toLocaleDateString("en-CA")}`,
    href: `/practice/${encodeURIComponent(item.submissionId)}/feedback`,
    observedAt: item.createdAt,
  })));
  if (vocabulary.status === "fulfilled") items.push(...vocabulary.value
    .filter((item) => item.status === "active" && item.dueAt <= now)
    .slice(0, 60).map((item) => ({
      id: `vocabulary:${item.gapId}`,
      source: "vocabulary" as const,
      title: item.lemma,
      detail: `${item.gapType} gap · due for review`,
      href: "/vocabulary/review",
      observedAt: item.dueAt,
    })));
  if (conjugation.status === "fulfilled") {
    const seen = new Set<string>();
    for (const item of conjugation.value) {
      const target = `${item.verb}:${item.tense}:${item.person}`;
      if (seen.has(target)) continue;
      seen.add(target);
      if (item.correct) continue;
      items.push({ id: `conjugation:${target}`, source: "conjugation",
        title: `${item.verb} · ${item.tense}`, detail: `Person ${item.person + 1} · latest answer incorrect`,
        href: "/conjugation", observedAt: item.answeredAt });
    }
  }
  if (quiz.status === "fulfilled") {
    const seen = new Set<string>();
    for (const item of quiz.value) {
      if (seen.has(item.questionId)) continue;
      seen.add(item.questionId);
      if (item.correct && !item.uncertain) continue;
      items.push({ id: `quiz:${item.questionId}`, source: "quiz",
        title: item.questionText, detail: `${item.title} · ${item.uncertain ? "uncertain" : "incorrect"}`,
        href: `/quiz/${encodeURIComponent(item.setId)}`, observedAt: item.answeredAt });
    }
  }
  return { items: items.sort((a, b) => (b.observedAt?.getTime() ?? 0) - (a.observedAt?.getTime() ?? 0)), unavailable };
}
