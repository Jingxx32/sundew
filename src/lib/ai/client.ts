import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import type { AiBucket } from "@/lib/access/limits";

let chatClient: OpenAI | undefined;
let audioClient: OpenAI | undefined;

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

/**
 * Inside the Next.js server (NEXT_RUNTIME is set) every call first checks that
 * the requester is not a guest and counts against the member's daily limit for
 * `bucket` (null for free calls such as listing models). Scripts run outside Next
 * and skip the check — they cannot load the server-only session module.
 */
async function guard(bucket: AiBucket | null): Promise<void> {
  if (process.env.NEXT_RUNTIME) {
    const { assertAiAllowed } = await import("@/lib/access/ai-guard");
    await assertAiAllowed(bucket ?? undefined);
  }
}

/**
 * Text and image chat completions, served by Nebius Token Factory through its
 * OpenAI-compatible API. The SDK is created only when an AI action runs, so
 * `next build` never needs the key. Pass `REASONING` with every request.
 */
export async function getChatAI(bucket: AiBucket | null): Promise<OpenAI> {
  await guard(bucket);
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    throw new Error("NEBIUS_API_KEY is not configured.");
  }

  chatClient ??= new OpenAI({ apiKey, baseURL: NEBIUS_BASE_URL });
  return chatClient;
}

/**
 * Audio only — Whisper transcription and text-to-speech. Nebius has no audio
 * endpoints, so these stay on OpenAI.
 */
export async function getOpenAI(bucket: AiBucket | null): Promise<OpenAI> {
  await guard(bucket);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  audioClient ??= new OpenAI({ apiKey });
  return audioClient;
}

// One model, tested on real lookups, feedback and image questions (2026-11-26).
// The standard tier is 3–5× slower; `-fast` keeps lookups near one second.
const DEFAULT_CHAT_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash-1017-fast";

const chatModel = (use: string) =>
  process.env[`AI_MODEL_${use}`] ?? process.env.AI_MODEL ?? DEFAULT_CHAT_MODEL;

export const MODELS = {
  lookup: chatModel("LOOKUP"),
  task: chatModel("TASK"),
  feedback: chatModel("FEEDBACK"),
  enrich: chatModel("ENRICH"),
  transcribe: process.env.OPENAI_MODEL_TRANSCRIBE ?? "whisper-1",
  speaking: chatModel("SPEAKING"),
  tutor: chatModel("TUTOR"),
} as const;

/**
 * Thinking off by default: it made lookups take seconds without better output.
 * gpt-oss models reject "none"; set AI_REASONING_EFFORT=low for them.
 */
export const REASONING: { reasoning_effort: ReasoningEffort } = {
  reasoning_effort: (process.env.AI_REASONING_EFFORT as ReasoningEffort | undefined) ?? "none",
};
