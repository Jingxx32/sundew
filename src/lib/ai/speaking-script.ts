import type { SpeakingPrompt } from "@/lib/db/schema";
import { getOpenAI, MODELS } from "./client";

const TASK_GUIDANCE: Record<number, string> = {
  1: `Tâche 1 (entretien dirigé, ~2 min): write first-person spoken answers to the personal questions in the prompt. Natural conversational French, complete sentences a B1 learner can memorize and deliver aloud.`,
  2: `Tâche 2 (interaction, ~5 min): the CANDIDATE asks the questions. Write a one-sentence greeting/opening, then 8–10 varied questions the candidate should ask (mix est-ce que / inversion / intonation forms), then a one-sentence polite closing.`,
  3: `Tâche 3 (point de vue, ~4.5 min): write a structured spoken opinion — brief intro stating the position, 2–3 arguments each backed by a concrete example (draw examples from the student's personal profile where natural), short conclusion. ~250–300 words.`,
};

export async function generateSpeakingScript(
  prompt: SpeakingPrompt,
  profile: string,
): Promise<string> {
  const completion = await (await getOpenAI()).chat.completions.create({
    model: MODELS.speaking,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You write reference scripts for the TCF Canada speaking test (Expression orale), for a B1-level learner preparing to deliver them aloud.

${TASK_GUIDANCE[prompt.task]}

Rules:
- Spoken register, natural rhythm, no literary vocabulary.
- Weave in the student's real personal details from their profile so the script sounds authentic and is easy to remember.
- Output ONLY the French script text. No headings, no markdown, no translations, no commentary.
- One sentence per line (each line will be practiced and scored separately).`,
      },
      {
        role: "user",
        content: `Prompt (Tâche ${prompt.task}): ${prompt.prompt}${
          prompt.context ? `\nContext: ${prompt.context}` : ""
        }

Student profile:
${profile || "(no profile provided — use a plausible generic newcomer-to-Canada persona)"}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No script returned from OpenAI");
  return content;
}
