/**
 * Shared vocabulary helpers — used by server actions and server-side utilities.
 * NOT a "use server" file: these are plain server-side functions, not Next.js Server Actions.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userVocabulary,
  userVocabularyAliases,
  vocabularyLookups,
  vocabularyAliases,
  vocabularyOccurrences,
} from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";

/** Either the root client or a transaction handle — lets callers group the
 *  entry/alias/occurrence writes into one atomic unit. */
export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const norm = (s: string) => s.toLowerCase().normalize("NFC").trim();

/** Ensure the global lemma exists, then upsert only this user's contextual
 * fields. Never overwrites richEntry/savedAt/enrichedAt. */
export async function upsertEntry(
  userId: string,
  lemma: string,
  surface: string,
  result: LookupResult,
  dbx: Dbx = db,
) {
  await dbx
    .insert(vocabularyLookups)
    .values({
      id: randomUUID(),
      lemma,
      surface,
      lookedUpAt: new Date(),
    })
    .onConflictDoNothing({ target: vocabularyLookups.lemma });

  await dbx
    .insert(userVocabulary)
    .values({
      userId,
      lemma,
      surface,
      pos: result.pos,
      translation: result.translation,
      cefrLevel: result.level,
      inContext: result.in_context,
      examples: result.examples,
      sentenceContext: null,
      lookedUpAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userVocabulary.userId, userVocabulary.lemma],
      // Flat fields are refreshed for this user only.
      // richEntry, savedAt, and enrichedAt are intentionally excluded — they survive re-lookups.
      set: {
        pos: result.pos,
        translation: result.translation,
        cefrLevel: result.level,
        inContext: result.in_context,
        examples: result.examples,
        lookedUpAt: new Date(),
      },
    });
}

export async function upsertAlias(
  userId: string,
  surface: string,
  lemma: string,
  dbx: Dbx = db,
) {
  await dbx
    .insert(userVocabularyAliases)
    .values({ userId, surface, lemma, createdAt: new Date() })
    .onConflictDoNothing();
}

export async function recordOccurrence(opts: {
  userId: string;
  lemma: string;
  surface: string;
  sentenceContext: string;
  sourceType: "reading" | "tcf";
  documentId?: string | null;
  tcfQuestionId?: string | null;
}, dbx: Dbx = db) {
  await dbx
    .insert(vocabularyOccurrences)
    .values({
      id: randomUUID(),
      userId: opts.userId,
      lemma: opts.lemma,
      surface: opts.surface,
      sentenceContext: opts.sentenceContext,
      sourceType: opts.sourceType,
      documentId: opts.documentId ?? null,
      tcfQuestionId: opts.tcfQuestionId ?? null,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

/** Resolve a surface (or lemma) through this user's aliases, with the global
 * read-only alias table as a compatibility/curated fallback. */
export async function resolveLemma(userId: string, surface: string): Promise<string | null> {
  const s = norm(surface);
  const direct = await db
    .select({ lemma: vocabularyLookups.lemma })
    .from(vocabularyLookups)
    .where(eq(vocabularyLookups.lemma, s))
    .limit(1);
  if (direct[0]) return direct[0].lemma;
  const personalAlias = await db
    .select({ lemma: userVocabularyAliases.lemma })
    .from(userVocabularyAliases)
    .where(
      and(
        eq(userVocabularyAliases.userId, userId),
        eq(userVocabularyAliases.surface, s),
      ),
    )
    .limit(1);
  if (personalAlias[0]) return personalAlias[0].lemma;
  const alias = await db
    .select({ lemma: vocabularyAliases.lemma })
    .from(vocabularyAliases)
    .where(eq(vocabularyAliases.surface, s))
    .limit(1);
  return alias[0]?.lemma ?? null;
}

/** Ensure a lookup entry exists for a word; returns its lemma (null when the AI lookup fails). */
export async function ensureEntryForWord(userId: string, word: string): Promise<string | null> {
  const known = await resolveLemma(userId, word);
  if (known) {
    const personal = await db
      .select({ lemma: userVocabulary.lemma })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.lemma, known)))
      .limit(1);
    if (personal[0]) return known;
  }
  const { lookupWord } = await import("@/lib/ai/lookup");
  try {
    const result = await lookupWord(word, "");
    const lemma = norm(result.lemma || word);
    await upsertEntry(userId, lemma, word, result);
    await upsertAlias(userId, norm(word), lemma);
    return lemma;
  } catch {
    return null;
  }
}
