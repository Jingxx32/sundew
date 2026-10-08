import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CEFR_LEVELS } from "@/lib/cefr";
import { ERROR_TAXONOMY, ALL_SUBCATEGORIES } from "@/lib/taxonomy";
import { getOpenAI, MODELS } from "./client";

const CATEGORY_KEYS = Object.keys(ERROR_TAXONOMY) as [string, ...string[]];
const SUBCATEGORY_KEYS = ALL_SUBCATEGORIES.map((s) => s.subcategory) as [string, ...string[]];

const SpanSchema = z.object({
  start: z.number().int(),
  end: z.number().int(),
});

const ErrorItemSchema = z.object({
  span: SpanSchema,
  original: z.string(),
  correction: z.string(),
  category: z.enum(CATEGORY_KEYS),
  subcategory: z.enum(SUBCATEGORY_KEYS),
  trigger_context: z.string().nullable(),
  explanation_en: z.string(),
  fr_examples: z.array(z.string()),
  rule_id: z.string().nullable(),
  micro_drill: z.string().nullable(),
});

const ImprovementItemSchema = z.object({
  span: SpanSchema,
  original: z.string(),
  suggestion: z.string(),
  explanation_en: z.string(),
});

export const FeedbackSchema = z.object({
  errors: z.array(ErrorItemSchema),
  improvements: z.array(ImprovementItemSchema),
  praise: z.array(z.string()).min(1),
  overall_level_estimate: z.enum(CEFR_LEVELS),
  summary_en: z.string(),
});

export type FeedbackResult = z.infer<typeof FeedbackSchema>;

export async function generateFeedback(
  taskPrompt: string,
  targetWords: string[],
  targetGrammar: string[],
  level: string,
  contentFr: string,
): Promise<FeedbackResult> {
  const subcategoryList = ALL_SUBCATEGORIES.map(
    (s) => `${s.subcategory} (${s.category}: ${s.label})`,
  ).join(", ");

  const completion = await (await getOpenAI()).chat.completions.parse({
    model: MODELS.feedback,
    messages: [
      {
        role: "system",
        content: `You are an expert French language teacher giving structured feedback to a learner at CEFR level ${level}.
Analyse the student's French writing carefully for errors, stylistic improvements, and genuine praise.

CRITICAL RULES:
- span.start and span.end are CHARACTER OFFSETS (not word positions) into the exact contentFr string provided.
  They must index the exact substring containing the error. Verify: contentFr.slice(span.start, span.end) === original.
- Use a Socratic tone. In explanation_en, explain WHY the rule applies — do not reveal the full correction in the explanation.
- You MUST include at least 1 praise sentence in praise[], even for weak submissions. Keep it genuine and specific.
- errors[] contains real grammatical, orthographic, or lexical mistakes only — they enter the learner profile.
- improvements[] contains stylistic suggestions only — they do NOT enter the errors table.
- category must be exactly one of: ${CATEGORY_KEYS.join(", ")}
- subcategory must be exactly one of these leaf IDs: ${subcategoryList}
- fr_examples must contain 2–3 correct French sentences illustrating the correct usage.
- overall_level_estimate is your best CEFR estimate of the student's level based on this writing sample.
- summary_en is a single sentence summarising the overall quality of the submission.
- rule_id should be the matching subcategory key when applicable (same value as subcategory), one of: ${SUBCATEGORY_KEYS.join(", ")}; otherwise null.`,
      },
      {
        role: "user",
        content: `Task prompt: ${taskPrompt}
Target vocabulary: ${targetWords.join(", ") || "none"}
Target grammar points: ${targetGrammar.join(", ") || "none"}
Student level: ${level}

Student's French writing (analyse this text exactly — all span offsets must index into this string):
${contentFr}`,
      },
    ],
    response_format: zodResponseFormat(FeedbackSchema, "feedback"),
    temperature: 0.2,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI feedback generation");
  return result;
}
