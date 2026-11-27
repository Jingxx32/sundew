import { z } from "zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { zodResponseFormat } from "openai/helpers/zod";
import { getChatAI, MODELS, REASONING } from "./client";
import type { NoteLine } from "@/lib/tcf/notebook/rules";
import { COMPREHENSION_TAGS } from "@/lib/tcf/tags";
import { ProposalSchema, ReviewBatchSchema, type Proposal } from "@/lib/tcf/tutor/schemas";
import type { TcfNoteKind } from "@/lib/db/schema";

/** Card proposal and review generation: fail fast instead of the SDK's 10-minute timeout and 2 retries. */
const AI_BATCH_REQUEST = { timeout: 20_000, maxRetries: 1 };

/**
 * Streams the tutor's answer. Budget (`UserFacingError`) and OpenAI request errors throw here, before any text is sent.
 * Aborting `signal` ends the upstream request and the iteration quietly.
 */
export async function streamTutorAnswer(messages: ChatCompletionMessageParam[], signal?: AbortSignal): Promise<AsyncIterable<string>> {
  const stream = await (await getChatAI("tutor")).chat.completions.create({
    model: MODELS.tutor,
    ...REASONING,
    messages,
    stream: true,
    max_tokens: 500,
    temperature: 0.3,
  }, { signal });
  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  })();
}

const tagList = Object.entries(COMPREHENSION_TAGS)
  .map(([id, t]) => `- ${id}: ${t.label}. ${t.prompt}`)
  .join("\n");

export const PROPOSAL_SYSTEM_PROMPT = `You decide whether a tutoring exchange about a French TCF question should become a notebook card for the learner.

Return result "none" when the exchange taught nothing testable (for example "thanks", "repeat that", a request to translate a whole text).
Return result "duplicate" when the point is already in the numbered list of existing cards, and set duplicate_index to that number.
Otherwise return result "card" and fill in card.

Card kinds:
- vocabulary: the meaning of one word or fixed expression the learner did not know, did not recognise or did not hear — including its meaning in this context. Always use vocabulary, with that word's lemma, when the exchange is about what a word or expression means.
- grammar: a grammar rule or construction
- hearing: something the learner failed to catch by ear that is not a single word (a phrase, a number, a name, a contraction), or a listening strategy
- comprehension: a reasoning strategy that would help on other questions of the same type. Never use comprehension for the meaning of a word.

The point must name the concrete word, rule or trap and its evidence in this question (for example "the right option paraphrases il a raté son train as il est en retard", or "C reuses voyage from the text but applies it to the parents, who never travel"). Never write a generic slogan such as "read the text carefully": when the exchange explains why an option is right or wrong, the card is that specific reason.

comprehension_tag says what the question tested, or null:
${tagList}

Card fields:
- point: a short title of the point, at most 160 characters
- front: a question asking for the point; back: its answer. Each at most 400 characters.
- For vocabulary: lemma is the dictionary form, sentence is the sentence the word appeared in, and by_ear is true only if the learner missed it by ear. For other kinds set lemma and sentence to null and by_ear to false.
Write front and back in the language the learner used; keep French in French. Duplicates and none have card: null.`;

export async function proposeCard(input: {
  ask: string;
  answer: string;
  questionSummary: string;
  existing: NoteLine[];
}): Promise<Proposal> {
  const list = input.existing.length
    ? input.existing.map((n, i) => `${i}. [${n.kind}] ${n.point}${n.lemma ? ` (${n.lemma})` : ""}`).join("\n")
    : "(none)";
  const completion = await (await getChatAI("lookup")).chat.completions.parse({
    model: MODELS.lookup,
    ...REASONING,
    messages: [
      { role: "system", content: PROPOSAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Question context:\n${input.questionSummary}\n\nLearner asked:\n${input.ask}\n\nTutor answered:\n${input.answer}\n\nExisting cards:\n${list}`,
      },
    ],
    response_format: zodResponseFormat(ProposalSchema, "tutor_card"),
    temperature: 0.2,
  }, AI_BATCH_REQUEST);
  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI card proposal");
  return result;
}

export const REVIEW_SYSTEM_PROMPT = `You write multiple-choice review items for a French learner's notebook cards.

Write exactly one item per card, and set index to the card's position in the input (starting at 0).
- The item makes the learner APPLY the card's point to new French material. Never ask about the rule or strategy itself (not "Which mood follows bien que?", not "Why is the option that repeats a word often wrong?").
- Use NEW French material: new sentences, a new situation and new names. Never reuse the source question's situation, people, sentences or options, even if the card mentions them.
  - grammar: a new French sentence with a blank or a choice; the 4 options are forms of the construction.
  - comprehension: put a new French text of one to three sentences in the stem, then a TCF-style question about it whose right answer needs the card's strategy; the options are new.
  - hearing: see spoken below.
- Give exactly 4 options, all different, with exactly one correct. answer is the 0-based index of the correct option.
- Distractors must be plausible for a learner but clearly wrong to someone who knows the point.
- For cards of kind "hearing", spoken is the French sentence that will be read aloud and the stem asks what was heard; the options are candidate transcriptions or meanings. For every other kind set spoken to null.
- Write the stem in English unless the card is French-only; keep French in French.`;

export async function generateReviewItems(
  cards: Array<{ kind: TcfNoteKind; point: string; front: string; back: string }>,
): Promise<z.infer<typeof ReviewBatchSchema>> {
  const list = cards
    .map((c, i) => `${i}. [${c.kind}] ${c.point}\nFront: ${c.front}\nBack: ${c.back}`)
    .join("\n\n");
  const completion = await (await getChatAI("lookup")).chat.completions.parse({
    model: MODELS.lookup,
    ...REASONING,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: `Cards:\n\n${list}` },
    ],
    response_format: zodResponseFormat(ReviewBatchSchema, "notebook_review"),
    temperature: 0.4,
  }, AI_BATCH_REQUEST);
  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI review generation");
  return result;
}
