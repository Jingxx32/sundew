import assert from "node:assert/strict";

/** Intentionally local-only. No environment files or business DB fallback. */
export function validateTarget(raw: string | undefined, expected: string, applicationUrl?: string) {
  assert(raw, "REVIEW_TEST_DATABASE_URL is required");
  assert(/^sundew_review_test_[a-z0-9_]{1,30}$/.test(expected), "Invalid isolated database name");
  let target: URL;
  try { target = new URL(raw); } catch { throw new Error("Invalid test database URL"); }
  assert(["postgres:", "postgresql:"].includes(target.protocol), "Expected PostgreSQL URL");
  assert(["127.0.0.1", "[::1]"].includes(target.hostname), "Only literal loopback hosts are allowed");
  assert(target.port && target.port !== "5432", "Use an explicit non-default isolated port");
  assert(!target.search && !target.hash, "Connection overrides are forbidden");
  assert(decodeURIComponent(target.pathname.slice(1)) === expected, "Database name mismatch");
  assert(decodeURIComponent(target.username).startsWith("sundew_review_test"), "Use a dedicated test role");
  if (applicationUrl) {
    let app: URL;
    try { app = new URL(applicationUrl); }
    catch { throw new Error("Application database configuration is invalid; isolation cannot be confirmed"); }
    // Refuse sharing the application endpoint, even with a different database.
    const host = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ? "loopback" : u.hostname;
    assert(host(app) !== host(target) || (app.port || "5432") !== target.port, "Application endpoint is forbidden");
  }
  return target;
}

export function failureCategory(error: unknown): string {
  // drizzle-orm >= 0.44 wraps driver errors in DrizzleQueryError; the SQLSTATE lives on `cause`.
  for (let current: unknown = error; current && typeof current === "object"; current = (current as { cause?: unknown }).cause) {
    if ("code" in current) return String((current as { code: unknown }).code);
  }
  return error instanceof Error ? error.name : "UnknownFailure";
}
