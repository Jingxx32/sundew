import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CEFR_LEVELS } from "@/lib/cefr";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { LearnerProfile } from "@/lib/learner-profile";
import { getOpenAI, MODELS } from "./client";

const TaskSchema = z.object({
  prompt_en: z.string(),
  target_words: z.array(z.string()),
  target_grammar: z.array(z.string()),
  difficulty: z.enum(CEFR_LEVELS),
  min_word_count: z.number().int(),
  max_word_count: z.number().int(),
});

export type TaskResult = z.infer<typeof TaskSchema>;

export type GenerateTaskOptions = {
  /** When provided and `profile.hasEnoughSignal` is true, biases `target_grammar` toward weak subcategories. */
  profile?: LearnerProfile;
  /** Production-gap words to elicit. Independent of `profile`'s `hasEnoughSignal` gate — injected whenever present. */
  targetLemmas?: string[];
};

function buildTargetLemmasBlock(lemmas: string[]): string {
  return `\n\nDesign the task so it naturally elicits these French words the student cannot yet produce: ${lemmas.join(", ")}. Weave the topic and instructions so using them feels organic — do not just list them as a requirement.`;
}

function buildProfileSystemBlock(profile: LearnerProfile): string {
  const topWeak = profile.weakGrammar
    .slice(0, 5)
    .map((w) => `${w.subcategory} (${w.count})`)
    .join(", ");
  const strongSample = profile.strongGrammar.slice(0, 8).join(", ");
  return `\n\nThe student's accumulated error profile shows these recurring weak points: ${topWeak || "(none yet)"}. When choosing target_grammar, prefer these subcategories over generic level-appropriate picks, unless the document content makes them awkward.${
    strongSample
      ? ` Avoid target_grammar subcategories the student has already mastered: ${strongSample}.`
      : ""
  }`;
}

function buildProfileUserBlock(profile: LearnerProfile): string {
  return `\n\nThe student's CEFR level is ${profile.cefrLevel}. They have submitted ${profile.totalSubmissions} writing tasks so far.`;
}

const VALID_SUBCATEGORY_IDS = Object.values(ERROR_TAXONOMY)
  .flatMap((def) => Object.keys(def.subcategories))
  .join(", ");

export async function generateTask(
  docTitle: string,
  docType: string,
  docContent: string,
  docLevel: string,
  vocabWords: string[],
  opts?: GenerateTaskOptions,
): Promise<TaskResult> {
  const profile = opts?.profile;
  const useProfile = profile?.hasEnoughSignal === true;

  const systemContent = `You are an expert French teacher creating personalized writing tasks for a learner at CEFR level ${docLevel}.
The student has just read a French text. Generate a focused writing task that:
- Is directly anchored to the text's themes, characters, or arguments
- Requires use of the provided vocabulary words (use all of them if ≤5 are given, a meaningful subset otherwise)
- Targets 1–3 grammar points appropriate for level ${docLevel}
- Has a specific, engaging prompt — not a generic "write about the text" instruction

Valid grammar subcategory IDs: ${VALID_SUBCATEGORY_IDS}${
    useProfile && profile ? buildProfileSystemBlock(profile) : ""
  }${
    opts?.targetLemmas && opts.targetLemmas.length > 0 ? buildTargetLemmasBlock(opts.targetLemmas) : ""
  }`;

  const userContent = `Document title: ${docTitle}
Document type: ${docType}
Document excerpt: ${docContent.slice(0, 600)}${docContent.length > 600 ? "…" : ""}${
    vocabWords.length > 0
      ? `\n\nVocabulary to incorporate: ${vocabWords.join(", ")}`
      : ""
  }${useProfile && profile ? buildProfileUserBlock(profile) : ""}`;

  const completion = await (await getOpenAI()).chat.completions.parse({
    model: MODELS.task,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(TaskSchema, "task"),
    temperature: 0.7,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI task generation");
  return result;
}
