/**
 * Shared vocabulary helpers — used by server actions and server-side utilities.
 * NOT a "use server" file: these are plain server-side functions, not Next.js Server Actions.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyLookups, vocabularyAliases, vocabularyOccurrences } from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";

/** Either the root client or a transaction handle — lets callers group the
 *  entry/alias/occurrence writes into one atomic unit. */
export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const norm = (s: string) => s.toLowerCase().normalize("NFC").trim();

/** Upsert the lemma entry (never overwrites richEntry/savedAt/enrichedAt). */
export async function upsertEntry(
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
      pos: result.pos,
      translation: result.translation,
      cefrLevel: result.level,
      inContext: result.in_context,
      examples: result.examples,
      sentenceContext: "",
      lookedUpAt: new Date(),
    })
    .onConflictDoUpdate({
      target: vocabularyLookups.lemma,
      // Flat fields are refreshed on each lookup so the card always shows the most recent AI gloss.
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

export async function upsertAlias(surface: string, lemma: string, dbx: Dbx = db) {
  await dbx
    .insert(vocabularyAliases)
    .values({ surface, lemma, createdAt: new Date() })
    .onConflictDoNothing();
}

export async function recordOccurrence(opts: {
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

/** Resolve a surface (or lemma) to its lemma via the alias table. */
export async function resolveLemma(surface: string): Promise<string | null> {
  const s = norm(surface);
  const direct = await db
    .select({ lemma: vocabularyLookups.lemma })
    .from(vocabularyLookups)
    .where(eq(vocabularyLookups.lemma, s))
    .limit(1);
  if (direct[0]) return direct[0].lemma;
  const alias = await db
    .select({ lemma: vocabularyAliases.lemma })
    .from(vocabularyAliases)
    .where(eq(vocabularyAliases.surface, s))
    .limit(1);
  return alias[0]?.lemma ?? null;
}

/** Ensure a lookup entry exists for a word; returns its lemma (null when the AI lookup fails). */
export async function ensureEntryForWord(word: string): Promise<string | null> {
  const known = await resolveLemma(word);
  if (known) return known;
  const { lookupWord } = await import("@/lib/ai/lookup");
  try {
    const result = await lookupWord(word, "");
    const lemma = norm(result.lemma || word);
    await upsertEntry(lemma, word, result);
    await upsertAlias(norm(word), lemma);
    return lemma;
  } catch {
    return null;
  }
}
