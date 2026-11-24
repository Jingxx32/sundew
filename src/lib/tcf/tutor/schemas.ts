import { z } from "zod";
import type { TcfGeneratedReviewItem, TcfNoteKind } from "@/lib/db/schema";
import { COMPREHENSION_TAG_IDS, isComprehensionTag, type ComprehensionTag } from "../tags";
import { findVocabularyDuplicate, type NoteLine } from "../notebook/rules";

const KINDS = ["vocabulary", "grammar", "hearing", "comprehension"] as const;

/** Structured-output shape: every field is required, optional values are nullable. */
export const ProposalSchema = z.object({
  result: z.enum(["none", "duplicate", "card"]),
  duplicate_index: z.number().nullable(),
  card: z
    .object({
      kind: z.enum(KINDS),
      comprehension_tag: z.enum(COMPREHENSION_TAG_IDS as [ComprehensionTag, ...ComprehensionTag[]]).nullable(),
      point: z.string(),
      front: z.string(),
      back: z.string(),
      lemma: z.string().nullable(),
      by_ear: z.boolean().nullable(),
      sentence: z.string().nullable(),
    })
    .nullable(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const CardDraftSchema = z.object({
  kind: z.enum(KINDS),
  point: z.string().min(1).max(160),
  front: z.string().min(1).max(400),
  back: z.string().min(1).max(400),
  lemma: z.string().max(80).nullable(),
  byEar: z.boolean(),
  comprehensionTag: z.string().refine(isComprehensionTag).nullable(),
  sentence: z.string().max(500).nullable(),
});
export type CardDraft = {
  kind: TcfNoteKind;
  point: string;
  front: string;
  back: string;
  lemma: string | null;
  byEar: boolean;
  comprehensionTag: ComprehensionTag | null;
  sentence: string | null;
};

export type CardProposalResult =
  | { type: "none" }
  | { type: "draft"; draft: CardDraft }
  | { type: "duplicate"; noteId: string; point: string };

const NONE: CardProposalResult = { type: "none" };
const clean = (s: string | null) => s?.normalize("NFC").trim() || null;

export function normalizeProposal(raw: Proposal, existing: NoteLine[]): CardProposalResult {
  if (raw.result === "duplicate") {
    const i = raw.duplicate_index;
    const note = i !== null && Number.isInteger(i) ? existing[i] : undefined;
    return note ? { type: "duplicate", noteId: note.id, point: note.point } : NONE;
  }
  if (raw.result !== "card" || !raw.card) return NONE;

  const c = raw.card;
  const isVocab = c.kind === "vocabulary";
  const lemma = isVocab ? clean(c.lemma) : null;
  if (isVocab) {
    if (!lemma) return NONE;
    const dup = findVocabularyDuplicate(existing, lemma);
    if (dup) return { type: "duplicate", noteId: dup.id, point: dup.point };
  }

  const parsed = CardDraftSchema.safeParse({
    kind: c.kind,
    point: clean(c.point) ?? "",
    front: clean(c.front) ?? "",
    back: clean(c.back) ?? "",
    lemma,
    byEar: isVocab && c.by_ear === true,
    comprehensionTag: isComprehensionTag(c.comprehension_tag) ? c.comprehension_tag : null,
    sentence: isVocab ? clean(c.sentence) : null,
  });
  return parsed.success ? { type: "draft", draft: parsed.data as CardDraft } : NONE;
}

export const ReviewBatchSchema = z.object({
  items: z.array(
    z.object({
      index: z.number(),
      stem: z.string(),
      options: z.array(z.string()),
      answer: z.number(),
      spoken: z.string().nullable(),
    }),
  ),
});

/** A generated review item is usable only if it has 4 distinct options and a valid key. */
export function validateReviewItem(raw: unknown, kind: TcfNoteKind): TcfGeneratedReviewItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const stem = typeof r.stem === "string" ? r.stem.trim() : "";
  if (!stem) return null;
  if (!Array.isArray(r.options) || r.options.length !== 4) return null;
  const options = r.options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
  if (typeof r.answer !== "number" || !Number.isInteger(r.answer) || r.answer < 0 || r.answer > 3) return null;
  let spoken: string | null = null;
  if (kind === "hearing") {
    spoken = typeof r.spoken === "string" ? r.spoken.trim() : "";
    if (!spoken) return null;
  }
  return { stem, options, answer: r.answer, spoken };
}
