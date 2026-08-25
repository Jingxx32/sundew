/**
 * Export every TCF explanation from the database to markdown files.
 *
 *   npm run tcf:explain-export            # → data/tcf-explanations
 *   npm run tcf:explain-export -- <dir>   # → <dir>
 *
 * The database is the source of truth for explanations; this script is a
 * backup, not a sync. Take one before re-running a test import, because
 * scripts/import-tcf-reading.ts deletes and re-inserts a set's questions,
 * which drops explanation / translation_en with them.
 *
 * The default output lives under data/ (gitignored) because explanations embed
 * copyrighted TCF exam passages and this repo has a public GitHub remote.
 * Nothing restores from these files automatically — re-post one through
 * POST /api/tcf/explanations if you ever need it back.
 *
 * Files are written in the canonical CE-T1-Q5.md / CO-T13-Q30.md shape with
 * frontmatter, so an exported file is a valid endpoint body as-is.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNotNull, asc } from "drizzle-orm";

import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { expectedFileName } from "../src/lib/tcf/parse-explanation";

const DIR = path.resolve(process.argv[2] ?? path.join(process.cwd(), "data", "tcf-explanations"));

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  const rows = await db
    .select({
      test: tcfSets.testNumber,
      skill: tcfSets.skill,
      question: tcfQuestions.orderIndex,
      body: tcfQuestions.explanation,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(isNotNull(tcfQuestions.explanation))
    .orderBy(asc(tcfSets.skill), asc(tcfSets.testNumber), asc(tcfQuestions.orderIndex));

  await client.end();

  if (rows.length === 0) {
    console.log("No explanations in the database — nothing to export.");
    return;
  }

  mkdirSync(DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const locator = { test: row.test, skill: row.skill, question: row.question };
    const file = expectedFileName(locator);
    const frontmatter = [
      "---",
      `test: ${locator.test}`,
      `skill: ${locator.skill}`,
      `question: ${locator.question}`,
      `exported: ${today}`,
      "---",
      "",
    ].join("\n");
    writeFileSync(path.join(DIR, file), `${frontmatter}${row.body!.trim()}\n`, "utf8");
    console.log(`✓ ${file}`);
  }

  console.log(`\n${rows.length} explanation(s) exported to ${DIR}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
