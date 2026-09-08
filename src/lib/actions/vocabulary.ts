"use server";

import { after } from "next/server";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userVocabulary,
  vocabularyOccurrences,
  documents,
  tcfQuestions,
  tcfSets,
} from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";
import { lookupWord } from "@/lib/ai/lookup";
import { enrichVocab, type FrenchVocabEntry } from "@/lib/ai/enrich";
import { norm, upsertEntry, upsertAlias, recordOccurrence, resolveLemma } from "@/lib/vocabulary/helpers";
import { upsertGap } from "@/lib/vocabulary/gaps";
import type { LookupSource, VocabEntrySummary, VocabEntryDetail } from "@/lib/vocabulary/types";
import { requireUser } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type { LookupSource, OccurrenceLink, VocabEntrySummary, VocabEntryDetail } from "@/lib/vocabulary/types";

/* ------------------------------------------------------------------ */
/*  Cache-first lookup                                                  */
/* ------------------------------------------------------------------ */

export async function resolveLookup(
  surface: string,
  sentenceContext: string,
  source: LookupSource,
): Promise<{ lemma: string; surface: string; result: LookupResult; cached: boolean }> {
  const user = await requireUser();
  await assertLookupSource(user.id, source);
  const lemma = await resolveLemma(user.id, surface);

  // Cache hit — zero AI
  if (lemma) {
    const row = (
      await db
        .select()
        .from(userVocabulary)
        .where(and(eq(userVocabulary.userId, user.id), eq(userVocabulary.lemma, lemma)))
        .limit(1)
    )[0];
    if (row) {
      await recordOccurrence({
        userId: user.id,
        lemma,
        surface,
        sentenceContext,
        sourceType: source.type,
        documentId: source.type === "reading" ? source.documentId : null,
        tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
      });
      await upsertGap({ userId: user.id, lemma, gapType: "recognition", source: "lookup" });
      const result: LookupResult = {
        lemma: row.lemma,
        pos: row.pos ?? "",
        level: (row.cefrLevel ?? "A1") as LookupResult["level"],
        translation: row.translation ?? "",
        in_context: row.inContext ?? "",
        examples: (row.examples as string[]) ?? [],
      };
      return { lemma, surface, result, cached: true };
    }
  }

  // Cache miss — Tier 1 AI. The three writes are one atomic unit: a partial
  // failure would otherwise leave an entry without its alias/occurrence.
  const result = await lookupWord(surface, sentenceContext);
  const resolved = norm(result.lemma || surface);
  await db.transaction(async (tx) => {
    await upsertEntry(user.id, resolved, surface, result, tx);
    await upsertAlias(user.id, norm(surface), resolved, tx);
    await recordOccurrence({
      userId: user.id,
      lemma: resolved,
      surface,
      sentenceContext,
      sourceType: source.type,
      documentId: source.type === "reading" ? source.documentId : null,
      tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
    }, tx);
    await upsertGap({
      userId: user.id,
      lemma: resolved,
      gapType: "recognition",
      source: "lookup",
      dbx: tx,
    });
  });
  return { lemma: resolved, surface, result, cached: false };
}

export async function reexplainInContext(lemma: string, sentenceContext: string): Promise<string> {
  const user = await requireUser();
  const owned = await db
    .select({ lemma: userVocabulary.lemma })
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, user.id), eq(userVocabulary.lemma, lemma)))
    .limit(1);
  if (owned.length === 0) throw new Error("Vocabulary entry not found");
  const r = await lookupWord(lemma, sentenceContext);
  await db
    .update(userVocabulary)
    .set({ inContext: r.in_context, sentenceContext, lookedUpAt: new Date() })
    .where(and(eq(userVocabulary.userId, user.id), eq(userVocabulary.lemma, lemma)));
  return r.in_context;
}

/* ------------------------------------------------------------------ */
/*  Save + enrich                                                       */
/* ------------------------------------------------------------------ */

export async function saveVocabularyWord(word: string): Promise<void> {
  const user = await requireUser();
  const lemma = (await resolveLemma(user.id, word)) ?? norm(word);
  const saved = await db
    .update(userVocabulary)
    .set({ savedAt: new Date() })
    .where(and(eq(userVocabulary.userId, user.id), eq(userVocabulary.lemma, lemma)))
    .returning({ lemma: userVocabulary.lemma });
  if (saved.length === 0) return;
  // Enrich after the response is sent (Next's official post-response hook), so
  // the save returns instantly and the work is still guaranteed to run.
  after(async () => {
    try {
      await enrichEntryForUser(user.id, lemma);
    } catch (err) {
      console.error(`enrich failed for "${lemma}":`, err);
    }
  });
}

export async function enrichEntry(lemma: string): Promise<void> {
  const user = await requireUser();
  await enrichEntryForUser(user.id, lemma);
}

async function enrichEntryForUser(userId: string, lemma: string): Promise<void> {
  const row = (
    await db
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.lemma, lemma)))
      .limit(1)
  )[0];
  if (!row) return;
  const rich = await enrichVocab(lemma, row.pos);
  await db
    .update(userVocabulary)
    .set({ richEntry: rich, enrichedAt: new Date() })
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.lemma, lemma)));
}

/* ------------------------------------------------------------------ */
/*  Library queries                                                     */
/* ------------------------------------------------------------------ */

export async function getVocabEntries(
  filter: { savedOnly?: boolean } = {},
): Promise<VocabEntrySummary[]> {
  const user = await requireUser();
  // Summary columns only — never pull the (potentially multi-KB) richEntry jsonb
  // for the list view.
  const rows = await db
    .select({
      lemma: userVocabulary.lemma,
      surface: userVocabulary.surface,
      pos: userVocabulary.pos,
      cefrLevel: userVocabulary.cefrLevel,
      translation: userVocabulary.translation,
      savedAt: userVocabulary.savedAt,
      enrichedAt: userVocabulary.enrichedAt,
    })
    .from(userVocabulary)
    .where(
      and(
        eq(userVocabulary.userId, user.id),
        filter.savedOnly ? isNotNull(userVocabulary.savedAt) : undefined,
      ),
    )
    .orderBy(desc(userVocabulary.lookedUpAt));
  return rows.map((r) => ({
    lemma: r.lemma,
    surface: r.surface,
    pos: r.pos,
    cefrLevel: r.cefrLevel,
    translation: r.translation,
    saved: r.savedAt != null,
    enriched: r.enrichedAt != null,
  }));
}

export async function getVocabEntryDetail(lemma: string): Promise<VocabEntryDetail | null> {
  const user = await requireUser();
  const row = (
    await db
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, user.id), eq(userVocabulary.lemma, lemma)))
      .limit(1)
  )[0];
  if (!row) return null;
  const occ = await db
    .select({
      sourceType: vocabularyOccurrences.sourceType,
      documentId: vocabularyOccurrences.documentId,
      documentTitle: documents.title,
      tcfQuestionId: vocabularyOccurrences.tcfQuestionId,
      tcfTestNumber: tcfSets.testNumber,
      tcfOrderIndex: tcfQuestions.orderIndex,
      surface: vocabularyOccurrences.surface,
      sentenceContext: vocabularyOccurrences.sentenceContext,
    })
    .from(vocabularyOccurrences)
    .leftJoin(documents, eq(vocabularyOccurrences.documentId, documents.id))
    .leftJoin(tcfQuestions, eq(vocabularyOccurrences.tcfQuestionId, tcfQuestions.id))
    .leftJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(
      and(
        eq(vocabularyOccurrences.userId, user.id),
        eq(vocabularyOccurrences.lemma, lemma),
      ),
    )
    .orderBy(desc(vocabularyOccurrences.createdAt));
  return {
    lemma: row.lemma,
    surface: row.surface,
    pos: row.pos,
    cefrLevel: row.cefrLevel,
    translation: row.translation,
    saved: row.savedAt != null,
    enriched: row.enrichedAt != null,
    inContext: row.inContext,
    examples: (row.examples as string[]) ?? [],
    conjugation: row.conjugation,
    richEntry: (row.richEntry as FrenchVocabEntry | null) ?? null,
    occurrences: occ.map((o) => ({
      sourceType: o.sourceType,
      documentId: o.documentId,
      documentTitle: o.documentTitle,
      tcfQuestionId: o.tcfQuestionId,
      tcfTestNumber: o.tcfTestNumber,
      tcfOrderIndex: o.tcfOrderIndex,
      surface: o.surface,
      sentenceContext: o.sentenceContext,
    })),
  };
}

/** This user's saved lemmas, used by contexts without a document scope such as TCF drills. */
export async function getAllSavedLemmas(): Promise<string[]> {
  const user = await requireUser();
  const rows = await db
    .select({ lemma: userVocabulary.lemma })
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, user.id), isNotNull(userVocabulary.savedAt)));
  return rows.map((r) => r.lemma);
}

export async function getSavedWordsByDocument(documentId: string): Promise<string[]> {
  const user = await requireUser();
  const rows = await db
    .select({ lemma: vocabularyOccurrences.lemma })
    .from(vocabularyOccurrences)
    .innerJoin(
      userVocabulary,
      and(
        eq(vocabularyOccurrences.userId, userVocabulary.userId),
        eq(vocabularyOccurrences.lemma, userVocabulary.lemma),
      ),
    )
    .where(
      and(
        eq(vocabularyOccurrences.userId, user.id),
        eq(vocabularyOccurrences.documentId, documentId),
        isNotNull(userVocabulary.savedAt),
      ),
    );
  return Array.from(new Set(rows.map((r) => r.lemma)));
}

async function assertLookupSource(userId: string, source: LookupSource): Promise<void> {
  if (source.type === "reading") {
    const document = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, source.documentId), eq(documents.userId, userId)))
      .limit(1);
    if (document.length === 0) throw new Error("Document not found");
    return;
  }

  const question = await db
    .select({ id: tcfQuestions.id })
    .from(tcfQuestions)
    .where(eq(tcfQuestions.id, source.tcfQuestionId))
    .limit(1);
  if (question.length === 0) throw new Error("TCF question not found");
}
