/**
 * Rebuild paragraphs from an OCR'd TCF reading passage.
 *
 * `scripts/ocr-tcf-reading.ts` stores one DB line per line of the source image,
 * and drops blank lines, so a stored passage is a stack of hard wraps with no
 * paragraph structure left. Rendering it verbatim turns a five-line note into a
 * ragged column. This joins the wrapped lines back up while keeping the lines
 * that are structure — salutations, closings, signatures, headings.
 *
 * Rendering-time only: the DB keeps the raw OCR text, so the heuristics below
 * can be changed without a migration.
 */

/** Sentence-final punctuation. A line ending here is a real line. */
const TERMINAL = /[.!?;»…]["»']?$/;

/**
 * A colon ends a heading ("Heures d'ouverture du service consulaire :") but
 * also sits mid-sentence in French ("… pas un rapport affectif : on ne demande
 * pas …"). Length separates the two.
 */
const COLON_HEADING_MAX_LENGTH = 45;

/** A one- or two-word capitalised last line is a signature, not a wrap. */
const SIGNATURE_MAX_LENGTH = 30;
const SIGNATURE_MAX_WORDS = 2;

function isSignature(line: string): boolean {
  return (
    line.length <= SIGNATURE_MAX_LENGTH &&
    line.split(/\s+/).length <= SIGNATURE_MAX_WORDS &&
    /^[A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŸÑ]/.test(line)
  );
}

/** A salutation ("Cher Paul,") reads as its own line; a wrapped clause does not. */
const SALUTATION_MAX_LENGTH = 30;

/** Sign-offs that stand alone even without punctuation ("Bises", "Cordialement"). */
const CLOSING =
  /^(bises|bisous|(très )?cordialement|amicalement|sincèrement|salutations( distinguées)?|bien à vous|à bientôt|à très bientôt|je t'embrasse|merci( d'avance)?|au revoir|salut)[\s,.!]*$/i;

/**
 * Openers of a TCF prompt. The OCR sometimes leaves a prompt's first line at the
 * end of the passage; this keeps it on its own line instead of gluing it to the
 * signature. Removing it is a separate, non-layout decision.
 */
const PROMPT_OPENER =
  /^(\(\d+\)\s*)?(qu'est-ce|que\s|qu'|quel|quelle|quels|quelles|qui\s|quand\s|où\s|pourquoi|comment|combien|selon\s|d'après|à qui|de quoi|dans quel)/i;

/**
 * A short opening line followed by a fresh capitalised one is a heading
 * ("Covoiturage", "Objet : réunion de service"), not a wrap. Restricted to the
 * first line: elsewhere a capital usually starts a proper noun that belongs to
 * the clause above it ("… au foyer" / "Valmoutiers.").
 */
const HEADING_MAX_LENGTH = 35;

function isBreakAfter(line: string, next: string, index: number, nextIsLast: boolean): boolean {
  if (TERMINAL.test(line)) return true;
  if (line.endsWith(":") && line.length <= COLON_HEADING_MAX_LENGTH) return true;
  if (line.endsWith(",") && line.length <= SALUTATION_MAX_LENGTH) return true;
  if (CLOSING.test(line)) return true;
  if (CLOSING.test(next)) return true;
  if (nextIsLast && PROMPT_OPENER.test(next)) return true;
  if (nextIsLast && isSignature(next)) return true;
  if (index === 0 && line.length <= HEADING_MAX_LENGTH && /^[A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŸÑ«"]/.test(next)) return true;
  return false;
}

/** One string per rebuilt paragraph, ready to render as its own <p>. */
export function reflowPassage(passage: string): string[] {
  const lines = passage.split("\n").map((line) => line.trim());
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(" "));
    current = [];
  };

  lines.forEach((line, index) => {
    if (line === "") {
      flush();
      return;
    }
    current.push(line);
    const next = lines[index + 1];
    if (next === undefined || next === "") {
      flush();
      return;
    }
    if (isBreakAfter(line, next, index, index + 2 === lines.length)) flush();
  });
  flush();

  return paragraphs;
}
