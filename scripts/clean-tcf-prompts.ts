/**
 * Strip OCR noise from the front of TCF prompts (question numbers, stray glyphs).
 *
 *   npx tsx scripts/clean-tcf-prompts.ts            # dry run — prints every change
 *   npx tsx scripts/clean-tcf-prompts.ts --apply    # write them
 *
 * Idempotent: a second run finds nothing. Re-run it after re-importing a test,
 * since an import rewrites `question_text` from the source again.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

import { cleanPromptText } from "../src/lib/tcf/clean-prompt";

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 });

  const rows = await sql<
    { id: string; skill: string; testNumber: number; orderIndex: number; questionText: string }[]
  >`
    SELECT q.id, s.skill, s.test_number AS "testNumber", q.order_index AS "orderIndex",
           q.question_text AS "questionText"
    FROM tcf_questions q
    JOIN tcf_sets s ON s.id = q.set_id
    ORDER BY s.skill, s.test_number, q.order_index
  `;

  const changes = rows
    .map((row) => ({ row, cleaned: cleanPromptText(row.questionText, row.orderIndex) }))
    .filter(({ row, cleaned }) => cleaned !== row.questionText);

  for (const { row, cleaned } of changes) {
    const label = `${row.skill === "reading" ? "CE" : "CO"}-T${row.testNumber}-Q${row.orderIndex}`;
    console.log(`${label}\n  -  ${JSON.stringify(row.questionText)}\n  +  ${JSON.stringify(cleaned)}`);
  }

  const emptied = changes.filter(({ cleaned }) => cleaned.length === 0);
  if (emptied.length > 0) {
    console.error(`\nAborted: cleaning would leave ${emptied.length} question prompts empty.`);
    await sql.end();
    process.exit(1);
  }

  console.log(`\nScanned ${rows.length} questions; ${changes.length} require cleaning.`);
  if (!apply) {
    console.log("This is a dry run; the database was not changed. Pass --apply to write changes.");
    await sql.end();
    return;
  }

  let written = 0;
  for (const { row, cleaned } of changes) {
    const updated = await sql`UPDATE tcf_questions SET question_text = ${cleaned} WHERE id = ${row.id} RETURNING id`;
    written += updated.length;
  }
  console.log(`Wrote ${written} questions.`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
