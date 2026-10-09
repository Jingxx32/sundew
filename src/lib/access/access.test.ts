import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES, canUse, deriveAccess, type Access, type FeatureKey } from "./features";
import { formatGuestExpiry, guestExpiresAt } from "./limits";

test("access derives from role and anonymity", () => {
  assert.equal(deriveAccess("admin", false), "admin");
  assert.equal(deriveAccess("admin", true), "admin");
  assert.equal(deriveAccess("member", true), "guest");
  assert.equal(deriveAccess("member", false), "full");
  assert.equal(deriveAccess(null, null), "full");
});

test("full and admin use everything; guests follow the registry", () => {
  const keys = Object.keys(FEATURES) as FeatureKey[];
  for (const access of ["full", "admin"] as Access[]) {
    for (const key of keys) assert.equal(canUse(access, key), true, `${access} ${key}`);
  }
  assert.deepEqual(Object.fromEntries(keys.map((key) => [key, canUse("guest", key)])), {
    tcf: false, speaking: false, quiz: false, writing: false,
    microDrill: false, upload: false, lookup: "sample", enrich: false,
  });
});

test("guests expire seven days after creation", () => {
  const expires = guestExpiresAt(new Date("2026-10-07T12:00:00Z"));
  assert.equal(expires.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(formatGuestExpiry(expires), "Oct 14");
});

test("every feature explains why it is members-only", () => {
  for (const [key, feature] of Object.entries(FEATURES)) {
    assert.match(feature.memberReason, /^\S.*\.$/, key);
  }
});
