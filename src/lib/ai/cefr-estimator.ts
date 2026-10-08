// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { CEFR_LEVELS } from "@/lib/cefr";
import { getOpenAI, MODELS } from "./client";

const CefrSchema = z.object({
  level: z.enum(CEFR_LEVELS),
});

export async function estimateCefrLevel(text: string): Promise<string> {
  const excerpt = text.slice(0, 800);

  const completion = await (await getOpenAI()).chat.completions.parse({
    model: MODELS.lookup,
    messages: [
      {
        role: "system",
        content: `You are a French language expert. Estimate the CEFR level (A1–C2) of the provided French text based on vocabulary complexity, sentence structure, and grammatical features. Return only the level code.`,
      },
      {
        role: "user",
        content: excerpt,
      },
    ],
    response_format: zodResponseFormat(CefrSchema, "cefr"),
    temperature: 0,
  });

  return completion.choices[0].message.parsed?.level ?? "B1";
}
