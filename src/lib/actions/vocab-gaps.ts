"use server";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveLookup } from "@/lib/actions/vocabulary";
import { upsertGap, gradeGap } from "@/lib/vocabulary/gaps";
import {
  vocabularyGaps,
  vocabularyLookups,
  type VocabGapType,
  type VocabGapStatus,
} from "@/lib/db/schema";

/** Manual gap marking from a TCF question. Creates the entry (cache-first lookup),
 *  the occurrence, and the gap row. */
export async function markTcfVocabGap(input: {
  surface: string;
  sentenceContext: string;
  tcfQuestionId: string;
  gapType: VocabGapType;
}): Promise<void> {
  const { lemma } = await resolveLookup(input.surface, input.sentenceContext, {
    type: "tcf",
    tcfQuestionId: input.tcfQuestionId,
  });
  await upsertGap({ lemma, gapType: input.gapType, source: "manual" });
}

/* ------------------------------------------------------------------ */
/*  Review queue                                                        */
/* ------------------------------------------------------------------ */

export type GapReviewCard = {
  gapId: string;
  lemma: string;
  surface: string;
  gapType: VocabGapType;
  box: number;
  translation: string;
  sentenceContext: string | null;
  examples: string[];
  /** recognition: 4 translations; listening: 4 lemmas; production: [] */
  choices: string[];
  /** -1 for production (free-text, no fixed choice set) */
  answerIndex: number;
};

const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

export async function getDueGapCards(limit = 20): Promise<GapReviewCard[]> {
  const rows = await db
    .select({
      gapId: vocabularyGaps.id,
      lemma: vocabularyGaps.lemma,
      gapType: vocabularyGaps.gapType,
      box: vocabularyGaps.box,
      surface: vocabularyLookups.surface,
      translation: vocabularyLookups.translation,
      sentenceContext: vocabularyLookups.sentenceContext,
      inContext: vocabularyLookups.inContext,
      examples: vocabularyLookups.examples,
    })
    .from(vocabularyGaps)
    .innerJoin(vocabularyLookups, eq(vocabularyGaps.lemma, vocabularyLookups.lemma))
    .where(and(eq(vocabularyGaps.status, "active"), lte(vocabularyGaps.dueAt, new Date())))
    .orderBy(asc(vocabularyGaps.dueAt))
    .limit(limit);

  // Distractor pool: 30 random other entries with a translation.
  const pool = await db
    .select({ lemma: vocabularyLookups.lemma, translation: vocabularyLookups.translation })
    .from(vocabularyLookups)
    .where(sql`${vocabularyLookups.translation} is not null`)
    .orderBy(sql`random()`)
    .limit(30);

  return rows
    .filter((r) => r.translation) // a card without a translation can't be graded
    .map((r) => {
      const others = pool.filter((p) => p.lemma !== r.lemma);
      const base = {
        gapId: r.gapId,
        lemma: r.lemma,
        surface: r.surface,
        gapType: r.gapType,
        box: r.box,
        translation: r.translation!,
        sentenceContext: r.sentenceContext ?? r.inContext,
        examples: (r.examples as string[]) ?? [],
      };
      if (r.gapType === "production") {
        return { ...base, choices: [], answerIndex: -1 };
      }
      const distractors = shuffle(others).slice(0, 3);
      const options =
        r.gapType === "recognition"
          ? [r.translation!, ...distractors.map((d) => d.translation!)]
          : [r.lemma, ...distractors.map((d) => d.lemma)]; // listening: pick the word you heard
      const order = shuffle(options.map((_, i) => i));
      return { ...base, choices: order.map((i) => options[i]), answerIndex: order.indexOf(0) };
    });
}

export async function gradeGapReview(gapId: string, correct: boolean): Promise<{ box: number; status: VocabGapStatus }> {
  const result = await gradeGap(gapId, correct);
  revalidatePath("/vocabulary/review");
  return result;
}

/** Set a gap's status. Setting `active` also resets box/dueAt (used by the
 *  management list's "Réactiver" on a dismissed/mastered row). */
export async function setGapStatus(gapId: string, status: VocabGapStatus): Promise<void> {
  if (status === "active") {
    await db
      .update(vocabularyGaps)
      .set({ status: "active", box: 1, dueAt: new Date() })
      .where(eq(vocabularyGaps.id, gapId));
  } else {
    await db.update(vocabularyGaps).set({ status }).where(eq(vocabularyGaps.id, gapId));
  }
  revalidatePath("/vocabulary/review");
}

/** Change a gap's type. If a row for (lemma, newType) already exists, the
 *  current row is dropped (merge) rather than creating a duplicate. */
export async function changeGapType(gapId: string, gapType: VocabGapType): Promise<void> {
  const current = (
    await db.select().from(vocabularyGaps).where(eq(vocabularyGaps.id, gapId)).limit(1)
  )[0];
  if (!current) return;

  const existing = (
    await db
      .select()
      .from(vocabularyGaps)
      .where(and(eq(vocabularyGaps.lemma, current.lemma), eq(vocabularyGaps.gapType, gapType)))
      .limit(1)
  )[0];

  if (existing) {
    await db.delete(vocabularyGaps).where(eq(vocabularyGaps.id, gapId));
  } else {
    await db.update(vocabularyGaps).set({ gapType }).where(eq(vocabularyGaps.id, gapId));
  }
  revalidatePath("/vocabulary/review");
}

export type GapListRow = {
  gapId: string;
  lemma: string;
  translation: string | null;
  gapType: VocabGapType;
  status: VocabGapStatus;
  box: number;
  dueAt: Date;
};

export async function listGaps(): Promise<GapListRow[]> {
  const rows = await db
    .select({
      gapId: vocabularyGaps.id,
      lemma: vocabularyGaps.lemma,
      translation: vocabularyLookups.translation,
      gapType: vocabularyGaps.gapType,
      status: vocabularyGaps.status,
      box: vocabularyGaps.box,
      dueAt: vocabularyGaps.dueAt,
    })
    .from(vocabularyGaps)
    .innerJoin(vocabularyLookups, eq(vocabularyGaps.lemma, vocabularyLookups.lemma))
    .orderBy(sql`case when ${vocabularyGaps.status} != 'dismissed' then 0 else 1 end`, asc(vocabularyGaps.dueAt));
  return rows;
}

/** Top production gaps for task injection: lowest box first, then oldest. */
export async function getProductionGapLemmas(limit = 5): Promise<string[]> {
  const rows = await db
    .select({ lemma: vocabularyGaps.lemma })
    .from(vocabularyGaps)
    .where(and(eq(vocabularyGaps.status, "active"), eq(vocabularyGaps.gapType, "production")))
    .orderBy(asc(vocabularyGaps.box), asc(vocabularyGaps.createdAt))
    .limit(limit);
  return rows.map((r) => r.lemma);
}
