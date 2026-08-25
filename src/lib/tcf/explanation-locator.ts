/**
 * Merge the two places a question locator can come from: the explanation's own
 * frontmatter, and the write endpoint's URL query.
 *
 * Frontmatter wins when only it is present; the query fills in when the body
 * carries none. When both are present and disagree, this refuses to guess —
 * picking one would silently overwrite a different question's explanation.
 *
 * Pure: no IO, no DB.
 */
import type { ExplanationLocator } from "./parse-explanation";

export type LocatorResolution =
  | { ok: true; locator: ExplanationLocator }
  | { ok: false; error: "locator_missing" | "locator_conflict" | "invalid_query" };

const QUERY_KEYS = ["test", "skill", "q"] as const;

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The locator the URL names, `null` when it names none, and `undefined` when it
 * names one that is incomplete or malformed.
 */
function fromQuery(params: URLSearchParams): ExplanationLocator | null | undefined {
  const present = QUERY_KEYS.filter((k) => params.get(k) !== null);
  if (present.length === 0) return null;
  if (present.length < QUERY_KEYS.length) return undefined;

  const test = positiveInt(params.get("test")!);
  const question = positiveInt(params.get("q")!);
  const skill = params.get("skill")!;

  if (test === null || question === null) return undefined;
  if (skill !== "reading" && skill !== "listening") return undefined;

  return { test, skill, question };
}

export function resolveExplanationLocator(
  fromBody: ExplanationLocator | null,
  params: URLSearchParams,
): LocatorResolution {
  const query = fromQuery(params);
  if (query === undefined) return { ok: false, error: "invalid_query" };

  if (query === null) {
    return fromBody === null
      ? { ok: false, error: "locator_missing" }
      : { ok: true, locator: fromBody };
  }
  if (fromBody === null) return { ok: true, locator: query };

  const agree =
    fromBody.test === query.test &&
    fromBody.skill === query.skill &&
    fromBody.question === query.question;

  return agree ? { ok: true, locator: fromBody } : { ok: false, error: "locator_conflict" };
}
