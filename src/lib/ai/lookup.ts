// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CEFR_LEVELS } from "@/lib/cefr";
import { getOpenAI, MODELS } from "./client";

const LookupSchema = z.object({
  lemma: z.string(),
  pos: z.string(),
  level: z.enum(CEFR_LEVELS),
  /** The selection as it reads in this sentence ("tasted"); shown in the popover only. */
  translation: z.string(),
  /** The dictionary gloss of the lemma ("to taste"); what the vocabulary list stores. */
  lemma_translation: z.string(),
  in_context: z.string(),
  examples: z.array(z.string()),
});

export type LookupResult = z.infer<typeof LookupSchema>;

export async function lookupWord(
  word: string,
  sentenceContext: string,
): Promise<LookupResult> {
  const completion = await (await getOpenAI("lookup")).chat.completions.parse({
    model: MODELS.lookup,
    messages: [
      {
        role: "system",
        content: `You are a French language assistant helping an A2-B1 learner understand vocabulary in context.
Analyse the given French word or phrase as it appears in the provided sentence.

Fields to return:
- lemma: the dictionary base form — infinitive for verbs, masculine singular for adjectives, singular for nouns; lowercased. For non-inflecting words, the word itself.
- pos: part of speech with transitivity or gender, e.g. "verb · trans.", "noun · fem.", "adjective", "adverb", "phrase"
- level: CEFR level of the word (A1–C2)
- translation: concise English rendering of exactly the selected word or phrase as it reads in THIS sentence (e.g. "tasted", "I hear")
- lemma_translation: concise dictionary gloss of the LEMMA alone, 1–4 words, independent of this sentence and of the selected form; verbs as "to …" (e.g. "to taste", "to hear"), nouns in the singular
- in_context: 1–2 sentences explaining WHY this word is used this specific way in the sentence — cover agreement, conjugation form, idiomatic usage, or construction. This is not a general definition.
- examples: exactly 2 natural French sentences using the word in a similar way, different from the context sentence`,
      },
      {
        role: "user",
        content: `Word/phrase: "${word}"\n\nSentence context: "${sentenceContext}"`,
      },
    ],
    response_format: zodResponseFormat(LookupSchema, "lookup"),
    temperature: 0.3,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI lookup");
  return result;
}
