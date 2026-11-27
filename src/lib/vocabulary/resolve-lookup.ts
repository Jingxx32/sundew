import "server-only";

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { userVocabulary, type VocabGapType } from "@/lib/db/schema";
import { lookupWord, type LookupResult } from "@/lib/ai/lookup";
import { norm, upsertEntry, upsertAlias, recordOccurrence, resolveLemma } from "@/lib/vocabulary/helpers";
import { upsertGap } from "@/lib/vocabulary/gaps";
import type { GapSource } from "@/lib/vocabulary/leitner";
import type { LookupOutcome, LookupSource } from "@/lib/vocabulary/types";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canUse } from "@/lib/access/features";
import sampleLookups from "@/lib/sample-workspace/fixtures/lookups.json";
import { sampleLookupKey } from "@/lib/sample-workspace/lookups";

const SAMPLE_LOOKUPS = sampleLookups as Record<string, LookupResult>;

/** The gap a look-up leaves behind: a plain look-up is a recognition gap from "lookup". */
export type GapSignal = { gapType: VocabGapType; source: GapSource };
const DEFAULT_GAP: GapSignal = { gapType: "recognition", source: "lookup" };

/** Writes a look-up result for this user: entry, alias, occurrence and the chosen gap, atomically. */
async function persistLookup(userId: string, surface: string, sentenceContext: string, source: LookupSource, result: LookupResult, gap: GapSignal): Promise<string> {
  const resolved = norm(result.lemma || surface);
  await db.transaction(async (tx) => {
    await upsertEntry(userId, resolved, surface, result, tx, sentenceContext || null);
    await upsertAlias(userId, norm(surface), resolved, tx);
    await recordOccurrence({
      userId, lemma: resolved, surface, sentenceContext,
      sourceType: source.type,
      documentId: source.type === "reading" ? source.documentId : null,
      tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
    }, tx);
    await upsertGap({ userId, lemma: resolved, gapType: gap.gapType, source: gap.source, dbx: tx });
  });
  return resolved;
}

/** Look-up core for an already-authenticated user; the caller has validated `source`. */
export async function resolveLookupForUser(
  user: AuthenticatedUser,
  surface: string,
  sentenceContext: string,
  source: LookupSource,
  gap: GapSignal = DEFAULT_GAP,
): Promise<LookupOutcome> {
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
      await upsertGap({ userId: user.id, lemma, gapType: gap.gapType, source: gap.source });
      // The stored entry holds the lemma's gloss; its explanation fits only the sentence
      // it was written for, so a different sentence gets none (the popover offers one).
      const result: LookupResult = {
        lemma: row.lemma,
        pos: row.pos ?? "",
        level: (row.cefrLevel ?? "A1") as LookupResult["level"],
        translation: "",
        lemma_translation: row.translation ?? "",
        in_context: row.sentenceContext === sentenceContext ? (row.inContext ?? "") : "",
        examples: (row.examples as string[]) ?? [],
      };
      return { status: "ok", lemma, surface, result, cached: true };
    }
  }

  const rule = canUse(user.access, "lookup");
  if (rule !== true) {
    // Guests: pre-generated entries for the sample texts only — never an AI call.
    const sampleKey = sampleLookupKey(surface);
    const sample = rule === "sample" && Object.hasOwn(SAMPLE_LOOKUPS, sampleKey) ? SAMPLE_LOOKUPS[sampleKey] : undefined;
    if (!sample) return { status: "locked", feature: "lookup" };
    const resolved = await persistLookup(user.id, surface, sentenceContext, source, sample, gap);
    return { status: "ok", lemma: resolved, surface, result: sample, cached: true };
  }

  // Cache miss — Tier 1 AI. The writes are one atomic unit (see persistLookup): a
  // partial failure would otherwise leave an entry without its alias/occurrence.
  const result = await lookupWord(surface, sentenceContext);
  const resolved = await persistLookup(user.id, surface, sentenceContext, source, result, gap);
  return { status: "ok", lemma: resolved, surface, result, cached: false };
}
