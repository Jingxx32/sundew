/**
 * Drafts the sample workspace's texts and learner essays with one gpt-4o call (≈ US$0.03).
 *   npm run sample:draft -- --yes
 * Writes src/lib/sample-workspace/source/text-{1,2,3}.md and essay-{1,2}.md for the owner to edit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.argv.includes("--yes")) {
  console.log("Calls gpt-4o once (≈ US$0.03). Re-run with --yes.");
  process.exit(0);
}

const { z } = await import("zod");
const { zodResponseFormat } = await import("openai/helpers/zod");
const { getOpenAI, MODELS } = await import("../../src/lib/ai/client");

// No min/max array lengths: structured outputs reject them. Counts are checked below.
const Draft = z.object({
  texts: z.array(z.object({ title: z.string(), paragraphs: z.array(z.string()) })),
  essays: z.array(z.object({ aboutText: z.number(), text: z.string() })),
});

const completion = await (await getOpenAI()).chat.completions.parse({
  model: MODELS.task,
  temperature: 0.8,
  response_format: zodResponseFormat(Draft, "draft"),
  messages: [
    { role: "system", content: "You write original French learning material. Never reproduce published text." },
    {
      role: "user",
      content: `Write exactly three original French texts for A2–B1 learners about everyday life in Montréal (for example: a neighbourhood market in autumn, taking the métro in winter, a weekend on Mont-Royal). Each text has a title and 3–4 paragraphs, 220–300 words in total, using the present and the passé composé and a few useful everyday expressions.

Then write exactly two short learner essays (90–130 words each): the first responds to text 1, the second to text 2. Write them as an A2–B1 learner would: mostly understandable, with 6–8 natural mistakes spread across agreement, verb conjugation, prepositions, articles and word order. Do not mark the mistakes.`,
    },
  ],
});

const draft = completion.choices[0].message.parsed;
if (!draft || draft.texts.length !== 3 || draft.essays.length !== 2) throw new Error("Unexpected draft shape; re-run.");
const dir = path.join(process.cwd(), "src/lib/sample-workspace/source");
await mkdir(dir, { recursive: true });
for (const [i, text] of draft.texts.entries()) {
  await writeFile(path.join(dir, `text-${i + 1}.md`), `# ${text.title}\n\n${text.paragraphs.join("\n\n")}\n`);
}
for (const [i, essay] of draft.essays.entries()) {
  await writeFile(path.join(dir, `essay-${i + 1}.md`), `<!-- Learner essay responding to text ${essay.aboutText}. The mistakes are intentional. -->\n\n${essay.text}\n`);
}
console.log(`Wrote 3 texts and 2 essays to ${path.relative(process.cwd(), dir)}`);
process.exit(0);
