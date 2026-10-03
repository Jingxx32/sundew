export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  /** Set while an administrator is viewing the app as this user. */
  impersonatedBy: string | null;
};

type SessionLike = {
  user: { id: string; email: string; name: string; role?: string | null; banned?: boolean | null };
  session: { impersonatedBy?: string | null };
};

export function toAuthenticatedUser(session: SessionLike | null): AuthenticatedUser | null {
  if (!session || session.user.banned) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "admin" ? "admin" : "member",
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}
