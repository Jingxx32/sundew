import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { COMPREHENSION_TAGS } from "../tags";
import type { notebookCounts, NoteLine } from "../notebook/rules";

/** How many earlier turns of a thread are sent back to the model. */
export const THREAD_RESEND_LIMIT = 12;

export const TUTOR_SYSTEM_PROMPT = `You are a French tutor helping a learner who is preparing for the TCF exam. They have just answered a listening or reading question and are asking you about it.

Rules:
- The stored answer is correct. Explain why it is right and why the learner's choice is not. Never re-judge the answer key.
- Reply in the language the learner wrote in. Keep French quotations in French.
- Answer only what was asked, in about 200 words or fewer. No preamble, no closing offers.
- For listening questions, never describe how the recording sounds: make no claim about phonemes, liaison or pronunciation of the audio, because you cannot hear it. General listening advice is fine.
- If no source text or image is available for the question, say so instead of guessing what it contained.
- Use the learner's notebook only when it helps with this question.`;

export type TutorQuestion = {
  skill: "listening" | "reading";
  type: "image" | "spoken_options" | "dialogue" | "reading_mcq";
  questionText: string;
  options: string[];
  answer: number;
  passage: string | null;
  transcript: string | null;
  explanation: string | null;
};

export type TutorTurn = { role: "user" | "assistant"; content: string };

const letter = (i: number) => String.fromCharCode(65 + i);

export function formatNotebookContext(input: {
  notes: NoteLine[];
  counts: ReturnType<typeof notebookCounts>;
  accuracy: { correct: number; total: number } | null;
}): string {
  const { notes, counts, accuracy } = input;
  const lines = ["Learner notebook (background only):"];
  if (accuracy && accuracy.total > 0) lines.push(`Recent TCF accuracy: ${accuracy.correct}/${accuracy.total}`);
  if (notes.length === 0) {
    lines.push("The notebook is empty.");
    return lines.join("\n");
  }
  const kinds = Object.entries(counts.byKind).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
  if (kinds.length) lines.push(`Cards by kind: ${kinds.join(", ")}`);
  const tags = Object.entries(counts.byTag).map(([t, n]) => `${COMPREHENSION_TAGS[t as keyof typeof COMPREHENSION_TAGS]?.label ?? t} ${n}`);
  if (tags.length) lines.push(`Cards by tag: ${tags.join(", ")}`);
  lines.push("Most relevant cards:");
  for (const n of notes) lines.push(`- [${n.kind}] ${n.point}${n.lemma ? ` (${n.lemma})` : ""}`);
  return lines.join("\n");
}

function questionBlock(q: TutorQuestion, chosen: number | null, hasImage: boolean): string {
  const lines = [
    `Skill: ${q.skill}`,
    `Question type: ${q.type}`,
    `Question: ${q.questionText}`,
    ...q.options.map((o, i) => `${letter(i)}. ${o}`),
    `Correct answer: ${letter(q.answer)}`,
    chosen === null ? "Learner revealed the answer without choosing" : `Learner chose: ${letter(chosen)}`,
  ];
  if (q.passage) lines.push("", "Passage:", q.passage);
  if (q.transcript) lines.push("", "Transcript:", q.transcript);
  if (q.explanation) lines.push("", "Existing explanation (Markdown):", q.explanation);
  if (!q.passage && !q.transcript && !q.explanation && !hasImage) {
    lines.push("", "No source text is available for this question.");
  }
  return lines.join("\n");
}

export function buildTutorMessages(input: {
  question: TutorQuestion;
  chosen: number | null;
  imageUrl: string | null;
  notebook: string;
  thread: TutorTurn[];
  ask: string;
}): ChatCompletionMessageParam[] {
  const text = questionBlock(input.question, input.chosen, input.imageUrl !== null);
  const parts: ChatCompletionContentPart[] = [{ type: "text", text }];
  if (input.imageUrl) parts.push({ type: "image_url", image_url: { url: input.imageUrl, detail: "low" } });
  return [
    { role: "system", content: TUTOR_SYSTEM_PROMPT },
    { role: "user", content: input.imageUrl ? parts : text },
    { role: "system", content: input.notebook },
    ...input.thread.slice(-THREAD_RESEND_LIMIT).map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam),
    { role: "user", content: input.ask },
  ];
}
