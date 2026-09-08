import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type AppUser } from "@/lib/db/schema";
import { LEGACY_OWNER_ID } from "@/lib/db/constants";
import {
  authConfigFromEnv,
  resolveRequestIdentity,
  type AppIdentity,
} from "./identity";

export class AuthenticationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTH_MISCONFIGURED";

  constructor(code: AuthenticationError["code"]) {
    super(code);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

export type AuthenticatedUser = AppIdentity & {
  id: string;
  role: "admin" | "member";
};

function adminEmails(): Set<string> {
  return new Set(
    (process.env.APP_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function identityIssuer(identity: AppIdentity): string {
  return identity.provider;
}

async function provisionUser(identity: AppIdentity): Promise<AppUser> {
  const issuer = identityIssuer(identity);
  const shouldBeAdmin = process.env.NODE_ENV !== "production" || adminEmails().has(identity.email);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(users)
      .where(and(eq(users.authIssuer, issuer), eq(users.authSubject, identity.subject)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    if (shouldBeAdmin) {
      const claimed = await tx
        .update(users)
        .set({
          authIssuer: issuer,
          authSubject: identity.subject,
          email: identity.email,
          role: "admin",
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, LEGACY_OWNER_ID), eq(users.authIssuer, "legacy")))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (claimed) return claimed;
    }

    const inserted = await tx
      .insert(users)
      .values({
        authIssuer: issuer,
        authSubject: identity.subject,
        email: identity.email,
        role: shouldBeAdmin ? "admin" : "member",
      })
      .onConflictDoNothing({ target: [users.authIssuer, users.authSubject] })
      .returning()
      .then((rows) => rows[0] ?? null);
    if (inserted) return inserted;

    const concurrent = await tx
      .select()
      .from(users)
      .where(and(eq(users.authIssuer, issuer), eq(users.authSubject, identity.subject)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!concurrent) throw new Error("Failed to provision authenticated user.");
    return concurrent;
  });
}

const resolveCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const decision = resolveRequestIdentity(await headers(), authConfigFromEnv());
  if (!decision.ok) return null;
  const row = await provisionUser(decision.identity);
  if (row.status !== "active") return null;
  return { ...decision.identity, id: row.id, role: row.role };
});

export const getCurrentUser = resolveCurrentUser;

export async function requireUser(): Promise<AuthenticatedUser> {
  const decision = resolveRequestIdentity(await headers(), authConfigFromEnv());
  if (decision.ok) {
    const user = await resolveCurrentUser();
    if (user) return user;
    throw new AuthenticationError("FORBIDDEN");
  }

  const code =
    decision.reason === "misconfigured"
      ? "AUTH_MISCONFIGURED"
      : decision.reason === "forbidden"
        ? "FORBIDDEN"
        : "UNAUTHENTICATED";
  throw new AuthenticationError(code);
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  throw new AuthenticationError("FORBIDDEN");
}
