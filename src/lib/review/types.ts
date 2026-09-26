import type { ReviewSource } from "./state";

/** Server-private. Never pass this type directly into a client component. */
export type ReviewSnapshot = {
  version: 1; source: ReviewSource; key: string; contentHash: string;
  title: string; prompt: string; passage: string | null; choices: string[] | null;
  media: string | null; image: string | null; skill: string; href: string;
  kind: "choice" | "text" | "writing" | "listening";
  expected: string[] | number; explanation: string | null;
  original?: string; correction?: string;
  target?: { verb: string; tense: string; person: number };
};
export type Prompt = Pick<ReviewSnapshot, "title" | "prompt" | "passage" | "choices" | "media" | "image" | "skill" | "kind">;
export function publicPrompt(snapshot: ReviewSnapshot): Prompt {
  const { title, prompt, passage, choices, media, image, skill, kind } = snapshot;
  return { title, prompt, passage, choices, media, image, skill, kind };
}
