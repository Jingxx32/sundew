import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { COMPREHENSION_TAGS } from "../tags";
import type { notebookCounts, NoteLine } from "../notebook/rules";

/** How many earlier turns of a thread are sent back to the model. */
export const THREAD_RESEND_LIMIT = 12;

export const TUTOR_SYSTEM_PROMPT = `You are a French tutor helping a learner who is preparing for the TCF exam. They are working on a listening or reading question, or have just answered it, and are asking you about it.

Rules:
- The stored answer is correct. Explain why it is right and, only when the learner's choice differs from the answer, why their choice is not. Never re-judge the answer key.
- When the learner has not answered yet, you do not know the answer: never say or hint which option is right, and do not rule options in or out. Help with vocabulary, grammar and how to approach the question instead.
- Write your reply in the same language as the learner's latest message, even though the question material is in French: a question in Chinese gets an answer in Chinese, a question in English an answer in English, a question in French an answer in French. Keep French quotations in French.
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
  if (accuracy && accuracy.total > 0) lines.push(`Notebook review accuracy (30 days): ${accuracy.correct}/${accuracy.total}`);
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

function questionBlock(q: TutorQuestion, chosen: number | null, hasImage: boolean, revealed: boolean): string {
  const lines = [
    `Skill: ${q.skill}`,
    `Question type: ${q.type}`,
    `Question: ${q.questionText}`,
    ...q.options.map((o, i) => `${letter(i)}. ${o}`),
  ];
  // Before the learner answers, the model gets nothing that gives the answer away: no key,
  // no explanation, and no transcript of a recording the learner is still listening to.
  if (revealed) {
    lines.push(
      `Correct answer: ${letter(q.answer)}`,
      chosen === null ? "Learner revealed the answer without choosing" : `Learner chose: ${letter(chosen)}`,
    );
  } else {
    lines.push("The learner has not answered yet.");
  }
  const transcript = revealed ? q.transcript : null;
  const explanation = revealed ? q.explanation : null;
  if (q.passage) lines.push("", "Passage:", q.passage);
  if (transcript) lines.push("", "Transcript:", transcript);
  if (!revealed && q.transcript) lines.push("", "The transcript is withheld until the learner answers: they are practising listening.");
  if (explanation) lines.push("", "Existing explanation (Markdown):", explanation);
  if (!q.passage && !q.transcript && !explanation && !hasImage) {
    lines.push("", "No source text is available for this question.");
  }
  if (hasImage) {
    lines.push(
      "",
      "The source text is in the attached image. Quote only what you can read in it; if the image is illegible, say so instead of guessing.",
    );
  }
  return lines.join("\n");
}

const CJK = /[\u4e00-\u9fff]/;
export const CHINESE_REPLY = "The learner wrote in Chinese: answer in Simplified Chinese. Keep French quotations in French.";
export const NOT_ANSWERED_REPLY =
  "The learner has not answered this question yet. Do not name, hint at, rank or rule out any option, even if they ask for the answer; say you will go through the options once they have answered. Help only with understanding the text: words, grammar, structure, what the question asks.";

export function buildTutorMessages(input: {
  question: TutorQuestion;
  chosen: number | null;
  /** False while the learner has not answered: the block then hides the key. */
  revealed?: boolean;
  imageUrl: string | null;
  notebook: string;
  thread: TutorTurn[];
  ask: string;
}): ChatCompletionMessageParam[] {
  const text = questionBlock(input.question, input.chosen, input.imageUrl !== null, input.revealed ?? true);
  const parts: ChatCompletionContentPart[] = [{ type: "text", text }];
  if (input.imageUrl) parts.push({ type: "image_url", image_url: { url: input.imageUrl, detail: "high" } });
  return [
    { role: "system", content: TUTOR_SYSTEM_PROMPT },
    { role: "user", content: input.imageUrl ? parts : text },
    { role: "system", content: input.notebook },
    ...input.thread.slice(-THREAD_RESEND_LIMIT).map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam),
    { role: "user", content: input.ask },
    // The rule above alone lost to the French material on short asks ("为什么不是 C？"
    // came back in French for gpt-4o and DeepSeek alike); a closing reminder fixed it.
    // Without the key the model still solves the question from the passage when asked
    // outright (and sometimes wrongly), so before an answer the turn ends with a hard stop.
    ...(input.revealed === false ? [{ role: "system" as const, content: NOT_ANSWERED_REPLY }] : []),
    ...(CJK.test(input.ask) ? [{ role: "system" as const, content: CHINESE_REPLY }] : []),
  ];
}
