import { deriveAccess, type Access } from "@/lib/access/features";
import { guestExpiresAt } from "@/lib/access/limits";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  /** What this user may use — derived from role and is_anonymous. */
  access: Access;
  /** Guests only: when the daily cleanup deletes this account. */
  guestExpiresAt: Date | null;
  /** Set while an administrator is viewing the app as this user. */
  impersonatedBy: string | null;
};

type SessionLike = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
    banned?: boolean | null;
    isAnonymous?: boolean | null;
    createdAt?: Date | string | null;
  };
  session: { impersonatedBy?: string | null };
};

export function toAuthenticatedUser(session: SessionLike | null): AuthenticatedUser | null {
  if (!session || session.user.banned) return null;
  const access = deriveAccess(session.user.role, session.user.isAnonymous);
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "admin" ? "admin" : "member",
    access,
    guestExpiresAt: access === "guest" ? guestExpiresAt(new Date(session.user.createdAt ?? Date.now())) : null,
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}
