/**
 * Write one hand-written TCF explanation into the database.
 *
 *   POST /api/tcf/explanations
 *   POST /api/tcf/explanations?test=1&skill=listening&q=3
 *
 * The body is raw markdown, not JSON: explanations contain tables, quotes and
 * backticks, and JSON escaping them by hand is error-prone. The locator comes
 * from the markdown's own frontmatter when it has one, otherwise from the query.
 *
 * Dev-only and unauthenticated — see the design doc's security section. It can
 * only overwrite two columns of an already-existing question; it cannot insert
 * rows or touch any other table.
 *
 * The database is the source of truth for explanations, and this endpoint is
 * the only way in. scripts/export-tcf-explanations.ts dumps them back out to
 * markdown — take an export before re-importing a test, which deletes and
 * re-inserts its questions and drops the column with them.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tcfQuestions, tcfSets } from "@/lib/db/schema";
import { parseExplanationBody, explanationLocatorLabel } from "@/lib/tcf/parse-explanation";
import type { ParsedExplanationBody } from "@/lib/tcf/parse-explanation";
import { resolveExplanationLocator } from "@/lib/tcf/explanation-locator";

/** Hand-written prose with tables; the longest realistic explanation is a few KB. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  // Route handlers get no CSRF protection — Next's cross-site dev block only
  // covers /_next and /__nextjs — and a text/plain body is a CORS-simple
  // request, so no preflight fires. A page the user merely visits could
  // otherwise overwrite an explanation. Nothing in this app calls this
  // endpoint from the browser, and curl sends no Origin header, so rejecting
  // every Origin-bearing request costs the intended caller nothing.
  if (request.headers.get("origin") !== null) {
    return Response.json({ error: "cross_origin_forbidden" }, { status: 403 });
  }

  // request.text() buffers everything before the size check below can run, so
  // reject an oversized body from its declared length first. The post-read
  // check stays: Content-Length is client-supplied and may be absent.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json({ error: "body_too_large" }, { status: 413 });
  }

  const raw = await request.text();
  if (raw.trim() === "") {
    return Response.json({ error: "empty_body" }, { status: 400 });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "body_too_large" }, { status: 413 });
  }

  let parsed: ParsedExplanationBody;
  try {
    parsed = parseExplanationBody(raw);
  } catch (err) {
    return Response.json(
      { error: "invalid_format", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const resolved = resolveExplanationLocator(
    parsed.locator,
    new URL(request.url).searchParams,
  );
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
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

  if (rows.length === 0) {
    return Response.json({ error: "question_not_found", locator: label }, { status: 404 });
  }
  // (set_id, order_index) carries no unique constraint, so this is reachable.
  if (rows.length > 1) {
    return Response.json(
      { error: "ambiguous_locator", locator: label, matched: rows.length },
      { status: 409 },
    );
  }

  await db
    .update(tcfQuestions)
    .set({ explanation: parsed.body, translationEn: parsed.translationEn, explanationMeta: parsed.meta })
    .where(eq(tcfQuestions.id, rows[0].id));

  return Response.json({
    ok: true,
    locator: label,
    questionId: rows[0].id,
    hasTranslation: parsed.translationEn !== null,
    hasVerdict: parsed.meta !== null,
  });
}
