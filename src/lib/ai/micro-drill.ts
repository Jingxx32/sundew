import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI, MODELS } from "./client";

export const MicroDrillFeedbackSchema = z.object({
  ok: z.boolean(),
  comments: z.array(z.string()).min(1),
  better_examples: z.array(z.string()),
});
export type MicroDrillFeedback = z.infer<typeof MicroDrillFeedbackSchema>;

export async function evaluateMicroDrill(
  drillPrompt: string,
  originalError: string,
  correction: string,
  responseFr: string,
): Promise<MicroDrillFeedback> {
  const completion = await getOpenAI().chat.completions.parse({
    model: MODELS.feedback,
    messages: [
      {
        role: "system",
        content: `You are a supportive French language coach evaluating a short follow-up drill response.
This is NOT a graded submission — it is practice. Your role is to help the learner improve, not to penalise.

RULES:
- ok: true if the response demonstrates understanding of the target point; false if the same error recurs.
- comments: 1–3 short observations in English. Praise what is right first (Socratic tone). Point at what is still off without revealing the full answer.
- better_examples: 1–2 polished French sentences that correctly use the target structure.
- Do NOT classify errors by taxonomy category. Do NOT write to the errors table (this is drill-only feedback).
- Keep comments concise — one sentence each.`,
      },
      {
        role: "user",
        content: `Drill prompt: ${drillPrompt}

Original error: ${originalError}
Correct form: ${correction}

Learner's drill response:
${responseFr}`,
      },
    ],
    response_format: zodResponseFormat(MicroDrillFeedbackSchema, "micro_drill_feedback"),
    temperature: 0.2,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI micro-drill evaluation");
  return result;
}
