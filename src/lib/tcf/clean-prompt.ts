/**
 * Strip the leading noise OCR leaves on a TCF prompt.
 *
 * The prompt is lifted off the question image, which prints the question number
 * next to the text ("2. À quoi sert ce panneau ?") and sometimes feeds a
 * stray glyph from the surrounding chrome into the line ("p Quelles sont …").
 * The app already shows the question number itself, so the prefix is noise.
 *
 * Deliberately conservative: it only removes a prefix it can name, and never
 * touches the sentence itself. Prompts truncated by the OCR line split are a
 * separate problem and are left alone.
 */

/** Single letters that open a real French question: "À qui …", "Y a-t-il …". */
const REAL_ONE_LETTER_WORD = /^[aày]$/i;

/** Something a sentence can legitimately start with, used as a lookahead. */
const SENTENCE_START = "[A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŸ]";

const PREFIXES: RegExp[] = [
  /^\s+/,
  /^\?{2,}\s*/,
  // The image's table border reads as a pipe.
  /^\|\s*/,
  // A stray quote glyph, but only when it sits in front of a number: a real
  // prompt can open on « … » and must keep it.
  /^['‘’`´]\s*(?=\d)/,
  /^\(\s*\d{1,3}\s*\)[\s.]*/,
  // A number closed by any of `.` `)` `]`, or straight into the border pipe.
  /^\d{1,3}\s*[.)\]|][\s.]*/,
  new RegExp(`^\\d{1,3}\\s+(?=${SENTENCE_START})`),
];

/** The stray-glyph rule needs the letter itself, so it is applied separately. */
const STRAY_LETTER = new RegExp(`^([A-Za-z])\\s+(?=${SENTENCE_START})`);

/**
 * A bare number in front of lowercase text is ambiguous — "23 l'utilisation …"
 * is a question number, "18 h 30 ?" is the time the sentence is about. Only the
 * question's own number resolves it, so pass `orderIndex` when it is known.
 */
function stripOwnNumber(text: string, orderIndex: number): string {
  const match = text.match(/^(\d{1,3})\s*/);
  if (!match || match[0].length === text.length) return text;
  return Number.parseInt(match[1], 10) === orderIndex ? text.slice(match[0].length) : text;
}

export function cleanPromptText(text: string, orderIndex?: number): string {
  let cleaned = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      const next = cleaned.replace(prefix, "");
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
    const stray = cleaned.match(STRAY_LETTER);
    if (stray && !REAL_ONE_LETTER_WORD.test(stray[1])) {
      cleaned = cleaned.slice(stray[0].length);
      changed = true;
    }
    if (orderIndex !== undefined) {
      const next = stripOwnNumber(cleaned, orderIndex);
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }
  return cleaned.trim();
}
