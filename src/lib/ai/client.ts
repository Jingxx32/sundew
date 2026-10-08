import OpenAI from "openai";

let client: OpenAI | undefined;

/**
 * Create the SDK only when an AI action actually runs. Importing this module
 * during `next build` must not require a production-only API key.
 *
 * Inside the Next.js server (NEXT_RUNTIME is set) every call first checks that
 * the requester is not a guest. Scripts run outside Next and skip the check —
 * they cannot load the server-only session module.
 */
export async function getOpenAI(): Promise<OpenAI> {
  if (process.env.NEXT_RUNTIME) {
    const { assertAiAllowed } = await import("@/lib/access/ai-guard");
    await assertAiAllowed();
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export const MODELS = {
  lookup: process.env.OPENAI_MODEL_LOOKUP ?? "gpt-4o-mini",
  task: process.env.OPENAI_MODEL_TASK ?? "gpt-4o",
  feedback: process.env.OPENAI_MODEL_FEEDBACK ?? "gpt-4o",
  // Structured, low-divergence output — mini is usually enough. Override with
  // OPENAI_MODEL_ENRICH=gpt-4o if quality regresses.
  enrich: process.env.OPENAI_MODEL_ENRICH ?? "gpt-4o-mini",
  transcribe: process.env.OPENAI_MODEL_TRANSCRIBE ?? "whisper-1",
  speaking: process.env.OPENAI_MODEL_SPEAKING ?? "gpt-4o",
} as const;
