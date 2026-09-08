// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI, MODELS } from "./client";

const FrTextPair = z.object({ fr: z.string(), en: z.string() });

// OpenAI strict structured outputs cannot express `z.record()` (arbitrary keys),
// so person forms and tenses use fixed-key objects with nullable values instead.
const Forms = z.object({
  je: z.string().nullable(),
  tu: z.string().nullable(),
  il: z.string().nullable(),
  nous: z.string().nullable(),
  vous: z.string().nullable(),
  ils: z.string().nullable(),
});

const TenseBlock = z.object({
  type: z.enum(["simple", "compound"]),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  recognition_only: z.boolean().nullable(),
  forms: Forms.nullable(),
  aux_tense: z.string().nullable(),
  sample: z.string().nullable(),
});

export type TenseBlock = z.infer<typeof TenseBlock>;

const Tenses = z.object({
  present: TenseBlock.nullable(),
  imparfait: TenseBlock.nullable(),
  futur_simple: TenseBlock.nullable(),
  conditionnel_present: TenseBlock.nullable(),
  subjonctif_present: TenseBlock.nullable(),
  passe_simple: TenseBlock.nullable(),
  passe_compose: TenseBlock.nullable(),
  plus_que_parfait: TenseBlock.nullable(),
  conditionnel_passe: TenseBlock.nullable(),
  subjonctif_passe: TenseBlock.nullable(),
});

const VerbSub = z.object({
  aux: z.enum(["avoir", "être"]),
  past_participle: z.string(),
  pp_agrees: z.boolean(),
  focus_tenses: z.array(z.string()),
  focus_reason: z.string().nullable(),
  tenses: Tenses,
});

// Per-POS sub-objects hold only structured / inflecting data (drill-ready).
// Prose usage tips live in the shared `note` field. AI fills the one sub-object
// matching `pos` and sets the rest to null.
const NounSub = z.object({
  gender: z.enum(["m", "f"]),
  gender_hint: z.string().nullable(),
  // Only when irregular (journaux, yeux, invariable); null = regular -s plural.
  plural: z.string().nullable(),
});

const AdjForms = z.object({
  ms: z.string(),
  fs: z.string(),
  mp: z.string(),
  fp: z.string(),
});

const AdjSub = z.object({
  forms: AdjForms,
  placement: z.enum(["before", "after", "either"]),
  // Irregular comparative/superlative (bon→meilleur, mauvais→pire); else null.
  comparison: z.string().nullable(),
});

const AdverbSub = z.object({
  formed_from: z.string().nullable(),
  formation_note: z.string().nullable(),
  position_note: z.string().nullable(),
});

const PrepositionSub = z.object({
  governs: z.array(z.string()),
  contractions: z.string().nullable(),
  contrast_note: z.string().nullable(),
});

const ExpressionSub = z.object({
  literal: z.string().nullable(),
  pattern: z.string().nullable(),
});

const FrenchVocabEntrySchema = z.object({
  id: z.string(),
  word: z.string(),
  pos: z.enum(["verb", "noun", "adjective", "adverb", "preposition", "expression"]),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  register: z.enum(["formal", "neutral", "informal"]).nullable(),
  meaning_en: z.string(),
  note: z.string().nullable(),
  collocations: z.array(FrTextPair),
  example: FrTextPair,
  canada_note: z.string().nullable(),
  verb: VerbSub.nullable(),
  noun: NounSub.nullable(),
  adjective: AdjSub.nullable(),
  adverb: AdverbSub.nullable(),
  preposition: PrepositionSub.nullable(),
  expression: ExpressionSub.nullable(),
});

export type FrenchVocabEntry = z.infer<typeof FrenchVocabEntrySchema>;

export async function enrichVocab(lemma: string, posHint: string | null): Promise<FrenchVocabEntry> {
  const completion = await getOpenAI().chat.completions.parse({
    model: MODELS.enrich,
    messages: [
      {
        role: "system",
        content: `You produce a structured French vocabulary entry for a TCF Canada (A1–B2) learner, English glosses.
Follow these rules exactly:
- id: "fr_" + slugified lemma.
- Fill ONLY the one POS sub-object matching pos (verb/noun/adjective/adverb/preposition/expression); set every other sub-object to null.

Shared fields:
- register: "formal"/"neutral"/"informal" only when notably marked, else null.
- note: one short usage tip (when/how to use, key pitfall), else null.
- collocations: only genuine high-frequency ones, else [].
- canada_note: only when Québec usage differs, else null.

verb sub-object:
- The tenses object has a fixed key per tense; set any tense you don't produce to null.
- Store SIMPLE tenses (present, imparfait, futur_simple, conditionnel_present, subjonctif_present, passe_simple) with all six person forms in the forms object (je/tu/il/nous/vous/ils). Store the bare conjugated verb form only — no "que"/"qu'" prefix, no subject pronoun (e.g. subjonctif_present je → "sois", not "que je sois"). passe_simple is recognition_only with only il/ils filled (other persons null).
- For COMPOUND tenses (passe_compose, plus_que_parfait, conditionnel_passe, subjonctif_passe) set type:"compound", fill level/aux_tense/sample, and leave forms null.
- Do NOT include futur_proche.
- Per-tense level uses the default tense→level map; override earlier only when genuinely taught earlier (être/avoir imparfait → A1).

noun sub-object:
- gender: "m"/"f". gender_hint: a memory rule (ending pattern/exception) only if useful, else null.
- plural: only when irregular (journaux, yeux, invariable), else null (regular -s).

adjective sub-object:
- forms: all four — ms (masc sing), fs (fem sing), mp (masc plur), fp (fem plur). Fill all even when identical (invariable).
- placement: "before" (BANGS — beauty/age/number/goodness/size), "after", or "either".
- comparison: irregular comparative/superlative only (bon→meilleur), else null.

adverb sub-object (adverbs are invariable — no forms):
- formed_from: source adjective if -ment-derived, else null. formation_note: e.g. "constant→constamment", else null. position_note: where it sits in the sentence, else null.

preposition sub-object:
- governs: what typically follows, e.g. ["à + infinitif", "lieu/ville"].
- contractions: au/aux/du/des etc. only for à/de, else null.
- contrast_note: short à/de/en/dans/sur disambiguation when relevant, else null.

expression sub-object (meaning_en is the idiomatic meaning):
- literal: word-for-word gloss if illuminating, else null. pattern: slot structure like "avoir besoin de + qch/inf", else null.`,
      },
      {
        role: "user",
        content: `Lemma: "${lemma}"${posHint ? `\nLikely part of speech: ${posHint}` : ""}`,
      },
    ],
    response_format: zodResponseFormat(FrenchVocabEntrySchema, "vocab_entry"),
    temperature: 0.2,
  });
  const parsed = completion.choices[0].message.parsed;
  if (!parsed) throw new Error("No result from OpenAI enrich");
  return parsed;
}
