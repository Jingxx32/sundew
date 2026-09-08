/**
 * Deterministic parser for TCF Compréhension orale PDF text.
 * Verified against test1 Q1–19. No AI, no translation calls.
 *
 * PDF structure per question block:
 *   image/spoken_options:
 *     Instruction (1-2 lines)
 *     A. Proposition/Réponse a [Correct answer]  ← placeholder options
 *     B. Proposition/Réponse b
 *     C. Proposition/Réponse c
 *     D. Proposition/Réponse d
 *     legacy separator ("incorrect")
 *     [spoken_options only: transcript sentence(s)]
 *     A. [real French option]   ← real options
 *     B. …
 *     C. …
 *     D. …
 *     [CJK translation lines — stripped]
 *
 *   dialogue:
 *     Instruction (1-2 lines)
 *     A. [real French option] [Correct answer on correct one]
 *     B. …
 *     C. …
 *     D. …
 *     legacy separator ("incorrect")
 *     [French transcript / dialogue lines]
 *     [Question sentence, e.g. "Quel est le problème?"]
 *     [CJK translation — stripped]
 *     [legacy Chinese explanation — stripped]
 */

export interface ParsedQuestion {
  orderIndex: number;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  type: "image" | "spoken_options" | "dialogue";
  questionText: string;
  options: string[];
  answer: number;
  transcript: string | null;
  translationEn: null;
  explanation: null;
  imagePath: null;
  audioPath: null;
}

const LEVEL_MAP: Array<{ min: number; max: number; level: ParsedQuestion["level"] }> = [
  { min: 1,  max: 4,  level: "A1" },
  { min: 5,  max: 10, level: "A2" },
  { min: 11, max: 19, level: "B1" },
  { min: 20, max: 29, level: "B2" },
  { min: 30, max: 35, level: "C1" },
  { min: 36, max: 39, level: "C2" },
];

function getLevel(n: number): ParsedQuestion["level"] {
  return LEVEL_MAP.find(({ min, max }) => n >= min && n <= max)?.level ?? "C2";
}

function hasCJK(s: string): boolean {
  return /[一-鿿㐀-䶿＀-￯⺀-⻿]/.test(s);
}

function isPageMarker(s: string): boolean {
  return /^--\s*\d+\s*of\s*\d+\s*--\s*$/.test(s.trim());
}

/** Matches A./B./C./D. option lines (no space required after period) */
function isOptionLine(s: string): boolean {
  return /^[A-D]\.\s*/i.test(s.trim());
}

function isPlaceholderOption(s: string): boolean {
  return isOptionLine(s) && /Proposition|Réponse/i.test(s);
}

function letterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

function stripOptionPrefix(line: string): string {
  return line.trim()
    .replace(/^[A-D]\.\s*/i, "")
    .replace(/\s*Correct answer.*$/i, "")
    .trim();
}

function detectType(instruction: string): ParsedQuestion["type"] {
  const lc = instruction.toLowerCase();
  if (lc.includes("image")) return "image";
  if (lc.includes("propositions") || lc.includes("proposition")) return "spoken_options";
  return "dialogue";
}

export function parseQuestions(rawText: string): ParsedQuestion[] {
  const allLines = rawText.split("\n");

  // Remove page markers but keep everything else (including blanks, CJK — filtered per-block)
  const lines = allLines.filter((l) => !isPageMarker(l));

  // Find question block start indices
  // Verb may appear with or without the leading accent (Ecoutez / Écoutez)
  const QUESTION_START = /^\s*(\d+)\.\s*([EÉ]coutez|Regardez|Lisez)/i;
  const blockStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (QUESTION_START.test(lines[i])) blockStarts.push(i);
  }

  const questions: ParsedQuestion[] = [];

  for (let b = 0; b < blockStarts.length; b++) {
    const start = blockStarts[b];
    const end = b + 1 < blockStarts.length ? blockStarts[b + 1] : lines.length;
    const block = lines.slice(start, end);

    const match = QUESTION_START.exec(block[0]);
    if (!match) continue;
    const num = parseInt(match[1], 10);

    // --- Collect instruction lines (stop at the first option or legacy separator) ---
    const instructionLines: string[] = [];
    let i = 0;
    while (i < block.length) {
      const raw = block[i];
      const t = raw.trim();
      if (!t || hasCJK(t) || isPageMarker(t)) { i++; continue; }
      if (isOptionLine(t) || t === "不正确") break;
      instructionLines.push(t);
      i++;
    }
    const instructionRaw = instructionLines.join(" ").trim();
    const questionText = instructionRaw.replace(/^\d+\.\s*/, "").trim();
    const type = detectType(questionText);

    // --- Find the legacy separator ---
    const notCorrectIdx = block.findIndex((l) => l.trim() === "不正确");
    const before = notCorrectIdx >= 0 ? block.slice(0, notCorrectIdx) : block;
    const after = notCorrectIdx >= 0 ? block.slice(notCorrectIdx + 1) : [];

    if (type === "dialogue") {
      // Real options precede the legacy separator.
      const optionLines = before.filter((l) => isOptionLine(l.trim()) && !isPlaceholderOption(l));

      const correctLine = optionLines.find((l) => /Correct answer/i.test(l));
      const answerLetter = correctLine?.trim().match(/^([A-D])\./i)?.[1] ?? "A";
      const answer = letterToIndex(answerLetter);
      const options = optionLines.slice(0, 4).map(stripOptionPrefix);

      // Transcript: French lines after the legacy separator, excluding CJK, separators, and explanations.
      const transcriptLines = after.filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (hasCJK(t)) return false;
        if (/^[–—-]\s*$/.test(t)) return false;
        if (/正确答案|答案\s*[A-D]/i.test(t)) return false;
        return true;
      });
      const transcript = transcriptLines.length > 0 ? transcriptLines.join("\n").trim() : null;

      questions.push({
        orderIndex: num, level: getLevel(num), type,
        questionText, options, answer, transcript,
        translationEn: null, explanation: null, imagePath: null, audioPath: null,
      });

    } else {
      // image / spoken_options: placeholders precede the legacy separator; real options follow it.
      const placeholders = before.filter(isPlaceholderOption);
      const correctPlaceholder = placeholders.find((l) => /Correct answer/i.test(l));
      const answerLetter = correctPlaceholder?.trim().match(/^([A-D])\./i)?.[1] ?? "A";
      const answer = letterToIndex(answerLetter);

      // Non-CJK, non-blank lines after the legacy separator.
      const afterClean = after.filter((l) => {
        const t = l.trim();
        return t && !hasCJK(t) && !isPageMarker(t);
      });

      let transcript: string | null = null;
      let optionStart = 0;

      if (type === "spoken_options") {
        // Lines before the first real A./B./C./D. option are the transcript
        const firstOptionIdx = afterClean.findIndex((l) => isOptionLine(l.trim()));
        if (firstOptionIdx > 0) {
          transcript = afterClean.slice(0, firstOptionIdx).join("\n").trim();
          optionStart = firstOptionIdx;
        }
      }

      const realOptionLines = afterClean
        .slice(optionStart)
        .filter((l) => isOptionLine(l.trim()))
        .slice(0, 4);

      const options = realOptionLines.map(stripOptionPrefix);

      questions.push({
        orderIndex: num, level: getLevel(num), type,
        questionText, options, answer, transcript,
        translationEn: null, explanation: null, imagePath: null, audioPath: null,
      });
    }
  }

  return questions;
}
