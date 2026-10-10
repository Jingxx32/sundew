import assert from "node:assert/strict";
import test from "node:test";
import { USER_ERROR_MESSAGES, UserFacingError, userErrorCode, userErrorMessage } from "./user-error";

test("a user-facing error carries its code in the digest", () => {
  const error = new UserFacingError("AI_DAILY_LIMIT");
  assert.equal(error.digest, "sundew:AI_DAILY_LIMIT");
  assert.equal(error.message, USER_ERROR_MESSAGES.AI_DAILY_LIMIT);
});

test("the client recovers the code from the digest alone, as production delivers it", () => {
  const redacted = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "sundew:AI_DAILY_LIMIT" });
  assert.equal(userErrorCode(redacted), "AI_DAILY_LIMIT");
  assert.equal(userErrorMessage(redacted, "fallback"), USER_ERROR_MESSAGES.AI_DAILY_LIMIT);
});

test("unknown digests and plain values are not ours", () => {
  for (const value of [
    Object.assign(new Error("x"), { digest: "1234567" }),
    Object.assign(new Error("x"), { digest: "sundew:toString" }),
    Object.assign(new Error("x"), { digest: "sundew:NOPE" }),
    null,
    "AI_DAILY_LIMIT",
  ]) {
    assert.equal(userErrorCode(value), null);
  }
});

test("other errors fall back outside development", () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal(userErrorMessage(new Error("db timeout"), "Try again."), "Try again.");
    env.NODE_ENV = "development";
    assert.equal(userErrorMessage(new Error("db timeout"), "Try again."), "db timeout");
  } finally {
    env.NODE_ENV = previous;
  }
});
