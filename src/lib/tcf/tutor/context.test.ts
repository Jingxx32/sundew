import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTutorMessages, CHINESE_REPLY, formatNotebookContext, NOT_ANSWERED_REPLY, THREAD_RESEND_LIMIT, TUTOR_SYSTEM_PROMPT, type TutorQuestion, type TutorTurn } from "./context";
import type { NoteLine } from "../notebook/rules";

const question: TutorQuestion = {
  skill: "reading",
  type: "reading_mcq",
  questionText: "Pourquoi Léa est-elle en retard ?",
  options: ["Elle dort", "Le bus est tombé en panne", "Elle cherche ses clés", "Elle est malade"],
  answer: 1,
  passage: "Léa a raté son réveil, puis le bus est tombé en panne.",
  transcript: null,
  explanation: "## Verdict\n- Key: le bus est tombé en panne",
};

const base = { question, chosen: 2, imageUrl: null, notebook: "NOTEBOOK", thread: [] as TutorTurn[], ask: "Why not C?" };

function text(content: unknown): string {
  if (typeof content === "string") return content;
  return (content as Array<{ type: string; text?: string }>).filter((p) => p.type === "text").map((p) => p.text).join("\n");
}

test("question block shows the correct and chosen letters", () => {
  const block = text(buildTutorMessages(base)[1].content);
  assert.match(block, /Correct answer: B/);
  assert.match(block, /Learner chose: C/);
  assert.match(block, /A\. Elle dort/);
  assert.match(block, /Le bus est tombé en panne/);
  assert.match(block, /Verdict/);
});

test("a revealed answer without a choice is stated", () => {
  const block = text(buildTutorMessages({ ...base, chosen: null })[1].content);
  assert.match(block, /Learner revealed the answer without choosing/);
});

test("resends only the last 12 turns and ends with the ask", () => {
  const thread: TutorTurn[] = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i}` }));
  const messages = buildTutorMessages({ ...base, thread });
  assert.equal(THREAD_RESEND_LIMIT, 12);
  assert.equal(messages.length, 3 + 12 + 1);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[2].content, "NOTEBOOK");
  assert.equal(messages[3].content, "turn 8");
  assert.equal(messages[14].content, "turn 19");
  assert.deepEqual(messages[15], { role: "user", content: "Why not C?" });
});

test("an image makes the question message a content array", () => {
  const imageUrl = "data:image/png;base64,AAAA";
  const content = buildTutorMessages({ ...base, imageUrl })[1].content;
  assert.ok(Array.isArray(content));
  assert.ok(content.some((p) => p.type === "image_url" && p.image_url.url === imageUrl && p.image_url.detail === "high"));
});

test("an image adds a quote-only-what-you-can-read instruction", () => {
  const block = text(buildTutorMessages({ ...base, imageUrl: "data:image/png;base64,AAAA" })[1].content);
  assert.match(block, /source text is in the attached image/);
  assert.match(block, /illegible/);
});

test("before an answer the block hides the key, explanation and transcript", () => {
  const listening: TutorQuestion = { ...question, skill: "listening", type: "dialogue", passage: null, transcript: "— Tu viens ? — Non, le bus est en panne." };
  const block = text(buildTutorMessages({ ...base, question: listening, chosen: null, revealed: false })[1].content);
  assert.match(block, /The learner has not answered yet/);
  assert.doesNotMatch(block, /Correct answer|Learner chose|Learner revealed/);
  assert.doesNotMatch(block, /Existing explanation|Verdict/);
  assert.doesNotMatch(block, /le bus est en panne/);
  assert.match(block, /transcript is withheld/);
  assert.doesNotMatch(block, /No source text is available/);
  assert.match(TUTOR_SYSTEM_PROMPT, /never say or hint which option is right/);
});

test("before an answer the turn ends with the no-spoiler reminder", () => {
  const messages = buildTutorMessages({ ...base, chosen: null, revealed: false, ask: "这题选哪个？" });
  assert.deepEqual(messages.at(-2), { role: "system", content: NOT_ANSWERED_REPLY });
  assert.deepEqual(messages.at(-1), { role: "system", content: CHINESE_REPLY });
  assert.ok(!buildTutorMessages(base).some((m) => m.content === NOT_ANSWERED_REPLY));
});

test("a Chinese ask ends with a reminder to answer in Chinese", () => {
  const messages = buildTutorMessages({ ...base, ask: "为什么不是 C？" });
  assert.deepEqual(messages.at(-2), { role: "user", content: "为什么不是 C？" });
  assert.deepEqual(messages.at(-1), { role: "system", content: CHINESE_REPLY });
  assert.equal(buildTutorMessages(base).at(-1)?.role, "user");
});

test("the prompt only explains the learner's choice when it differs", () => {
  assert.match(TUTOR_SYSTEM_PROMPT, /only when the learner's choice differs/);
});

test("without any source the block says so", () => {
  const bare = { ...question, passage: null, transcript: null, explanation: null };
  assert.match(text(buildTutorMessages({ ...base, question: bare })[1].content), /No source text is available/);
});

test("system prompt carries the guardrails", () => {
  assert.match(TUTOR_SYSTEM_PROMPT, /Never re-judge the answer key/);
  assert.match(TUTOR_SYSTEM_PROMPT, /never describe how the recording sounds/);
});

test("notebook context lists notes, counts and accuracy", () => {
  const notes: NoteLine[] = [
    { id: "1", kind: "vocabulary", point: "manquer à qqn", lemma: "manquer", comprehensionTag: null, sourceLocator: null, createdAt: new Date() },
  ];
  const out = formatNotebookContext({
    notes,
    counts: { byKind: { vocabulary: 1, grammar: 0, hearing: 0, comprehension: 0 }, byTag: { vocab: 1 } },
    accuracy: { correct: 3, total: 4 },
  });
  assert.match(out, /manquer à qqn/);
  assert.match(out, /3\/4/);
  assert.match(out, /Notebook review accuracy \(30 days\)/);
  assert.match(formatNotebookContext({ notes: [], counts: { byKind: { vocabulary: 0, grammar: 0, hearing: 0, comprehension: 0 }, byTag: {} }, accuracy: null }), /empty/i);
});
