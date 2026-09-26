import { z } from "zod";
import type { SpeakingPracticeFeedback, SpeakingTurn } from "@/lib/db/schema";

const observation = z.object({ text: z.string().min(1).max(220), turnId: z.string().uuid(), quote: z.string().min(1).max(180) });
export const feedbackSchema = z.object({
  summary: z.string().min(1).max(500),
  strengths: z.array(observation).max(3),
  issues: z.array(z.object({
    id: z.string().regex(/^issue-[1-3]$/),
    category: z.enum(["questions", "clarification", "follow_up", "language"]),
    explanation: z.string().min(1).max(250),
    turnId: z.string().uuid(),
    quote: z.string().min(1).max(180),
    example: z.string().min(1).max(180),
    drillId: z.enum(["questions", "clarification", "follow_up"]).nullable(),
  })).max(3),
  limitations: z.array(z.string().min(1).max(220)).max(4),
});

export function validateFeedback(input: unknown, turns: SpeakingTurn[]): SpeakingPracticeFeedback {
  const result = feedbackSchema.parse(input);
  const byId = new Map(turns.filter((t) => t.role === "user").map((t) => [t.id, t]));
  for (const item of [...result.strengths, ...result.issues]) {
    const source = byId.get(item.turnId);
    if (!source || !source.text.includes(item.quote)) throw new Error("Feedback cites missing learner evidence");
  }
  if (new Set(result.issues.map((i) => i.id)).size !== result.issues.length) throw new Error("Duplicate issue ID");
  for (const issue of result.issues) {
    if (issue.drillId && issue.category !== issue.drillId) throw new Error("Follow-up does not match the observed issue");
  }
  const claims = [result.summary, ...result.strengths.map((item) => item.text),
    ...result.issues.map((item) => item.explanation)].join(" ");
  if (/\b(?:CEFR|CLB|NCLC|A1|A2|B1|B2|C1|C2|pronunciation|accent)\b/i.test(claims)) {
    throw new Error("Feedback includes an unsupported level or audio claim");
  }
  return result;
}
