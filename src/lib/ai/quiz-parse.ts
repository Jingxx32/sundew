// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI, MODELS } from "./client";
import { QuizParseSchema, type ParsedQuiz } from "./quiz-schema";

// `section` is intentionally the "reading" literal, not the full quiz_section
// enum: this parser assumes passage-grouped questions. Widening it to
// grammar/vocabulary needs parser changes for passage-less MCQs (code-audit #8).
export async function parseQuizFromText(
  rawText: string,
  section: "reading",
): Promise<ParsedQuiz> {
  const completion = await getOpenAI().chat.completions.parse({
    model: MODELS.task,
    messages: [
      {
        role: "system",
        content: `You are structuring a French ${section} comprehension exam document (TCF-style) into passages and multiple-choice questions.

Rules:
- Group each question under the passage (text/document/dialogue) it refers to. A passage may have one or several questions. Standalone questions with only a short stimulus (a sign, a short message) use that stimulus as their passage text.
- The answer key is often printed at the end of the document (e.g. "1. B  2. D …") or marked inline. Map each key entry back to its question by question number, carefully — misalignment is the worst possible failure.
- Output correctIndex as the 0-based index into the options array (A=0, B=1, C=2, D=3). Never output a letter.
- Each question has exactly 4 options. Strip option letters ("A.", "B)") from the option text.
- Preserve all French text exactly as written — accents, punctuation, casing. Do not translate, paraphrase or "fix" anything.
- explanation: if the document provides one, keep it; otherwise write one short English sentence justifying the correct answer. Use null only if you cannot justify it.
- Ignore page headers, footers, page numbers and instructions that are not part of a passage or question.`,
      },
      {
        role: "user",
        content: rawText,
      },
    ],
    response_format: zodResponseFormat(QuizParseSchema, "quiz"),
    temperature: 0.2,
  });

  const result = completion.choices[0].message.parsed;
  if (!result) throw new Error("No result from OpenAI quiz parse");
  return result;
}
