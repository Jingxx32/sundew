/**
 * Deletes one user's data. Not "use server": called from Better Auth hooks,
 * the guest cleanup route and scripts.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { OWNED_DELETE_ORDER } from "./owned-tables";

export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

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
    const counts = await purgeOwnedData(userId, tx);
    await tx.delete(users).where(eq(users.id, userId));
    return counts;
  };
  return dbx === db ? db.transaction(run) : run(dbx);
}
