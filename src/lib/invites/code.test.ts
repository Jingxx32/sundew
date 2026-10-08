import assert from "node:assert/strict";
import test from "node:test";
import { INVITE_ALPHABET, expiresAtFrom, generateInviteCode, inviteStatus, normalizeInviteCode } from "./code";
import { clientIp } from "../auth/client-ip";

test("generated codes are XXXX-XXXX from the Crockford alphabet", () => {
  const code = generateInviteCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(INVITE_ALPHABET.length, 32);
  assert.ok(!/[ILOU]/.test(INVITE_ALPHABET));
});

test("normalization accepts what people type", () => {
  assert.equal(normalizeInviteCode("ab3d-7k9q"), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode(" ab3d 7k9q "), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode("AB3D7K9Q"), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode("OB1L-I0O0"), "0B11-1000");
  for (const bad of ["", "AB3D-7K9", "AB3D-7K9QX", "AB3D-7K9U", "AB3D_7K9Q"]) assert.equal(normalizeInviteCode(bad), null, bad);
});

test("status: revoked beats expired beats used up", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const base = { maxUses: 2, usedCount: 0, expiresAt: null, revokedAt: null };
  assert.equal(inviteStatus(base, now), "active");
  assert.equal(inviteStatus({ ...base, usedCount: 2 }, now), "used_up");
  assert.equal(inviteStatus({ ...base, usedCount: 2, expiresAt: new Date("2026-10-07T11:00:00Z") }, now), "expired");
  assert.equal(inviteStatus({ ...base, expiresAt: new Date("2026-10-07T11:00:00Z"), revokedAt: now }, now), "revoked");
});

test("expiry choices", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(expiresAtFrom("none", now), null);
  assert.equal(expiresAtFrom("7d", now)?.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(expiresAtFrom("30d", now)?.toISOString(), "2026-11-06T12:00:00.000Z");
  assert.equal(expiresAtFrom({ date: "2026-10-20" }, now)?.toISOString(), "2026-10-20T23:59:59.999Z");
  assert.throws(() => expiresAtFrom({ date: "2026-10-01" }, now), /past/);
  assert.throws(() => expiresAtFrom({ date: "20-10-2026" }, now), /date/);
});

test("client IP comes from the first forwarded hop", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.8" })), "203.0.113.8");
  assert.equal(clientIp(new Headers()), "unknown");
});
