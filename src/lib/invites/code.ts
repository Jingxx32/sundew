/** Invite codes: Crockford base32 without I, L, O, U, shown as XXXX-XXXX (~40 bits). Pure. */
export const INVITE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateInviteCode(randomBytes: (n: number) => Uint8Array): string {
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  const chars = Array.from(randomBytes(8), (byte) => INVITE_ALPHABET[byte % 32]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Accepts any case, spaces, a missing dash and O/I/L confusables; null when it cannot be a code. */
export function normalizeInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (raw.length !== 8 || [...raw].some((c) => !INVITE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export type InviteStatus = "active" | "expired" | "used_up" | "revoked";

export function inviteStatus(
  invite: { maxUses: number; usedCount: number; expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt <= now) return "expired";
  if (invite.usedCount >= invite.maxUses) return "used_up";
  return "active";
}

export type ExpiryChoice = "none" | "7d" | "30d" | { date: string };

/** A date choice expires at the end of that UTC day. */
export function expiresAtFrom(choice: ExpiryChoice, now: Date): Date | null {
  if (choice === "none") return null;
  if (choice === "7d" || choice === "30d") return new Date(now.getTime() + (choice === "7d" ? 7 : 30) * 86_400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.date)) throw new Error("Expiry must be a date (YYYY-MM-DD).");
  const end = new Date(`${choice.date}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime())) throw new Error("Expiry must be a date (YYYY-MM-DD).");
  if (end <= now) throw new Error("Expiry is in the past.");
  return end;
}
