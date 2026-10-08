"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCodes, inviteRedemptions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/client-ip";
import { expiresAtFrom, generateInviteCode, inviteStatus, normalizeInviteCode, type ExpiryChoice, type InviteStatus } from "@/lib/invites/code";
import { INVITE_CHECKS_PER_WINDOW, INVITE_CHECK_WINDOW_S, INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S } from "@/lib/access/limits";

export type InviteCheckResult = { status: "ok" } | { status: "invalid" | "rate_limited" | Exclude<InviteStatus, "active"> };

/** Public: validates a code and, when it is usable, remembers it for the sign-up hook. */
export async function checkInviteCode(input: string): Promise<InviteCheckResult> {
  const ip = clientIp(await headers());
  if (!(await consumeRateLimit(`invite-check:${ip}`, INVITE_CHECK_WINDOW_S, INVITE_CHECKS_PER_WINDOW))) {
    return { status: "rate_limited" };
  }
  const code = normalizeInviteCode(input);
  if (!code) return { status: "invalid" };
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (!invite) return { status: "invalid" };
  const status = inviteStatus(invite, new Date());
  if (status !== "active") return { status };
  (await cookies()).set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE_S,
  });
  return { status: "ok" };
}

export async function clearInviteCode(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}

export type InviteRow = {
  id: string;
  code: string;
  note: string;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  status: InviteStatus;
  redemptions: Array<{ email: string; redeemedAt: Date }>;
};

export async function listInviteCodes(): Promise<InviteRow[]> {
  await requireAdmin();
  const invites = await db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt));
  const redemptions = invites.length
    ? await db
        .select({ inviteId: inviteRedemptions.inviteId, email: users.email, redeemedAt: inviteRedemptions.redeemedAt })
        .from(inviteRedemptions)
        .innerJoin(users, eq(users.id, inviteRedemptions.userId))
        .where(inArray(inviteRedemptions.inviteId, invites.map((i) => i.id)))
        .orderBy(desc(inviteRedemptions.redeemedAt))
    : [];
  const now = new Date();
  return invites.map((invite) => ({
    id: invite.id,
    code: invite.code,
    note: invite.note,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    status: inviteStatus(invite, now),
    redemptions: redemptions.filter((r) => r.inviteId === invite.id).map(({ email, redeemedAt }) => ({ email, redeemedAt })),
  }));
}

export type CreateInviteResult = { ok: true; code: string } | { ok: false; error: string };

export async function createInviteCode(input: { maxUses: number; expiry: ExpiryChoice; note: string }): Promise<CreateInviteResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 500) {
    return { ok: false, error: "Uses must be a whole number from 1 to 500." };
  }
  const note = input.note.trim();
  if (note.length > 200) return { ok: false, error: "Keep the note under 200 characters." };
  let expiresAt: Date | null;
  try {
    expiresAt = expiresAtFrom(input.expiry, new Date());
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid expiry." };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode((n) => randomBytes(n));
    const inserted = await db
      .insert(inviteCodes)
      .values({ code, maxUses: input.maxUses, expiresAt, note, createdBy: admin.id })
      .onConflictDoNothing({ target: inviteCodes.code })
      .returning({ code: inviteCodes.code });
    if (inserted.length) {
      revalidatePath("/admin/invites");
      return { ok: true, code };
    }
  }
  return { ok: false, error: "Couldn't create a unique code. Try again." };
}

export async function revokeInviteCode(id: string): Promise<void> {
  await requireAdmin();
  await db.update(inviteCodes).set({ revokedAt: new Date() }).where(and(eq(inviteCodes.id, id), isNull(inviteCodes.revokedAt)));
  revalidatePath("/admin/invites");
}
