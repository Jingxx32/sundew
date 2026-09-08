/**
 * Deterministic parser for the one text-based TCF Compréhension écrite PDF
 * (test 40). Unlike the 39 MHTML tests — whose passages are baked into images —
 * this PDF carries real, machine-readable text: passage + prompt + 4 options,
 * with a compact answer key on the last page. No AI, no network.
 *
 * pdf-parse emits tab-separated words, a repeated legacy marketplace watermark, and
 * "-- N of M --" page markers; we normalise those away first.
 *
 * Questions are anchored on the regular A/B/C/D option run (option text may
 * wrap onto continuation lines). Question numbering in the source is unreliable
 * (some numbers are inline, some duplicated by "Texte corrigé" headers), so we
 * assign orderIndex 1..39 by document order of the option groups instead.
 */
export interface ParsedReadingPdfQuestion {
  orderIndex: number;
  questionText: string;
  passage: string;
  options: string[];
  answer: number;
}

const ANSWER_KEY_RE = /^\d+\s*-\s*\d+\s+[A-D]{2,}$/;
/** A line that introduces a new question block (bare "12." or "12. Texte corrigé (...)"). */
const MARKER_RE = /^(?:\d+\.\s*)?Texte\s+corrig[ée]/i;
const NUMBER_MARKER_RE = /^\d+\.\s*$/;
// Options appear in two styles across the source: "A Texte" and "A. Texte".
const OPTION_RE = /^([A-D])[.)]?\s+(.*)$/;

/** Normalise pdf-parse output into clean, trimmed lines. */
function cleanLines(raw: string): string[] {
  const t = raw
    .replace(/Tcfca\/tcf:闲鱼搜索魔女的手杖/g, "")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\t/g, " ")
    // collapse spaces around apostrophes: "l ' île" → "l'île"
    .replace(/ *(['’]) */g, "$1")
    .replace(/[ ]{2,}/g, " ");
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Concatenated correct-answer letters, in question order (handles a source range typo). */
function parseAnswerKey(lines: string[]): string[] {
  return lines
    .filter((l) => ANSWER_KEY_RE.test(l))
    .map((l) => l.replace(/^\d+\s*-\s*\d+\s+/, ""))
    .join("")
    .split("");
}

function isMarker(line: string): boolean {
  return NUMBER_MARKER_RE.test(line) || MARKER_RE.test(line);
}

export function parseReadingPdf(rawText: string): ParsedReadingPdfQuestion[] {
  const lines = cleanLines(rawText);

  const answerKey = parseAnswerKey(lines);

  // Body = everything before the answer-key block at the end.
  const firstAk = lines.findIndex((l) => ANSWER_KEY_RE.test(l));
  const body = firstAk >= 0 ? lines.slice(0, firstAk) : lines;

  // Locate every option-start line and segment into A→B→C→D groups.
  const optStarts: Array<{ letter: string; idx: number }> = [];
  body.forEach((l, idx) => {
    const m = l.match(OPTION_RE);
    if (m) optStarts.push({ letter: m[1], idx });
  });

  // Group: each 'A' opens a group; collect the following B, C, D.
  const groups: Array<{ A: number; B: number; C: number; D: number }> = [];
  for (let i = 0; i < optStarts.length; i++) {
    if (optStarts[i].letter !== "A") continue;
    const want = ["B", "C", "D"];
    const found: number[] = [optStarts[i].idx];
    let j = i + 1;
    for (const w of want) {
      if (j < optStarts.length && optStarts[j].letter === w) {
        found.push(optStarts[j].idx);
        j++;
      }
    }
    if (found.length === 4) {
      groups.push({ A: found[0], B: found[1], C: found[2], D: found[3] });
      i = j - 1;
    }
  }

  /** Join an option-start line plus its wrapped continuation lines, stripping the letter. */
  function optionText(start: number, end: number): string {
    const first = body[start].replace(OPTION_RE, "$2");
    const cont = body.slice(start + 1, end).join(" ");
    return (first + " " + cont).replace(/\s+/g, " ").trim();
  }

  /** Where option D's text ends: the first marker line after D (start of next block), capped at limit. */
  function dEnd(dIdx: number, limit: number): number {
    for (let k = dIdx + 1; k < limit; k++) {
      if (isMarker(body[k])) return k;
    }
    // No explicit marker before the next question — assume D is a single line.
    return Math.min(dIdx + 1, limit);
  }

  const questions: ParsedReadingPdfQuestion[] = [];

  groups.forEach((g, gi) => {
    const nextA = gi + 1 < groups.length ? groups[gi + 1].A : body.length;
    const dStop = dEnd(g.D, nextA);

    const options = [
      optionText(g.A, g.B),
      optionText(g.B, g.C),
      optionText(g.C, g.D),
      optionText(g.D, dStop),
    ];

    // Prompt = the line immediately above option A; passage = everything from the
    // end of the previous block up to the prompt, with block markers stripped.
    const questionText = (body[g.A - 1] ?? "").trim();
    const prevStop = gi === 0 ? 0 : dEnd(groups[gi - 1].D, g.A);
    const passage = body
      .slice(prevStop, g.A - 1)
      .filter((l) => !isMarker(l))
      .join("\n")
      .trim();

    const orderIndex = gi + 1;
    const letter = answerKey[gi] ?? "A";
    const answer = letter.charCodeAt(0) - 65;

    questions.push({ orderIndex, questionText, passage, options, answer });
  });

  return questions;
}
