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

test("invite sign-up is on unless the kill switch is set", () => {
  assert.equal(signupEnabled({ NODE_ENV: "production" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "production", AUTH_SIGNUP_ENABLED: "false" }), false);
  assert.equal(signupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development", AUTH_SIGNUP_ENABLED: "false" }), false);
});

test("sessions map to the app user; banned users have none", () => {
  const session = { user: { id: "u1", email: "a@example.com", name: "", role: "admin", banned: false }, session: { impersonatedBy: null } };
  assert.deepEqual(toAuthenticatedUser(session), {
    id: "u1", email: "a@example.com", name: "", role: "admin",
    access: "admin", guestExpiresAt: null, impersonatedBy: null,
  });
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, role: "user" } })?.role, "member");
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, banned: true } }), null);
  assert.equal(toAuthenticatedUser(null), null);
  assert.equal(toAuthenticatedUser({ ...session, session: { impersonatedBy: "admin-1" } })?.impersonatedBy, "admin-1");
});

test("anonymous users are guests with an expiry", () => {
  const guest = toAuthenticatedUser({
    user: { id: "g1", email: "temp@anonymous.invalid", name: "Guest", role: "member", isAnonymous: true, createdAt: "2026-10-07T12:00:00Z" },
    session: {},
  });
  assert.equal(guest?.access, "guest");
  assert.equal(guest?.role, "member");
  assert.equal(guest?.guestExpiresAt?.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(toAuthenticatedUser({ user: { id: "m1", email: "m@example.com", name: "", role: "member" }, session: {} })?.access, "full");
});
