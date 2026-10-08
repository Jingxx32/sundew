"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  writingTasks,
  submissions,
  documents,
  errors,
  tcfQuestions,
  tcfSets,
  userVocabularyAliases,
  vocabularyAliases,
  vocabularyGaps,
} from "@/lib/db/schema";
import { generateTask } from "@/lib/ai/task";
import { generateFeedback, type FeedbackResult } from "@/lib/ai/feedback";
import { countWords } from "@/lib/cefr";
import { buildLearnerProfile } from "@/lib/actions/learner-profile";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import { ensureEntryForWord, norm } from "@/lib/vocabulary/helpers";
import { upsertGap, gradeGap } from "@/lib/vocabulary/gaps";
import { getProductionGapLemmas } from "@/lib/actions/vocab-gaps";
import { requireUser } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";

const ARCHIVE_PLACEHOLDER_TITLE = "(Targeted practice from your error archive)";
const ARCHIVE_PLACEHOLDER_TYPE = "personal";
const ARCHIVE_PLACEHOLDER_CONTENT =
  "This task is generated from the student's error archive, not a specific document.";

export type GenerateTaskOptions = {
  /** Subcategory ids forced into the final `target_grammar` (pinned-first, capped at 3). */
  pinnedGrammar?: string[];
  /** For logging/debug only — task generation source. */
  source?: "document" | "vocab" | "archive";
};

export async function generateWritingTask(
  documentId: string | null,
  vocabWords: string[] = [],
  opts?: GenerateTaskOptions,
): Promise<string> {
  const user = await requireFeature("writing");
  const [doc, profile] = await Promise.all([
    documentId
      ? db
          .select()
          .from(documents)
          .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    buildLearnerProfile(),
  ]);

  if (documentId && !doc) throw new Error("Document not found");

  const targetLemmas = await getProductionGapLemmas();
  const result = await generateTask(
    doc?.title ?? ARCHIVE_PLACEHOLDER_TITLE,
    doc?.type ?? ARCHIVE_PLACEHOLDER_TYPE,
    doc?.content ?? ARCHIVE_PLACEHOLDER_CONTENT,
    doc?.estimatedLevel ?? profile.cefrLevel,
    vocabWords,
    { profile, targetLemmas },
  );

  // Enforce target_words constraint (PRD §7.3.3):
  // Must be a subset of collected vocab; ≤5 words → use all; >5 → AI picks subset (min 3).
  let targetWords = result.target_words;
  if (vocabWords.length > 0) {
    const collected = vocabWords.map((w) => w.toLowerCase());
    const filtered = targetWords.filter((w) => collected.includes(w.toLowerCase()));
    if (vocabWords.length <= 5) {
      targetWords = vocabWords;
    } else {
      targetWords = filtered.length >= 3 ? filtered : vocabWords.slice(0, 3);
    }
  }

  // Pinned grammar overrides AI's picks: pinned first, then AI's choices, capped at 3.
  let targetGrammar = result.target_grammar;
  if (opts?.pinnedGrammar && opts.pinnedGrammar.length > 0) {
    targetGrammar = [
      ...new Set([...opts.pinnedGrammar, ...result.target_grammar]),
    ].slice(0, 3);
  }

  const id = randomUUID();
  await db.insert(writingTasks).values({
    id,
    userId: user.id,
    documentId: documentId ?? null,
    promptEn: result.prompt_en,
    targetWords,
    targetGrammar,
    targetLemmas: targetLemmas.length ? targetLemmas : null,
    difficulty: result.difficulty,
    minWordCount: result.min_word_count,
    maxWordCount: result.max_word_count,
  });

  return id;
}

/* ------------------------------------------------------------------ */
/*  practiceFromPattern — Practice button on Progress page             */
/* ------------------------------------------------------------------ */

export async function practiceFromPattern(
  category: ErrorCategory,
  subcategory: string,
): Promise<string> {
  await requireFeature("writing");
  const def = ERROR_TAXONOMY[category];
  if (!def) throw new Error("Unknown error category.");
  const hasSub = Object.prototype.hasOwnProperty.call(
    def.subcategories,
    subcategory,
  );
  if (!hasSub) throw new Error("Unknown subcategory for this category.");

  const taskId = await generateWritingTask(null, [], {
    pinnedGrammar: [subcategory],
    source: "archive",
  });

  revalidatePath("/practice");
  revalidatePath("/progress");
  return taskId;
}

/**
 * One-click writing: generate an archive-driven task (no document) and land
 * straight on the task stage. Powers the "Écrire maintenant" entry.
 */
export async function quickWrite(): Promise<void> {
  await requireFeature("writing");
  const taskId = await generateWritingTask(null, [], { source: "archive" });
  revalidatePath("/practice");
  redirect(`/practice?taskId=${taskId}`);
}

/**
 * Generate a writing task anchored to a TCF reading passage — turns the 1500+
 * levelled passages already in the bank into zero-cost writing material.
 * Returns the task id; the (client) caller navigates to the task stage.
 */
export async function writeFromTcfPassage(questionId: string): Promise<string> {
  const user = await requireFeature("tcf");
  const row = await db
    .select({
      passage: tcfQuestions.passage,
      level: tcfQuestions.level,
      testNumber: tcfSets.testNumber,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfQuestions.id, questionId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!row?.passage) throw new Error("Question has no text passage");

  const profile = await buildLearnerProfile();
  const targetLemmas = await getProductionGapLemmas();
  const result = await generateTask(
    `TCF lecture · test ${row.testNumber}`,
    "news",
    row.passage,
    row.level,
    [],
    { profile, targetLemmas },
  );

  const id = randomUUID();
  await db.insert(writingTasks).values({
    id,
    userId: user.id,
    documentId: null,
    promptEn: result.prompt_en,
    targetWords: result.target_words,
    targetGrammar: result.target_grammar,
    targetLemmas: targetLemmas.length ? targetLemmas : null,
    difficulty: result.difficulty,
    minWordCount: result.min_word_count,
    maxWordCount: result.max_word_count,
  });
  revalidatePath("/practice");
  return id;
}

/**
 * LLM character offsets are notoriously unreliable. If the reported span doesn't
 * match `original`, recover it by unique-substring search; otherwise keep the
 * clamped span. Prevents mis-highlighted or silently dropped error cards.
 */
function repairSpan(
  content: string,
  original: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const clampedStart = Math.max(0, Math.min(content.length, start));
  const clampedEnd = Math.max(clampedStart, Math.min(content.length, end));
  if (content.slice(clampedStart, clampedEnd) === original) {
    return { start: clampedStart, end: clampedEnd };
  }
  if (original.length > 0) {
    const idx = content.indexOf(original);
    // Only trust the search when the substring occurs exactly once in the text.
    if (idx !== -1 && content.indexOf(original, idx + 1) === -1) {
      return { start: idx, end: idx + original.length };
    }
    console.warn(
      `[feedback] could not locate span for "${original}" — keeping clamped offsets`,
    );
  }
  return { start: clampedStart, end: clampedEnd };
}

/** Persist the feedback packet onto a submission and (re)insert its classified errors. */
async function persistFeedback(
  userId: string,
  submissionId: string,
  content: string,
  feedback: FeedbackResult,
): Promise<void> {
  await db
    .update(submissions)
    .set({
      feedbackJson: feedback,
      estimatedLevel: feedback.overall_level_estimate,
      praise: feedback.praise,
      summaryEn: feedback.summary_en,
      feedbackStatus: "ready",
    })
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)));

  if (feedback.errors.length > 0) {
    await db.insert(errors).values(
      feedback.errors.map((err) => {
        const span = repairSpan(content, err.original, err.span.start, err.span.end);
        return {
          id: randomUUID(),
          userId,
          submissionId,
          spanStart: span.start,
          spanEnd: span.end,
          original: err.original,
          correction: err.correction,
          category: err.category,
          subcategory: err.subcategory,
          triggerContext: err.trigger_context,
          explanationEn: err.explanation_en,
          frExamples: err.fr_examples,
          ruleId: err.rule_id,
          microDrill: err.micro_drill,
        };
      }),
    );
  }

  // Vocabulary-category corrections are words the learner failed to produce —
  // feed them into the gap profile (fire-and-forget; feedback must never fail on this).
  try {
    const vocabCorrections = feedback.errors
      .filter((err) => err.category === "Vocabulary")
      .map((err) => err.correction.trim())
      // Multi-word corrections are usually rephrasings, not a single learnable item.
      .filter((c) => c.length > 1 && c.split(/\s+/).length <= 3);
    for (const correction of vocabCorrections) {
      const lemma = await ensureEntryForWord(userId, correction);
      if (lemma) {
        await upsertGap({
          userId,
          lemma,
          gapType: "production",
          source: "feedback",
        });
      }
    }
  } catch (err) {
    console.error("[feedback] vocab gap ingest failed:", err);
  }

  // The task's target lemmas are production gaps it was asked to elicit —
  // if the learner actually used one and it wasn't flagged as a vocab error,
  // that's a successful review: advance its Leitner box.
  try {
    const task = await db
      .select({ targetLemmas: writingTasks.targetLemmas })
      .from(submissions)
      .innerJoin(writingTasks, eq(submissions.taskId, writingTasks.id))
      .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
      .limit(1)
      .then((r) => r[0] ?? null);
    const targetLemmas = (task?.targetLemmas as string[] | null) ?? [];
    if (targetLemmas.length > 0) {
      const flaggedOriginals = feedback.errors
        .filter((err) => err.category === "Vocabulary")
        .map((err) => norm(err.original));
      const normalizedContent = norm(content);
      for (const lemma of targetLemmas) {
        const [personalAliases, globalAliases] = await Promise.all([
          db
            .select({ surface: userVocabularyAliases.surface })
            .from(userVocabularyAliases)
            .where(
              and(
                eq(userVocabularyAliases.userId, userId),
                eq(userVocabularyAliases.lemma, lemma),
              ),
            ),
          db
            .select({ surface: vocabularyAliases.surface })
            .from(vocabularyAliases)
            .where(eq(vocabularyAliases.lemma, lemma)),
        ]);
        const aliasRows = [...personalAliases, ...globalAliases];
        const candidates = [lemma, ...aliasRows.map((r) => r.surface)].map(norm);
        const used = candidates.some((c) => normalizedContent.includes(c));
        const flagged = candidates.some((c) => flaggedOriginals.some((o) => o.includes(c) || c.includes(o)));
        if (!used || flagged) continue;
        const gapRow = (
          await db
            .select({ id: vocabularyGaps.id })
            .from(vocabularyGaps)
            .where(
              and(
                eq(vocabularyGaps.userId, userId),
                eq(vocabularyGaps.lemma, lemma),
                eq(vocabularyGaps.gapType, "production"),
              ),
            )
            .limit(1)
        )[0];
        if (gapRow) await gradeGap(userId, gapRow.id, true, {
          answer: lemma,
          gradingMethod: "writing_feedback",
          requestKey: `feedback-${submissionId}-${gapRow.id}`,
        });
      }
    }
  } catch (err) {
    console.error("[feedback] target-lemma grade-back failed:", err);
  }
}

export async function createSubmission(taskId: string, contentFr: string): Promise<void> {
  const user = await requireFeature("writing");
  const taskExists = await db
    .select({ id: writingTasks.id })
    .from(writingTasks)
    .where(and(eq(writingTasks.id, taskId), eq(writingTasks.userId, user.id)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!taskExists) throw new Error("Task not found");
  // NFC-normalise so AI-returned character offsets line up with accented chars
  const normalised = contentFr.normalize("NFC");
  const id = randomUUID();

  // Persist immediately with status 'pending' so the user never loses their
  // writing and the feedback page can show a "generating" state.
  await db.insert(submissions).values({
    id,
    userId: user.id,
    taskId,
    contentFr: normalised,
    wordCount: countWords(normalised),
    feedbackStatus: "pending",
  });
  revalidatePath("/today");
  revalidatePath("/progress");

  // Generate feedback after the response is sent, so submit returns in ~1s
  // instead of blocking on the 20-40s AI call. The feedback page polls until
  // status flips to 'ready' (or renders Retry on 'failed').
  after(async () => {
    try {
      const task = await db
        .select()
        .from(writingTasks)
        .where(and(eq(writingTasks.id, taskId), eq(writingTasks.userId, user.id)))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (!task) throw new Error(`Task ${taskId} not found`);

      const feedback = await generateFeedback(
        task.promptEn,
        (task.targetWords as string[]) ?? [],
        (task.targetGrammar as string[]) ?? [],
        task.difficulty ?? "B1",
        normalised,
      );
      await persistFeedback(user.id, id, normalised, feedback);
    } catch (err) {
      console.error("Feedback generation failed:", err);
      await db
        .update(submissions)
        .set({ feedbackStatus: "failed" })
        .where(and(eq(submissions.id, id), eq(submissions.userId, user.id)));
    }
    revalidatePath(`/practice/${id}/feedback`);
  });

  redirect(`/practice/${id}/feedback`);
}

/**
 * Re-run feedback generation for a submission whose first attempt failed
 * (feedbackJson is null) or that the user wants re-graded. Re-entrant: clears
 * any errors from a partial prior run before inserting the fresh set.
 */
export async function regenerateFeedback(
  submissionId: string,
): Promise<{ ok: boolean }> {
  const user = await requireFeature("writing");
  const submission = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!submission) return { ok: false };

  const task = await db
    .select()
    .from(writingTasks)
    .where(and(eq(writingTasks.id, submission.taskId), eq(writingTasks.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!task) return { ok: false };

  try {
    const feedback = await generateFeedback(
      task.promptEn,
      (task.targetWords as string[]) ?? [],
      (task.targetGrammar as string[]) ?? [],
      task.difficulty ?? "B1",
      submission.contentFr,
    );
    await db.delete(errors).where(and(eq(errors.submissionId, submissionId), eq(errors.userId, user.id)));
    await persistFeedback(user.id, submissionId, submission.contentFr, feedback);
    revalidatePath(`/practice/${submissionId}/feedback`);
    return { ok: true };
  } catch (err) {
    console.error("Feedback regeneration failed:", err);
    await db
      .update(submissions)
      .set({ feedbackStatus: "failed" })
      .where(and(eq(submissions.id, submissionId), eq(submissions.userId, user.id)));
    return { ok: false };
  }
}

export async function getWritingTaskWithDocument(id: string) {
  const user = await requireUser();
  const task = await db
    .select()
    .from(writingTasks)
    .where(and(eq(writingTasks.id, id), eq(writingTasks.userId, user.id)))
    .limit(1)
    .then((r) => r[0]);
  if (!task) return null;
  const doc = task.documentId
    ? await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, task.documentId), eq(documents.userId, user.id)))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;
  return { task, doc };
}

export async function listRecentSubmissions(limit = 5): Promise<Array<{ id: string; promptEn: string; submittedAt: Date }>> {
  const user = await requireUser();
  return db
    .select({ id: submissions.id, promptEn: writingTasks.promptEn, submittedAt: submissions.submittedAt })
    .from(submissions)
    .innerJoin(writingTasks, eq(writingTasks.id, submissions.taskId))
    .where(eq(submissions.userId, user.id))
    .orderBy(desc(submissions.submittedAt))
    .limit(limit);
}

export async function getSubmissionWithFeedback(submissionId: string) {
  const user = await requireUser();
  const submission = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!submission) return null;

  const task = await db
    .select()
    .from(writingTasks)
    .where(and(eq(writingTasks.id, submission.taskId), eq(writingTasks.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);

  const doc =
    task?.documentId
      ? await db
          .select()
          .from(documents)
          .where(and(eq(documents.id, task.documentId), eq(documents.userId, user.id)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

  const errorList = await db
    .select()
    .from(errors)
    .where(and(eq(errors.submissionId, submissionId), eq(errors.userId, user.id)));

  return { submission, task, doc, errors: errorList };
}
