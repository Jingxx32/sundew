// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI, MODELS } from "./client";
import type { WordTiming } from "./transcribe";
import { buildLearnerProfile } from "@/lib/actions/learner-profile";

const BlankSelectionSchema = z.object({
  blanks: z.array(
    z.object({
      /** Index into the numbered token list given in the prompt. */
      wordIndex: z.number().int().min(0),
      /** Why this word is pedagogically useful — kept for debuggability. */
      reason: z.string(),
    }),
  ),
});

/** Words too short or too grammatically empty to be worth dictating. */
const MIN_WORD_LETTERS = 3;

export async function selectBlanks(
  words: WordTiming[],
  count = 12,
): Promise<{ wordIndex: number }[]> {
  // D-1: bias selection toward the learner's weak categories when the
  // profile has enough signal (same threshold rule as task generation).
  let profileHint = "";
  try {
    const profile = await buildLearnerProfile();
    if (profile.hasEnoughSignal && profile.weakGrammar.length > 0) {
      const weak = profile.weakGrammar
        .slice(0, 5)
        .map((w) => `${w.category} / ${w.subcategory}`)
        .join("; ");
      profileHint = `\nThe learner's most frequent error categories are: ${weak}. Prioritise words that exercise these patterns.`;
    }
  } catch {
    // Profile is a bias, not a dependency — selection works without it.
  }

  const numbered = words.map((w, i) => `${i}:${w.word}`).join(" ");

  const completion = await (await getOpenAI()).chat.completions.parse({
    model: MODELS.task,
    messages: [
      {
        role: "system",
        content: `You are building a French cloze dictation exercise for an A2-B1 learner from a podcast transcript.
The transcript is given as numbered tokens ("index:word"). Choose exactly ${count} tokens to blank out (fewer only if the transcript is too short).

Choose words that are pedagogically valuable to *hear and spell*:
- verb endings that sound alike (-é / -er / -ait / -aient)
- words at liaison sites, elisions, or whose final letters are silent
- easily-confused homophones (à/a, ou/où, ses/ces, son/sont)
- agreement-bearing words (adjectives, past participles)${profileHint}

Rules:
- Return each choice as its token index. Never invent indices.
- Spread choices across the whole episode; never pick two adjacent tokens.
- Skip proper nouns, numbers, interjections/fillers (euh, ben), and words shorter than ${MIN_WORD_LETTERS} letters.
- reason: one short English phrase naming the teaching point.`,
      },
      {
        role: "user",
        content: numbered,
      },
    ],
    response_format: zodResponseFormat(BlankSelectionSchema, "blanks"),
    temperature: 0.2,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI blank selection");

  // The model's output is a suggestion — enforce validity server-side.
  const seen = new Set<number>();
  const valid: { wordIndex: number }[] = [];
  for (const blank of result.blanks) {
    const i = blank.wordIndex;
    if (i < 0 || i >= words.length) continue;
    if (seen.has(i) || seen.has(i - 1) || seen.has(i + 1)) continue;
    const letters = words[i].word.replace(/[^\p{L}]/gu, "");
    if (letters.length < MIN_WORD_LETTERS) continue;
    seen.add(i);
    valid.push({ wordIndex: i });
  }
  return valid.sort((a, b) => a.wordIndex - b.wordIndex);
}
