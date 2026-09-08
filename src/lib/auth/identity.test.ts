import assert from "node:assert/strict";
import test from "node:test";
import { authLoginPath, resolveRequestIdentity } from "./identity";

const headers = (values: Record<string, string> = {}) => new Headers(values);

test("development uses an explicit local identity without trusting request headers", () => {
  const result = resolveRequestIdentity(
    headers({ "x-ms-client-principal-name": "attacker@example.com" }),
    { nodeEnv: "development", devEmail: "Owner@Example.com" },
  );
  assert.deepEqual(result, {
    ok: true,
    identity: {
      subject: "dev:owner@example.com",
      email: "owner@example.com",
      provider: "development",
    },
  });
});

test("production fails closed when authentication mode is missing", () => {
  assert.deepEqual(
    resolveRequestIdentity(headers(), { nodeEnv: "production" }),
    { ok: false, reason: "misconfigured" },
  );
});

test("production rejects a missing platform identity", () => {
  assert.deepEqual(
    resolveRequestIdentity(headers(), {
      nodeEnv: "production",
      mode: "azure-easy-auth",
      allowedEmails: "owner@example.com",
      adminEmails: "owner@example.com",
    }),
    { ok: false, reason: "unauthenticated" },
  );
});

test("production fails closed when more than one email is configured", () => {
  assert.deepEqual(
    resolveRequestIdentity(
      headers({
        "x-ms-client-principal-id": "entra-subject",
        "x-ms-client-principal-name": "owner@example.com",
        "x-ms-client-principal-idp": "google",
      }),
      {
        nodeEnv: "production",
        mode: "azure-easy-auth",
        allowedEmails: "owner@example.com,friend@example.com",
        adminEmails: "owner@example.com",
      },
    ),
    { ok: false, reason: "misconfigured" },
  );
});

test("production rejects an authenticated email outside the allowlist", () => {
  assert.deepEqual(
    resolveRequestIdentity(
      headers({
        "x-ms-client-principal-id": "entra-subject",
        "x-ms-client-principal-name": "friend@example.com",
        "x-ms-client-principal-idp": "google",
      }),
      {
        nodeEnv: "production",
        mode: "azure-easy-auth",
        allowedEmails: "owner@example.com",
        adminEmails: "owner@example.com",
      },
    ),
    { ok: false, reason: "forbidden" },
  );
});

test("production requires the sole allowed user to be an administrator", () => {
  assert.deepEqual(
    resolveRequestIdentity(
      headers({
        "x-ms-client-principal-id": "entra-subject",
        "x-ms-client-principal-name": "owner@example.com",
        "x-ms-client-principal-idp": "google",
      }),
      {
        nodeEnv: "production",
        mode: "azure-easy-auth",
        allowedEmails: "owner@example.com",
        adminEmails: "",
      },
    ),
    { ok: false, reason: "misconfigured" },
  );
});

test("production accepts an allowlisted email case-insensitively", () => {
  const result = resolveRequestIdentity(
    headers({
      "x-ms-client-principal-id": "entra-subject",
      "x-ms-client-principal-name": "Owner@Example.com",
      "x-ms-client-principal-idp": "google",
    }),
    {
      nodeEnv: "production",
      mode: "azure-easy-auth",
      allowedEmails: " owner@example.com ",
      adminEmails: "owner@example.com",
    },
  );
  assert.deepEqual(result, {
    ok: true,
    identity: {
      subject: "entra-subject",
      email: "owner@example.com",
      provider: "google",
    },
  });
});

test("production rejects an identity asserted by a different provider", () => {
  assert.deepEqual(
    resolveRequestIdentity(
      headers({
        "x-ms-client-principal-id": "aad-subject",
        "x-ms-client-principal-name": "owner@example.com",
        "x-ms-client-principal-idp": "aad",
      }),
      {
        nodeEnv: "production",
        mode: "azure-easy-auth",
        provider: "google",
        allowedEmails: "owner@example.com",
        adminEmails: "owner@example.com",
      },
    ),
    { ok: false, reason: "forbidden" },
  );
});

test("Microsoft Entra can be selected explicitly", () => {
  const result = resolveRequestIdentity(
    headers({
      "x-ms-client-principal-id": "aad-subject",
      "x-ms-client-principal-name": "owner@example.com",
      "x-ms-client-principal-idp": "aad",
    }),
    {
      nodeEnv: "production",
      mode: "azure-easy-auth",
      provider: "aad",
      allowedEmails: "owner@example.com",
      adminEmails: "owner@example.com",
    },
  );
  assert.deepEqual(result, {
    ok: true,
    identity: {
      subject: "aad-subject",
      email: "owner@example.com",
      provider: "aad",
    },
  });
});

test("login path defaults to Google and rejects unknown providers", () => {
  assert.equal(authLoginPath({}), "/.auth/login/google");
  assert.equal(authLoginPath({ provider: "aad" }), "/.auth/login/aad");
  assert.equal(authLoginPath({ provider: "unknown" }), null);
});
