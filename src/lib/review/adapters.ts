import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { acceptedForms, DRILL_TENSES, PERSON_LABELS, type DrillTense, parseInfinitive } from "@/lib/conjugation/source";
import type { ReviewSnapshot } from "./types";
import type { Evidence, ReviewSource } from "./state";

export type ReviewDb = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
export const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export const reviewDataEnabled = () => process.env.REVIEW_DATA_ENABLED === "true";
export const reviewUiEnabled = () => reviewDataEnabled() && process.env.REVIEW_CENTER_ENABLED === "true";
export type Observation = Evidence & { attemptType: string; answer: unknown };
export type Resolved = { snapshot: ReviewSnapshot; history: Observation[]; available: "ready" | "unsupported" | "feedback_pending";
  gap?: typeof s.vocabularyGaps.$inferSelect };
export function conjugationKey(verb: string, tense: string, person: number) {
  const parsed = parseInfinitive(verb.normalize("NFC"));
  return JSON.stringify([parsed.pronominal ? `se ${parsed.verb}` : parsed.verb, tense, person]);
}

export async function resolveSource(tx: ReviewDb, userId: string, source: ReviewSource, key: string): Promise<Resolved | null> {
  const base: ReviewSnapshot = { version: 1, source, key, contentHash: "", title: "", prompt: "", passage: null,
    choices: null, media: null, image: null, skill: source, href: "/review", kind: "text", expected: [], explanation: null };
  let history: Observation[] = [];
  let available: Resolved["available"] = "ready";
  let gap: Resolved["gap"];
  if (source === "tcf") {
    const [row] = await tx.select({ q: s.tcfQuestions, set: s.tcfSets }).from(s.tcfQuestions)
      .innerJoin(s.tcfSets, eq(s.tcfSets.id,s.tcfQuestions.setId)).where(eq(s.tcfQuestions.id,key));
    if (!row) return null;
    Object.assign(base, { title: `TCF ${row.set.skill} · ${row.q.level}`, prompt: row.q.questionText, passage: row.q.passage,
      choices: row.q.options, expected: row.q.answer, media: row.q.audioPath, image: row.q.imagePath, kind: "choice",
      skill: row.set.skill, explanation: row.q.explanation, href: `/tcf/review?q=${row.q.id}` });
    if (row.set.skill === "listening" && !row.q.audioPath) available = "unsupported";
    history = (await tx.select().from(s.tcfQuestionAttempts).where(and(eq(s.tcfQuestionAttempts.userId,userId),eq(s.tcfQuestionAttempts.questionId,key))))
      .map(a => ({ id: a.id, attemptType: "tcf_question", at: a.answeredAt, answer: a.chosen, correct: a.correct, uncertain: a.uncertain,
        valid: a.gradeVersion === 1 && a.correct === (a.chosen === row.q.answer), independent: false }));
  } else if (source === "quiz") {
    const [row] = await tx.select({ q: s.quizQuestions, p: s.quizPassages, set: s.quizSets }).from(s.quizQuestions)
      .innerJoin(s.quizPassages,eq(s.quizPassages.id,s.quizQuestions.passageId))
      .innerJoin(s.quizSets,and(eq(s.quizSets.id,s.quizPassages.setId),eq(s.quizSets.userId,userId)))
      .where(eq(s.quizQuestions.id,key));
    if (!row) return null;
    Object.assign(base, { title: row.set.title, prompt: row.q.questionText, passage: row.p.text, choices: row.q.options,
      expected: row.q.type === "single" ? row.q.answer : Array.isArray(row.q.answer) ? row.q.answer : [row.q.answer],
      media: row.p.audioUrl, skill: row.set.section, kind: row.q.type === "single" ? "choice" : "text",
      explanation: row.q.explanation, href: `/quiz/${row.set.id}` });
    if (!(["single","fill_blank"] as string[]).includes(row.q.type)) available = "unsupported";
    if (row.q.type === "fill_blank") {
      // Stored dictation questionText is often the answer itself, never a safe prompt.
      base.prompt = "Listen and type the missing word."; base.passage = null;
      if (!row.p.audioUrl || row.q.audioStart===null || row.q.audioEnd===null) available="unsupported";
      else base.media = `${row.p.audioUrl}#t=${row.q.audioStart},${row.q.audioEnd}`;
    }
    history = (await tx.select().from(s.quizQuestionAttempts).where(and(eq(s.quizQuestionAttempts.userId,userId),eq(s.quizQuestionAttempts.questionId,key))))
      .map(a => ({ id: a.id, attemptType: "quiz_question", at: a.answeredAt, answer: a.answer, correct: a.correct,
        uncertain: a.uncertain, valid: a.graderVersion === 1, independent: false }));
  } else if (source === "writing") {
    const [row] = await tx.select({ e: s.errors, submission: s.submissions }).from(s.errors)
      .innerJoin(s.submissions,and(eq(s.submissions.id,s.errors.submissionId),eq(s.submissions.userId,userId)))
      .where(and(eq(s.errors.id,key),eq(s.errors.userId,userId)));
    if (!row) return null;
    const { e } = row;
    Object.assign(base, { title: `${e.category} · ${e.subcategory}`, prompt: e.microDrill ?? "", kind: "writing",
      expected: [e.correction], original: e.original, correction: e.correction, explanation: e.explanationEn,
      skill: "writing", href: `/practice/${row.submission.id}/feedback` });
    if (!e.microDrill || row.submission.contentFr.slice(e.spanStart,e.spanEnd) !== e.original) available = "unsupported";
    if (row.submission.feedbackStatus !== "ready") available = "feedback_pending";
    history = [{ id: e.id, attemptType: "writing_error", at: e.createdAt, answer: e.original, correct: false,
      uncertain: false, valid: available === "ready", independent: false }];
    for (const a of await tx.select().from(s.microDrills).where(and(eq(s.microDrills.userId,userId),eq(s.microDrills.errorId,key)))) {
      history.push({ id: a.id, attemptType: "micro_drill", at: a.createdAt, answer: a.responseFr,
        correct: a.feedbackStatus === "ready" ? a.feedbackJson?.ok ?? null : null, uncertain: false,
        valid: a.feedbackStatus === "ready" && !!a.feedbackJson && a.promptText === base.prompt, independent: false });
      if (a.feedbackStatus !== "ready") available = available === "unsupported" ? available : "feedback_pending";
    }
  } else if (source === "vocabulary") {
    const [row] = await tx.select({ gap: s.vocabularyGaps, word: s.userVocabulary }).from(s.vocabularyGaps)
      .innerJoin(s.userVocabulary,and(eq(s.userVocabulary.userId,userId),eq(s.userVocabulary.lemma,s.vocabularyGaps.lemma)))
      .where(and(eq(s.vocabularyGaps.userId,userId),eq(s.vocabularyGaps.id,key)));
    if (!row) return null;
    gap = row.gap;
    const recognition = gap.gapType === "recognition";
    Object.assign(base, { title: recognition ? row.word.lemma : "Vocabulary production", prompt: recognition ? `Translate: ${row.word.lemma}` : `Write in French: ${row.word.translation ?? ""}`,
      expected: recognition ? [row.word.translation ?? ""] : [row.word.lemma,row.word.surface],
      skill: `vocabulary_${gap.gapType}`, href: "/vocabulary/review" });
    // Browser speech synthesis would disclose the expected word in the prompt DTO.
    // Listening requires a versioned audio asset before the new runner can execute it.
    if (!row.word.translation || gap.gapType === "listening") available = "unsupported";
    history = (await tx.select().from(s.vocabularyReviewAttempts).where(and(eq(s.vocabularyReviewAttempts.userId,userId),eq(s.vocabularyReviewAttempts.gapId,key))))
      .map(a => ({ id: a.id, attemptType: "vocabulary_review", at: a.answeredAt, answer: a.answer,
        correct: a.correct, uncertain: false, valid: true, independent: false }));
  } else {
    let target: unknown;
    try { target = JSON.parse(key); } catch { return null; }
    if (!Array.isArray(target) || target.length !== 3) return null;
    const [verb, tense, person] = target as [string,string,number];
    if (typeof verb !== "string" || !DRILL_TENSES.includes(tense as DrillTense) || !Number.isInteger(person) || person < 0 || person > 5) return null;
    const accepted = acceptedForms(verb,tense as DrillTense,person);
    Object.assign(base, { title: `${verb} · ${tense}`, prompt: `Conjugate ${verb}: ${PERSON_LABELS[person]} (${tense})`, expected: accepted,
      target: { verb,tense,person }, href: "/conjugation" });
    if (!accepted.length) available = "unsupported";
    history = (await tx.select().from(s.conjugationAttempts).where(and(eq(s.conjugationAttempts.userId,userId),eq(s.conjugationAttempts.tense,tense),eq(s.conjugationAttempts.person,person))))
      .filter(a => conjugationKey(a.verb,a.tense,a.person) === key)
      .map(a => ({ id: a.id, attemptType: "conjugation", at: a.answeredAt, answer: a.userInput, correct: a.correct,
        uncertain: false, valid: accepted.includes(a.expected), independent: false }));
  }
  base.contentHash = hash({ ...base, contentHash: "" });
  return { snapshot: base, history, available, gap };
}

/** Read actual private source answers only after a reveal, never from list DTOs. */
export async function historyFor(tx: ReviewDb, userId: string, source: ReviewSource, key: string) {
  return (await resolveSource(tx,userId,source,key))?.history ?? [];
}

export async function expiredPauses(tx: ReviewDb, userId: string, now: Date) {
  // Kept here to share the exact same owner/time predicate in queries and starts.
  const { lte, sql } = await import("drizzle-orm");
  await tx.update(s.reviewItems).set({ management: "active", pauseUntil: null, revision: sql`${s.reviewItems.revision}+1` })
    .where(and(eq(s.reviewItems.userId,userId),eq(s.reviewItems.management,"paused"),lte(s.reviewItems.pauseUntil,now)));
}

/** Serialize owner-scoped review writes before source/row locks. */
export async function lockReviewOwner(tx: ReviewDb, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"review-owner:"+userId},0))`);
}
