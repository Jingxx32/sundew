/**
 * Write one hand-written TCF explanation into its question — shared by the
 * `npm run tcf:explain` script and the admin-only POST /api/tcf/explanations.
 *
 * The body is raw markdown. Its locator comes from the frontmatter, otherwise
 * from `query` (test / skill / q); conflicting locators are refused. It can only
 * overwrite three columns of an already-existing question; it cannot insert rows
 * or touch any other table.
 *
 * The database client is passed in so scripts can use their own connection.
 */
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { tcfQuestions, tcfSets } from "@/lib/db/schema";
import { parseExplanationBody, explanationLocatorLabel } from "./parse-explanation";
import type { ParsedExplanationBody } from "./parse-explanation";
import { resolveExplanationLocator, type LocatorResolution } from "./explanation-locator";

/** Hand-written prose with tables; the longest realistic explanation is a few KB. */
export const MAX_EXPLANATION_BYTES = 256 * 1024;

export type WriteExplanationResult =
  | { ok: true; locator: string; questionId: string; hasTranslation: boolean; hasVerdict: boolean }
  | { ok: false; error: "empty_body" | "body_too_large" }
  | { ok: false; error: "invalid_format"; detail: string }
  | { ok: false; error: Extract<LocatorResolution, { ok: false }>["error"] }
  | { ok: false; error: "question_not_found"; locator: string }
  | { ok: false; error: "ambiguous_locator"; locator: string; matched: number };

export async function writeExplanation(
  db: PostgresJsDatabase<typeof schema>,
  raw: string,
  query: URLSearchParams = new URLSearchParams(),
): Promise<WriteExplanationResult> {
  if (raw.trim() === "") return { ok: false, error: "empty_body" };
  if (Buffer.byteLength(raw, "utf8") > MAX_EXPLANATION_BYTES) return { ok: false, error: "body_too_large" };

  let parsed: ParsedExplanationBody;
  try {
    parsed = parseExplanationBody(raw);
  } catch (err) {
    return { ok: false, error: "invalid_format", detail: err instanceof Error ? err.message : String(err) };
  }

  const resolved = resolveExplanationLocator(parsed.locator, query);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const locator = resolved.locator;
  const label = explanationLocatorLabel(locator);

  const rows = await db
    .select({ id: tcfQuestions.id })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(
      and(
        eq(tcfSets.testNumber, locator.test),
        eq(tcfSets.skill, locator.skill),
        eq(tcfQuestions.orderIndex, locator.question),
      ),
    );

  if (rows.length === 0) return { ok: false, error: "question_not_found", locator: label };
  // (set_id, order_index) carries no unique constraint, so this is reachable.
  if (rows.length > 1) return { ok: false, error: "ambiguous_locator", locator: label, matched: rows.length };

  await db
    .update(tcfQuestions)
    .set({ explanation: parsed.body, translationEn: parsed.translationEn, explanationMeta: parsed.meta })
    .where(eq(tcfQuestions.id, rows[0].id));

  return {
    ok: true,
    locator: label,
    questionId: rows[0].id,
    hasTranslation: parsed.translationEn !== null,
    hasVerdict: parsed.meta !== null,
  };
}
