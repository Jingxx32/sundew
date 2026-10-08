/** Emergency switch for invite sign-ups: on unless AUTH_SIGNUP_ENABLED is "false". Codes are still required. */
export function signupEnabled(env: { NODE_ENV?: string; AUTH_SIGNUP_ENABLED?: string } = process.env): boolean {
  return env.AUTH_SIGNUP_ENABLED !== "false";
}
