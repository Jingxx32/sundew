/**
 * Errors a user should understand, thrown from server code and shown on the client.
 *
 * In production Next replaces a thrown error's message with a generic one, but it keeps an
 * error's own `digest`. So the code travels in the digest and the client maps it back to text.
 * Imported by server actions and client components alike: no server-only code here.
 */
export const USER_ERROR_MESSAGES = {
  AI_DAILY_LIMIT: "You've reached today's AI limit for this account. It resets within 24 hours.",
  FEATURE_LOCKED: "This feature is for members only.",
  UNAUTHENTICATED: "Your session has ended. Sign in again to continue.",
  FORBIDDEN: "You don't have access to this.",
  AUTH_MISCONFIGURED: "Sign-in is temporarily unavailable. Try again later.",
} as const;

export type UserErrorCode = keyof typeof USER_ERROR_MESSAGES;

const DIGEST_PREFIX = "sundew:";

export function userErrorDigest(code: UserErrorCode): string {
  return `${DIGEST_PREFIX}${code}`;
}

export class UserFacingError extends Error {
  readonly code: UserErrorCode;
  readonly digest: string;

  constructor(code: UserErrorCode) {
    super(USER_ERROR_MESSAGES[code]);
    this.name = "UserFacingError";
    this.code = code;
    this.digest = userErrorDigest(code);
  }
}

/** The code carried by an error caught on the client, or null for any other error. */
export function userErrorCode(error: unknown): UserErrorCode | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith(DIGEST_PREFIX)) return null;
  const code = digest.slice(DIGEST_PREFIX.length);
  return Object.hasOwn(USER_ERROR_MESSAGES, code) ? (code as UserErrorCode) : null;
}

/**
 * Text for an error caught from a server action: ours by code; in development the raw message,
 * which helps debugging; otherwise the caller's fallback.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  const code = userErrorCode(error);
  if (code) return USER_ERROR_MESSAGES[code];
  if (process.env.NODE_ENV !== "production" && error instanceof Error && error.message) return error.message;
  return fallback;
}
