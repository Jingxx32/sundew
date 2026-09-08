/**
 * Vocabulary gap engine — upsert rules and Leitner scheduling.
 * Plain server-side helpers (NOT Server Actions), mirroring helpers.ts.
 * Historical design: docs/archive/specs/2026-08-31-vocab-gap-profile-design.md §2
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyGaps, type VocabGapType, type VocabGapStatus } from "@/lib/db/schema";
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
): Promise<{ box: number; status: VocabGapStatus }> {
  const row = (
    await db
      .select()
      .from(vocabularyGaps)
      .where(and(eq(vocabularyGaps.id, gapId), eq(vocabularyGaps.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new Error(`gap ${gapId} not found`);

  let box: number;
  let status: VocabGapStatus;
  let dueAt: Date;
  if (correct) {
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
  await db
    .update(vocabularyGaps)
    .set({ box, status, dueAt, lastReviewedAt: new Date() })
    .where(and(eq(vocabularyGaps.id, gapId), eq(vocabularyGaps.userId, userId)));
  return { box, status };
}
