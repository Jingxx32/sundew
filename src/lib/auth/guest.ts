type Env = { NODE_ENV?: string; GUEST_ACCESS_ENABLED?: string; AUTH_RATE_LIMIT_ENABLED?: string };

/** One-click guests are on unless GUEST_ACCESS_ENABLED is "false". */
export function guestAccessEnabled(env: Env = process.env): boolean {
  return env.GUEST_ACCESS_ENABLED !== "false";
}

/** Better Auth rate limiting: always in production; in development only when testing it. */
export function rateLimitEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" || env.AUTH_RATE_LIMIT_ENABLED === "true";
}
