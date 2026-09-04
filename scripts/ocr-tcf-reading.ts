/**
 * Local OCR for TCF reading (compréhension écrite) image questions.
 * Uses the Tesseract CLI (`brew install tesseract tesseract-lang`, French pack
 * `fra`) — fully local, NO API, NO tokens, no cost.
 *
 *   npx tsx scripts/ocr-tcf-reading.ts          # OCR all image questions missing passage
 *   npx tsx scripts/ocr-tcf-reading.ts 1        # only test 1
 *   npx tsx scripts/ocr-tcf-reading.ts 1 --force  # re-OCR even if passage already set
 *
 * Each image is "<document text> … <prompt ending in ?>". We store the document
 * in `passage` and, when a trailing interrogative line is found, lift it into
 * `questionText` (replacing the generic instruction). Options/answers are
 * untouched — they came from the MHTML import. Idempotent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { execFileSync } from "child_process";
import path from "path";
import { existsSync } from "fs";
import postgres from "postgres";

const PUBLIC_DIR = path.join(process.cwd(), "public");

function ocrImage(absPath: string): string {
  // PSM 6 = assume a single uniform block of text (these are clean screenshots).
  const out = execFileSync(
    "tesseract",
    [absPath, "-", "-l", "fra", "--psm", "6"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return out;
}

/** Tidy raw OCR text: trim lines, drop blanks, collapse runs of spaces. */
function clean(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
}

/**
 * French question-opener words the prompt line can start with. Anchors the
 * backward scan in splitPrompt — a wrapped passage line almost never starts
 * with one of these capitalized forms, so it reliably marks where the
 * (possibly multi-line) prompt begins.
 */
const QUESTION_STARTERS =
  /^(Qu['’ ]|Quel|Quelle|Quels|Quelles|Que |Qui |Quand|Combien|Comment|Pourquoi|Où |A quoi|À |De quoi|De quel|D['’]où|D['’]après|Selon|Dans |En quoi|Pour qui|Pour quoi|Pour quelle|Sur quoi|Sur quel|Lisez le)/;

/**
 * The question-number chip ("6.", "27", "39)") sometimes OCRs onto the same
 * line as the prompt's first word, and occasionally the digit itself gets
 * misread as a stray short token (e.g. "p Où est le musée ?"). Try the line
 * as-is first, then with a leading digit chip stripped, then with any
 * leading 1–3 char token stripped — returning the first form that reveals a
 * recognized question opener, or null if none does.
 */
function stripLeadingChip(line: string): string | null {
  if (QUESTION_STARTERS.test(line)) return line;
  const noDigit = line.replace(/^\d+[.)]?\s*/, "");
  if (noDigit !== line && QUESTION_STARTERS.test(noDigit)) return noDigit;
  const noChip = line.replace(/^\S{1,3}[.)]?\s+/, "");
  if (noChip !== line && QUESTION_STARTERS.test(noChip)) return noChip;
  return null;
}

/**
 * The on-screen number badge ("35", "32)", "23]") sits just left of the
 * prompt and, when the prompt wraps, can land on ANY of its OCR lines —
 * not just the first — landing mid-sentence (e.g. "...est décrit dans /
 * 35)| cet article ?"). Since we know the exact number for this question,
 * strip it from every line rather than guessing at punctuation shapes.
 */
function stripKnownChip(line: string, questionNumber: number): string {
  const re = new RegExp(`^${questionNumber}[.)\\]|]{0,3}\\s+`);
  return line.replace(re, "");
}

/**
 * Split OCR lines into { passage, prompt }. The prompt is the trailing
 * question — usually one line, but long prompts wrap across 2–3 OCR lines
 * (e.g. "Pourquoi ce dispositif est-il utile aux" / "jeunes ?"). Scan
 * backward from the last line and grow the prompt until it reaches a line
 * that looks like a question opener; that's the true start.
 */
function splitPrompt(
  rawLines: string[],
  questionNumber: number,
): { passage: string; prompt: string | null } {
  const lines = rawLines.map((l) => stripKnownChip(l, questionNumber));
  if (lines.length < 2) return { passage: lines.join("\n").trim(), prompt: null };

  const last = lines[lines.length - 1];
  // A real prompt is a short-ish question; guard against grabbing passage prose.
  if (!last.endsWith("?") || last.length > 200) {
    return { passage: lines.join("\n").trim(), prompt: null };
  }

  const MAX_LOOKBACK = 4; // prompts wrap at most ~3 lines in practice
  for (let span = 1; span <= MAX_LOOKBACK && span <= lines.length; span++) {
    const startIdx = lines.length - span;
    const cleaned = stripLeadingChip(lines[startIdx]);
    if (cleaned !== null) {
      const rest = lines.slice(startIdx + 1);
      const prompt = [cleaned, ...rest].join(" ").replace(/\s+/g, " ").trim();
      const passage = lines.slice(0, startIdx).join("\n").trim();
      return { passage, prompt };
    }
  }

  // No recognizable opener within the lookback window — fall back to the
  // old single-line behaviour rather than guessing.
  return { passage: lines.slice(0, -1).join("\n").trim(), prompt: last };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const testArg = args.find((a) => /^\d+$/.test(a));
  const testNumber = testArg ? parseInt(testArg, 10) : null;

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await sql<
    { id: string; orderIndex: number; testNumber: number; imagePath: string; hasPassage: boolean }[]
  >`
    SELECT q.id, q.order_index AS "orderIndex", s.test_number AS "testNumber",
           q.image_path AS "imagePath", (q.passage IS NOT NULL) AS "hasPassage"
    FROM tcf_questions q
    JOIN tcf_sets s ON s.id = q.set_id
    WHERE s.skill = 'reading'
      AND q.image_path IS NOT NULL
      ${testNumber !== null ? sql`AND s.test_number = ${testNumber}` : sql``}
    ORDER BY s.test_number, q.order_index
  `;

  const todo = force ? rows : rows.filter((r) => !r.hasPassage);
  console.log(
    `OCR target: ${todo.length} image questions` +
      (force ? " (force)" : " (missing passage)") +
      (testNumber !== null ? ` in test ${testNumber}` : "") +
      "\n",
  );

  let done = 0;
  let prompts = 0;
  let missingFiles = 0;

  for (const r of todo) {
    const abs = path.join(PUBLIC_DIR, r.imagePath);
    if (!existsSync(abs)) {
      missingFiles++;
      console.warn(`  ⚠ missing file: ${r.imagePath}`);
      continue;
    }

    let lines: string[];
    try {
      lines = clean(ocrImage(abs));
    } catch (e) {
      console.warn(`  ⚠ OCR failed for ${r.imagePath}: ${(e as Error).message}`);
      continue;
    }
    if (lines.length === 0) continue;

    const { passage, prompt } = splitPrompt(lines, r.orderIndex);
    if (prompt) {
      prompts++;
      await sql`UPDATE tcf_questions SET passage = ${passage}, question_text = ${prompt} WHERE id = ${r.id}`;
    } else {
      await sql`UPDATE tcf_questions SET passage = ${passage} WHERE id = ${r.id}`;
    }

    done++;
    if (done % 50 === 0) console.log(`  …${done}/${todo.length}`);
  }

  console.log(
    `\nDone. OCR'd ${done} questions (${prompts} with extracted prompt)` +
      (missingFiles ? `, ${missingFiles} files missing` : "") +
      ".",
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
