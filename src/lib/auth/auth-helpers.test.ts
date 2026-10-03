import assert from "node:assert/strict";
import test from "node:test";
import { safeCallbackPath } from "./callback-path";
import { signupEnabled } from "./signup";
import { toAuthenticatedUser } from "./user";

test("callback paths stay on this site", () => {
  assert.equal(safeCallbackPath("/tcf/drill?skill=reading#q3"), "/tcf/drill?skill=reading#q3");
  for (const value of [null, undefined, "", "today", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/login?callbackURL=/x"]) {
    assert.equal(safeCallbackPath(value), "/today", String(value));
  }
});

test("sign-up is closed in production unless explicitly opened", () => {
  assert.equal(signupEnabled({ NODE_ENV: "production" }), false);
  assert.equal(signupEnabled({ NODE_ENV: "production", AUTH_SIGNUP_ENABLED: "true" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development", AUTH_SIGNUP_ENABLED: "false" }), false);
});

test("sessions map to the app user; banned users have none", () => {
  const session = { user: { id: "u1", email: "a@example.com", name: "", role: "admin", banned: false }, session: { impersonatedBy: null } };
  assert.deepEqual(toAuthenticatedUser(session), { id: "u1", email: "a@example.com", name: "", role: "admin", impersonatedBy: null });
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, role: "user" } })?.role, "member");
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, banned: true } }), null);
  assert.equal(toAuthenticatedUser(null), null);
  assert.equal(toAuthenticatedUser({ ...session, session: { impersonatedBy: "admin-1" } })?.impersonatedBy, "admin-1");
});
