import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { safeCallbackPath } from "./callback-path";
import { toAuthenticatedUser, type AuthenticatedUser } from "./user";

export type { AuthenticatedUser } from "./user";

export class AuthenticationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTH_MISCONFIGURED";

  constructor(code: AuthenticationError["code"]) {
    super(code);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

/** Validates the session cookie against the database once per request. */
const resolveCurrentUser = cache(async (): Promise<AuthenticatedUser | null> =>
  toAuthenticatedUser(await auth.api.getSession({ headers: await headers() })),
);

export const getCurrentUser = resolveCurrentUser;

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await resolveCurrentUser();
  if (user) return user;
  throw new AuthenticationError("UNAUTHENTICATED");
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  throw new AuthenticationError("FORBIDDEN");
}

/** Pages send signed-out visitors to /login and bring them back afterwards. */
export async function requirePageUser(): Promise<AuthenticatedUser> {
  const user = await resolveCurrentUser();
  if (user) return user;
  const path = safeCallbackPath((await headers()).get("x-sundew-path"));
  redirect(`/login?callbackURL=${encodeURIComponent(path)}`);
}
