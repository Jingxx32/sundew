/**
 * Re-enrich vocabulary entries whose `richEntry` predates the structured-POS
 * schema (gender moved into the `noun` sub-object, `register`/`note`/`adjective`/…
 * added, subjonctif forms stored bare). Old rows render blank in PosDetails, so
 * this migrates every already-enriched row to the current FrenchVocabEntry shape.
 *
 * Idempotent — safe to re-run. Sequential to stay under OpenAI rate limits.
 *
 *   npm run db:reenrich            # re-enrich all enriched rows
 *   npm run db:reenrich -- --dry   # list what would change, no writes / no AI
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNotNull } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { userVocabulary } from "../src/lib/db/schema";
// NOTE: enrich (→ ai/client) instantiates the OpenAI SDK at module load and
// reads OPENAI_API_KEY. ESM hoists static imports above the dotenv config()
// calls above, so it must be imported lazily *inside* main() — after env is
// loaded — and only when actually enriching (not for --dry).

const dry = process.argv.includes("--dry");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url);
  const db = drizzle(sql, { schema });

  const rows = await db
    .select({
      userId: userVocabulary.userId,
      lemma: userVocabulary.lemma,
      pos: userVocabulary.pos,
    })
    .from(userVocabulary)
    .where(isNotNull(userVocabulary.enrichedAt));

  console.log(`Found ${rows.length} enriched row(s).`);
  if (dry) {
    for (const r of rows) console.log(`  would re-enrich: ${r.lemma} (${r.pos ?? "?"})`);
    await sql.end();
    return;
  }

  // Lazy import: only reached for a real run, after dotenv has populated env.
  const { enrichVocab } = await import("../src/lib/ai/enrich");

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const rich = await enrichVocab(row.lemma, row.pos);
      await db
        .update(userVocabulary)
        .set({ richEntry: rich, enrichedAt: new Date() })
        .where(
          and(eq(userVocabulary.userId, row.userId), eq(userVocabulary.lemma, row.lemma)),
        );
      ok++;
      console.log(`  ✓ ${row.lemma}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${row.lemma}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done. ${ok} re-enriched, ${failed} failed.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
