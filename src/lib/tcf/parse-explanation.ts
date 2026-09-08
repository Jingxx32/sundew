/**
 * Parse one TCF explanation markdown file.
 *
 * Layout (see docs/architecture/tcf.md):
 *
 *   ---
 *   test: 1
 *   skill: reading
 *   question: 5
 *   written: 2026-08-13
 *   ---
 *
 *   ## Translation
 *   …
 *   ## Line by line
 *   …
 *
 * Explanations written before 2026-09-04 use legacy Chinese headings; both
 * spellings are accepted so the older half of the
 * corpus keeps its verdict bar and its `translation_en`.
 *
 * Pure: no IO, no DB. `written` is informational and deliberately not returned.
 */
import type { TcfExplanationMeta } from "@/lib/db/schema";

/** The three-part identifier that uniquely identifies a question. */
export interface ExplanationLocator {
  test: number;
  skill: "reading" | "listening";
  question: number;
}

export interface ParsedExplanation extends ExplanationLocator {
  /** Everything after the frontmatter, trimmed — written verbatim to `explanation`. */
  body: string;
  /** Body of the "## Translation" section, or null when the file has none. */
  translationEn: string | null;
  /** Structured "## Verdict" head, or null when the file has none. */
  meta: TcfExplanationMeta | null;
}

/** Unlike ParsedExplanation, this permits absent frontmatter and returns a null locator. */
export interface ParsedExplanationBody {
  locator: ExplanationLocator | null;
  body: string;
  translationEn: string | null;
  meta: TcfExplanationMeta | null;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/** Accepted spellings per section — English is current, Chinese is the pre-2026-09-04 form. */
const TRANSLATION_HEADINGS = ["Translation", "\u5168\u6587\u7ffb\u8bd1"] as const;
const VERDICT_HEADINGS = ["Verdict", "\u901f\u5224"] as const;
/** Listening only, and English-only — no listening explanation predates the English headings. */
const TRANSCRIPT_HEADINGS = ["Transcript"] as const;
/** `- Key: …` / legacy equivalent — the one line naming what decides the answer. */
const KEY_POINT_LINE = /^[-*]\s*(?:Key|\u773c)\s*[:\uFF1A]\s*(.+)$/i;
/** `- B ❌ …` — one option's verdict. The ✅/❌ mark is decorative; position is what binds. */
const OPTION_LINE = /^[-*]\s*([A-D])\s*(?:[✅❌]\s*)?(.+)$/;

function readField(fm: Record<string, string>, key: string): string {
  const value = fm[key];
  if (value === undefined || value === "") {
    throw new Error(`explanation frontmatter is missing "${key}"`);
  }
  return value;
}

function readNumber(fm: Record<string, string>, key: string): number {
  const raw = readField(fm, key);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`explanation frontmatter "${key}" must be a positive integer, got "${raw}"`);
  }
  return n;
}

/** Exact heading text, case-insensitive so `Verdict` and `verdict` both bind. */
function isHeading(text: string, headings: readonly string[]): boolean {
  const t = text.trim().toLowerCase();
  return headings.some((h) => h.toLowerCase() === t);
}

/**
 * Content of the first `## <heading>` section, up to the next heading of the
 * same or higher level (fewer or equal `#` marks). Deeper headings (more `#`
 * marks) are nested content and stay in the returned text.
 */
function sectionBody(body: string, headings: readonly string[]): string | null {
  const lines = body.split(/\r?\n/);
  const headingLine = /^(#{1,6})\s+(.*)$/;
  const start = lines.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && isHeading(m[2], headings);
  });
  if (start === -1) return null;
  const level = headingLine.exec(lines[start])![1].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && m[1].length <= level;
  });
  const picked = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return picked === "" ? null : picked;
}

/**
 * The markdown with its "## Verdict" section removed — heading included.
 *
 * That section is rendered as structured UI (verdict bar + per-option lines),
 * so leaving it in the prose would print everything twice. Stored bodies keep
 * it, which is what makes an exported file round-trip.
 */
export function stripVerdictSection(body: string): string {
  const lines = body.split(/\r?\n/);
  const headingLine = /^(#{1,6})\s+(.*)$/;
  const start = lines.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && isHeading(m[2], VERDICT_HEADINGS);
  });
  if (start === -1) return body;
  const level = headingLine.exec(lines[start])![1].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = headingLine.exec(l);
    return m !== null && m[1].length <= level;
  });
  const after = end === -1 ? [] : rest.slice(end);
  return [...lines.slice(0, start), ...after].join("\n").trim();
}

/**
 * Parse the "## Verdict" section into the structured head the UI renders above the
 * prose: one key point, plus a one-liner per option.
 *
 * Options bind by letter (A–D) to their index, not by order of appearance, so a
 * file may list them in any order and may omit some. Returns null when the
 * section is absent — every explanation written before this format existed.
 */
function parseVerdict(body: string): TcfExplanationMeta | null {
  const section = sectionBody(body, VERDICT_HEADINGS);
  if (section === null) return null;

  let keyPoint: string | null = null;
  const options: (string | null)[] = [null, null, null, null];

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    const key = KEY_POINT_LINE.exec(trimmed);
    if (key) {
      keyPoint = key[1].trim();
      continue;
    }
    const option = OPTION_LINE.exec(trimmed);
    if (option) options[option[1].charCodeAt(0) - 65] = option[2].trim();
  }

  if (keyPoint === null && options.every((entry) => entry === null)) return null;
  return { keyPoint, options };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse an explanation whose frontmatter is optional.
 *
 * The HTTP write endpoint accepts bodies with no frontmatter (the locator then
 * comes from the URL), so frontmatter absence is a valid state here rather than
 * an error. `parseExplanationFile` is the stricter wrapper used by the file-based
 * sync script.
 */
export function parseExplanationBody(raw: string): ParsedExplanationBody {
  const trimmed = raw.replace(/^\s+/, "");
  const match = FRONTMATTER.exec(trimmed);

  // Frontmatter is validated before the body-emptiness check so a file with
  // both a malformed locator and an empty body reports the locator problem.
  // This is uniform across skill/test/question — the pre-refactor split, where
  // only skill was checked this early, was an accident of expression placement.
  let locator: ExplanationLocator | null = null;
  if (match) {
    const fm: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      fm[line.slice(0, sep).trim()] = unquote(line.slice(sep + 1).trim());
    }

    const skill = readField(fm, "skill");
    if (skill !== "reading" && skill !== "listening") {
      throw new Error(
        `explanation frontmatter "skill" must be reading or listening, got "${skill}"`,
      );
    }

    locator = {
      test: readNumber(fm, "test"),
      skill,
      question: readNumber(fm, "question"),
    };
  }

  const body = (match ? trimmed.slice(match[0].length) : trimmed).trim();
  if (body === "") {
    throw new Error("explanation file has an empty body");
  }

  return {
    locator,
    body,
    translationEn: sectionBody(body, TRANSLATION_HEADINGS),
    meta: parseVerdict(body),
  };
}

export function parseExplanationFile(raw: string): ParsedExplanation {
  const parsed = parseExplanationBody(raw);
  if (parsed.locator === null) {
    throw new Error("explanation file has no --- frontmatter --- block");
  }
  return {
    ...parsed.locator,
    body: parsed.body,
    translationEn: parsed.translationEn,
    meta: parsed.meta,
  };
}

/**
 * Whether the explanation carries its own rearranged recording — a `## Transcript`
 * section with speaker turns, sentence breaks and `↳` sound notes.
 *
 * The runners print the stored `transcript` column in a panel of their own, but
 * that column is OCR run-on text with the question glued to its end. Where a
 * hand-written rearrangement exists it supersedes that panel, which would
 * otherwise show the same dialogue twice, unreadable version first.
 */
export function hasTranscriptSection(body: string): boolean {
  return sectionBody(body, TRANSCRIPT_HEADINGS) !== null;
}

/** Canonical label for a locator — CE = compréhension écrite, CO = orale. */
export function explanationLocatorLabel(p: ExplanationLocator): string {
  const prefix = p.skill === "reading" ? "CE" : "CO";
  return `${prefix}-T${p.test}-Q${p.question}`;
}

/** The canonical on-disk file name for a locator, e.g. `CE-T1-Q5.md`. */
export function expectedFileName(p: ExplanationLocator): string {
  return `${explanationLocatorLabel(p)}.md`;
}
