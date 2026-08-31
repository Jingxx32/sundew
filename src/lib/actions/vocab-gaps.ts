"use server";

import { resolveLookup } from "@/lib/actions/vocabulary";
import { upsertGap } from "@/lib/vocabulary/gaps";
import type { VocabGapType } from "@/lib/db/schema";

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
