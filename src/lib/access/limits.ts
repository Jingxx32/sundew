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
 * Paid AI calls per member per 24 hours (admins are not limited). The window starts at a
 * member's first call. Chat runs on Nebius (DeepSeek V4.1 Flash fast); rough worst case
 * at its prices: about US$0.5 per member per day.
 *   generate   — writing tasks, feedback, micro-drills, speaking, quiz parsing
 *   lookup     — word look-ups, entry details, CEFR estimates
 *   transcribe — OpenAI Whisper: podcast imports
 *   tutor      — TCF tutor chat answers (card proposals and review items use lookup)
 */
export const AI_DAILY_LIMITS = { generate: 30, lookup: 300, transcribe: 3, tutor: 40 } as const;
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
