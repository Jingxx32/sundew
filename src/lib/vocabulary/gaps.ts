/**
 * Vocabulary gap engine — upsert rules and Leitner scheduling.
 * Plain server-side helpers (NOT Server Actions), mirroring helpers.ts.
 * Historical design: docs/archive/specs/2026-08-31-vocab-gap-profile-design.md §2
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyGaps, vocabularyReviewAttempts, type VocabGapType, type VocabGapStatus } from "@/lib/db/schema";
import { syncReviewTarget } from "@/lib/review/service";
import { lockReviewOwner, reviewDataEnabled } from "@/lib/review/adapters";
import type { Dbx } from "./helpers";

/** Days until next review for box 1..5. Box 5 answered correctly → mastered. */
export const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

/**
 * Idempotent gap upsert. Rules (spec §2):
 * - no row            → insert active, box 1, due now
 * - active            → refresh source only (repeat signals never reset progress)
 * - mastered          → reactivate (forgot it): active, box 1, due now
 * - dismissed         → manual signals revive it; automatic ones respect the dismissal
 */
export async function upsertGap(opts: {
  userId: string;
  lemma: string;
  gapType: VocabGapType;
  source: "lookup" | "feedback" | "manual";
  dbx?: Dbx;
}): Promise<void> {
  const dbx = opts.dbx ?? db;
  const existing = (
    await dbx
      .select()
      .from(vocabularyGaps)
      .where(
        and(
          eq(vocabularyGaps.userId, opts.userId),
          eq(vocabularyGaps.lemma, opts.lemma),
          eq(vocabularyGaps.gapType, opts.gapType),
        ),
      )
      .limit(1)
  )[0];

  if (!existing) {
    await dbx.insert(vocabularyGaps).values({
      userId: opts.userId,
      lemma: opts.lemma,
      gapType: opts.gapType,
      source: opts.source,
    });
    return;
  }
  if (existing.status === "active") {
    await dbx
      .update(vocabularyGaps)
      .set({ source: opts.source })
      .where(and(eq(vocabularyGaps.id, existing.id), eq(vocabularyGaps.userId, opts.userId)));
    return;
  }
  if (existing.status === "mastered" || (existing.status === "dismissed" && opts.source === "manual")) {
    await dbx
      .update(vocabularyGaps)
      .set({ status: "active", box: 1, dueAt: new Date(), source: opts.source })
      .where(and(eq(vocabularyGaps.id, existing.id), eq(vocabularyGaps.userId, opts.userId)));
  }
  // dismissed + automatic source → no-op: the user said no.
}

/** Apply one review result. Correct: box+1 & schedule out (box 5 → mastered). Wrong: back to box 1, due tomorrow. */
export async function gradeGap(
  userId: string,
  gapId: string,
  correct: boolean,
  details?: { answer: string | null; gradingMethod: "objective" | "writing_feedback"; requestKey?: string },
): Promise<{ box: number; status: VocabGapStatus; correct: boolean }> {
  return db.transaction(tx => gradeGapInTransaction(tx,userId,gapId,correct,details));
}

export async function gradeGapInTransaction(
  tx: Dbx, userId: string, gapId: string, correct: boolean,
  details?: { answer: string | null; gradingMethod: "objective" | "writing_feedback"; requestKey?: string; practiceOnly?: boolean },
): Promise<{ box: number; status: VocabGapStatus; correct: boolean }> {
  if (reviewDataEnabled()) await lockReviewOwner(tx,userId);
  const requestHash = details?.requestKey ? createHash("sha256")
    .update(JSON.stringify({ gapId, answer: details.answer, gradingMethod: details.gradingMethod })).digest("hex") : null;
  const row = (
    await tx
      .select()
      .from(vocabularyGaps)
      .where(and(eq(vocabularyGaps.id, gapId), eq(vocabularyGaps.userId, userId)))
      .limit(1)
      .for("update")
  )[0];
  if (!row) throw new Error(`gap ${gapId} not found`);
  if (details?.requestKey) {
    const [existing] = await tx.select().from(vocabularyReviewAttempts).where(and(
      eq(vocabularyReviewAttempts.userId, userId), eq(vocabularyReviewAttempts.requestKey, details.requestKey),
    )).limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("Request key was reused with a different answer");
      return { box: existing.boxAfter, status: existing.statusAfter, correct: existing.correct };
    }
  }
  if (!details?.practiceOnly && details?.gradingMethod === "objective" && (row.status !== "active" || row.dueAt > new Date())) {
    throw new Error("Review card is no longer due");
  }

  let box: number;
  let status: VocabGapStatus;
  let dueAt: Date;
  if (details?.practiceOnly) { box=row.box; status=row.status; dueAt=row.dueAt; } else if (correct) {
    if (row.box >= 5) {
      box = 5;
      status = "mastered";
      dueAt = row.dueAt; // irrelevant once mastered
    } else {
      box = row.box + 1;
      status = "active";
      dueAt = days(LEITNER_INTERVAL_DAYS[box - 1]);
    }
  } else {
    box = 1;
    status = "active";
    dueAt = days(1);
  }
  await tx
    .update(vocabularyGaps)
    .set({ box, status, dueAt, lastReviewedAt: new Date() })
    .where(and(eq(vocabularyGaps.id, gapId), eq(vocabularyGaps.userId, userId)));
  await tx.insert(vocabularyReviewAttempts).values({
    userId, gapId, answer: details?.answer ?? null, correct,
    gradingMethod: details?.practiceOnly ? "practice_only" : details?.gradingMethod ?? "writing_feedback", boxBefore: row.box,
    boxAfter: box, statusAfter: status, requestKey: details?.requestKey ?? null, requestHash,
  });
  if (reviewDataEnabled()) await syncReviewTarget(tx,userId,"vocabulary",gapId);
  return { box, status, correct };
}
