/**
 * Seeds the bundled sample workspace into a throwaway user, deletes it again,
 * and rolls everything back. Run after every migration and before deploying.
 *   npm run sample:check
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const { sql } = await import("drizzle-orm");
const { db } = await import("../../src/lib/db");
const { users } = await import("../../src/lib/db/schema");
const { OWNED_TABLES } = await import("../../src/lib/account/owned-tables");
const { deleteUserData } = await import("../../src/lib/account/delete");
const { decodeFixture } = await import("../../src/lib/sample-workspace/format");
const { SAMPLE_WORKSPACE, seedSampleWorkspace } = await import("../../src/lib/sample-workspace/seed");

const { unknownKeys } = decodeFixture(SAMPLE_WORKSPACE, "check", new Date(), randomUUID);
if (unknownKeys.length) console.warn("Fixture keys the schema no longer has (ignored):", unknownKeys.join(", "));
const expected = Object.fromEntries(Object.entries(SAMPLE_WORKSPACE.tables).map(([name, rows]) => [name, rows.length]));

const rollback = new Error("ROLLBACK");
try {
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: `sample-check-${randomUUID()}@example.com`, name: "Guest", isAnonymous: true }).returning();
    const seeded = await seedSampleWorkspace(user.id, new Date(), tx);
    console.log("seeded:");
    console.table(seeded);
    assert.deepEqual(seeded, expected, "seeded counts differ from the fixture");
    console.log("deleted:", await deleteUserData(user.id, tx));
    for (const { name, table, scope } of OWNED_TABLES) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(table).where(scope(user.id));
      assert.equal(n, 0, `${name} still has rows after deletion`);
    }
    console.log("seed → delete: OK");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("ROLLED BACK");
}
process.exit(0);
