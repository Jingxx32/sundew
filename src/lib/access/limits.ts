/** Guest and invite limits from the guest-access spec (§5, §9). */
export const GUEST_LIFETIME_DAYS = 7;
export const GUEST_SIGNINS_PER_IP_PER_HOUR = 3;
export const GUEST_DAILY_CAP = 200;
/** At least GUEST_DAILY_CAP, so one daily run can clear a full day of guests. */
export const GUEST_CLEANUP_BATCH = 250;
export const INVITE_COOKIE = "sundew_invite";
export const INVITE_COOKIE_MAX_AGE_S = 600;
export const INVITE_CHECKS_PER_WINDOW = 10;
export const INVITE_CHECK_WINDOW_S = 600;

/**
 * Paid OpenAI calls per member per 24 hours (admins are not limited). The window starts at a
 * member's first call. Rough worst case at gpt-4o / mini prices: about US$1 per member per day.
 *   generate   — gpt-4o: writing tasks, feedback, micro-drills, speaking, quiz parsing
 *   lookup     — gpt-4o-mini: word look-ups, entry details, CEFR estimates
 *   transcribe — Whisper: podcast imports
 */
export const AI_DAILY_LIMITS = { generate: 30, lookup: 300, transcribe: 3 } as const;
export type AiBucket = keyof typeof AI_DAILY_LIMITS;
export const AI_LIMIT_WINDOW_S = 86_400;

const DAY_MS = 86_400_000;

export function guestExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + GUEST_LIFETIME_DAYS * DAY_MS);
}

/** "Oct 14" — UTC, so server and client render the same day. */
export function formatGuestExpiry(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
