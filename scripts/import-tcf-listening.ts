/**
 * Import TCF Compréhension orale questions from Member PDF(s) into the DB.
 * No audio, no translation, no AI calls. Image paths are null (filled later by pymupdf).
 *
 *   npx tsx scripts/import-tcf-listening.ts [testNumber]
 *   npx tsx scripts/import-tcf-listening.ts 1       # import test 1 only
 *   npx tsx scripts/import-tcf-listening.ts         # import all tests found
 *
 * Idempotent: re-running overwrites the set (deletes + re-inserts questions).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { parseQuestions } from "../src/lib/tcf/parse";

const PDF_DIR = process.env.TCF_LISTENING_DIR ?? "";
if (!PDF_DIR) {
  throw new Error(
    "TCF_LISTENING_DIR is not set — point it at your local listening PDF + audio folder.",
  );
}

/** Stored on every imported set, so rows can be traced back to their origin. */
const SOURCE = "TCF Canada — local practice material";

/** Extract the test number from a filename, e.g. "Compréhension orale test 3 (Member) - question bank.pdf" → 3. */
function extractTestNumber(filename: string): number | null {
  // Handles: "test 1 (Member)", "test 10 (Member)", "test 10 Member"
  const m = filename.match(/test\s+(\d+)\s*(?:\(Member\)|Member)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function importTest(
  db: ReturnType<typeof drizzle>,
  testNumber: number,
  pdfPath: string,
): Promise<void> {
  console.log(`\n[Test ${testNumber}] Reading PDF…`);
  const buf = readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  await parser.destroy();

  const questions = parseQuestions(result.text);
  if (questions.length === 0) {
    console.warn(`  ⚠ No questions parsed — skipping`);
    return;
  }
  console.log(`  Parsed ${questions.length} questions`);

  // Upsert the set (delete old questions then re-insert everything)
  const title = `Compréhension orale test ${testNumber}`;

  const existing = await db
    .select()
    .from(tcfSets)
    .where(and(eq(tcfSets.testNumber, testNumber), eq(tcfSets.skill, "listening")))
    .limit(1);

  let setId: string;
  if (existing.length > 0) {
    setId = existing[0].id;
    // Delete old questions (cascade would also handle it, but be explicit)
    await db.delete(tcfQuestions).where(eq(tcfQuestions.setId, setId));
    console.log(`  Overwriting existing set ${setId}`);
  } else {
    const [inserted] = await db
      .insert(tcfSets)
      .values({
        testNumber,
        skill: "listening",
        title,
        source: SOURCE,
      })
      .returning();
    setId = inserted.id;
    console.log(`  Created new set ${setId}`);
  }

  // Insert questions in order
  await db.insert(tcfQuestions).values(
    questions.map((q) => ({
      setId,
      orderIndex: q.orderIndex,
      level: q.level,
      type: q.type,
      questionText: q.questionText,
      options: q.options,
      answer: q.answer,
      transcript: q.transcript,
      translationEn: q.translationEn,
      explanation: q.explanation,
      imagePath: q.imagePath,
      audioPath: q.audioPath,
    })),
  );

  console.log(`  ✓ Inserted ${questions.length} questions for test ${testNumber}`);
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  const targetTestArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  // Find matching PDFs
  const files = readdirSync(PDF_DIR).filter(
    (f) => f.includes("Member") && f.endsWith(".pdf") && f.toLowerCase().includes("orale"),
  );

  const toImport: Array<{ testNumber: number; pdfPath: string }> = [];
  for (const f of files) {
    const n = extractTestNumber(f);
    if (!n) continue;
    if (targetTestArg !== null && n !== targetTestArg) continue;
    toImport.push({ testNumber: n, pdfPath: path.join(PDF_DIR, f) });
  }

  toImport.sort((a, b) => a.testNumber - b.testNumber);

  if (toImport.length === 0) {
    console.error("No matching PDFs found.");
    process.exit(1);
  }

  console.log(`Importing ${toImport.length} test(s)…`);
  for (const { testNumber, pdfPath } of toImport) {
    await importTest(db, testNumber, pdfPath);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
