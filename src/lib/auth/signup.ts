/** Closed in production unless opened explicitly; sub-project 2 opens it behind feature tiers. */
export function signupEnabled(
  env: { NODE_ENV?: string; AUTH_SIGNUP_ENABLED?: string } = process.env,
): boolean {
  if (env.AUTH_SIGNUP_ENABLED === "true") return true;
  if (env.AUTH_SIGNUP_ENABLED === "false") return false;
  return env.NODE_ENV !== "production";
}
