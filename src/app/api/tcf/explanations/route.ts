/**
 * Write one hand-written TCF explanation into the database, over HTTP.
 *
 *   POST /api/tcf/explanations
 *   POST /api/tcf/explanations?test=1&skill=listening&q=3
 *
 * Day-to-day authoring uses `npm run tcf:explain -- <file.md>`, which writes
 * through the same code without a server or a session. This route stays for an
 * administrator signed in to a development server: it is disabled in production
 * and needs an admin session cookie.
 *
 * The body is raw markdown, not JSON: explanations contain tables, quotes and
 * backticks, and JSON escaping them by hand is error-prone. See
 * src/lib/tcf/write-explanation.ts for the locator rules and what it may write.
 */
import { db } from "@/lib/db";
import { AuthenticationError, authErrorStatus, requireAdmin } from "@/lib/auth/session";
import { MAX_EXPLANATION_BYTES, writeExplanation, type WriteExplanationResult } from "@/lib/tcf/write-explanation";

const STATUS: Record<Extract<WriteExplanationResult, { ok: false }>["error"], number> = {
  empty_body: 400,
  body_too_large: 413,
  invalid_format: 400,
  locator_missing: 400,
  locator_conflict: 400,
  invalid_query: 400,
  question_not_found: 404,
  ambiguous_locator: 409,
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: error.code.toLowerCase() }, { status: authErrorStatus(error.code) });
    }
    throw error;
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

  // request.text() buffers everything before the size check can run, so
  // reject an oversized body from its declared length first. writeExplanation
  // checks again: Content-Length is client-supplied and may be absent.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_EXPLANATION_BYTES) {
    return Response.json({ error: "body_too_large" }, { status: 413 });
  }

  const result = await writeExplanation(db, await request.text(), new URL(request.url).searchParams);
  if (!result.ok) return Response.json(result, { status: STATUS[result.error] });
  return Response.json(result);
}
