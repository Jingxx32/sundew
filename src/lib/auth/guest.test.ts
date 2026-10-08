import assert from "node:assert/strict";
import test from "node:test";
import { guestAccessEnabled, rateLimitEnabled } from "./guest";

test("guest access is on unless explicitly disabled", () => {
  assert.equal(guestAccessEnabled({}), true);
  assert.equal(guestAccessEnabled({ GUEST_ACCESS_ENABLED: "true" }), true);
  assert.equal(guestAccessEnabled({ GUEST_ACCESS_ENABLED: "false" }), false);
});

test("rate limiting runs in production, and in development only on request", () => {
  assert.equal(rateLimitEnabled({ NODE_ENV: "production" }), true);
  assert.equal(rateLimitEnabled({ NODE_ENV: "development" }), false);
  assert.equal(rateLimitEnabled({ NODE_ENV: "development", AUTH_RATE_LIMIT_ENABLED: "true" }), true);
});
