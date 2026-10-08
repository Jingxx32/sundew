/**
 * Deletes one user's data. Not "use server": called from Better Auth hooks,
 * the guest cleanup route and scripts.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCodes, users } from "@/lib/db/schema";
import { OWNED_DELETE_ORDER } from "./owned-tables";

export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const USER_HAS_INVITE_CODES_MESSAGE = "Reassign or delete this user's invite codes first.";

/** invite_codes.created_by has no ON DELETE, so a user who created codes cannot be deleted. */
export async function ownsInviteCodes(userId: string, dbx: Dbx = db): Promise<boolean> {
  const [row] = await dbx.select({ one: sql<number>`1` }).from(inviteCodes).where(eq(inviteCodes.createdBy, userId)).limit(1);
  return Boolean(row);
}

/** Deletes every row the user owns, children first. Leaves the users row. */
export async function purgeOwnedData(userId: string, dbx: Dbx = db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { name, table, scope } of OWNED_DELETE_ORDER) {
    const deleted = await dbx.delete(table).where(scope(userId)).returning({ one: sql<number>`1` });
    if (deleted.length) counts[name] = deleted.length;
  }
  return counts;
}

/** Purges owned data, then the users row (sessions and accounts cascade) — in one transaction. */
export async function deleteUserData(userId: string, dbx: Dbx = db): Promise<Record<string, number>> {
  const run = async (tx: Dbx) => {
    // Fail before deleting anything: the users row would be blocked by the invite_codes foreign key.
    if (await ownsInviteCodes(userId, tx)) throw new Error(USER_HAS_INVITE_CODES_MESSAGE);
    const counts = await purgeOwnedData(userId, tx);
    await tx.delete(users).where(eq(users.id, userId));
    return counts;
  };
  return dbx === db ? db.transaction(run) : run(dbx);
}
