/** Invite redemption for Better Auth hooks. Not "use server". */
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCodes, inviteRedemptions, users } from "@/lib/db/schema";
import type { Dbx } from "@/lib/account/delete";
import { inviteStatus, normalizeInviteCode } from "./code";

/** Atomically takes one use of a valid code; returns the invite id, or null. */
export async function reserveInviteUse(input: string, dbx: Dbx = db): Promise<string | null> {
  const code = normalizeInviteCode(input);
  if (!code) return null;
  const [row] = await dbx
    .update(inviteCodes)
    .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
    .where(and(
      eq(inviteCodes.code, code),
      isNull(inviteCodes.revokedAt),
      or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, sql`now()`)),
      lt(inviteCodes.usedCount, inviteCodes.maxUses),
    ))
    .returning({ id: inviteCodes.id });
  return row?.id ?? null;
}

export async function recordRedemption(input: string, userId: string, dbx: Dbx = db): Promise<void> {
  const code = normalizeInviteCode(input);
  if (!code) return;
  const [invite] = await dbx.select({ id: inviteCodes.id }).from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (invite) await dbx.insert(inviteRedemptions).values({ inviteId: invite.id, userId }).onConflictDoNothing();
}

/** Sign-in codes go only to existing accounts, or to a new address holding a valid invite. */
export async function mayReceiveSignInCode(email: string, inviteCookie: string | null): Promise<boolean> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1);
  if (existing) return true;
  const code = inviteCookie ? normalizeInviteCode(inviteCookie) : null;
  if (!code) return false;
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  return Boolean(invite) && inviteStatus(invite, new Date()) === "active";
}
