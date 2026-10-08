/** Copies the reviewed sample workspace into a new guest's account. Not "use server". */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { vocabularyLookups } from "@/lib/db/schema";
import type { Dbx } from "@/lib/account/delete";
import { decodeFixture, type WorkspaceFixture } from "./format";
import bundled from "./fixtures/workspace.json";

export const SAMPLE_WORKSPACE = bundled as unknown as WorkspaceFixture;

/** One transaction; returns rows inserted per table. */
export async function seedSampleWorkspace(userId: string, now = new Date(), dbx: Dbx = db, fixture = SAMPLE_WORKSPACE): Promise<Record<string, number>> {
  const run = async (tx: Dbx) => {
    // user_vocabulary, occurrences and gaps reference the shared lemma table.
    const lemmas = fixture.shared.vocabularyLookups;
    if (lemmas.length) {
      await tx
        .insert(vocabularyLookups)
        .values(lemmas.map(({ lemma, surface }) => ({ id: randomUUID(), lemma, surface })))
        .onConflictDoNothing({ target: vocabularyLookups.lemma });
    }
    const counts: Record<string, number> = {};
    for (const { name, table, rows } of decodeFixture(fixture, userId, now, randomUUID).tables) {
      await tx.insert(table).values(rows as never);
      counts[name] = rows.length;
    }
    return counts;
  };
  return dbx === db ? db.transaction(run) : run(dbx);
}
