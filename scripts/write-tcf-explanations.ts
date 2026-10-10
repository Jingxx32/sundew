/**
 * Write hand-written TCF explanations into the database — the everyday way in.
 *
 *   npm run tcf:explain -- CE-T1-Q5.md CO-T13-Q30.md
 *   npm run tcf:explain -- --test 1 --skill listening --q 3 notes.md
 *   pbpaste | npm run tcf:explain -- --test 1 --skill listening --q 3 -
 *
 * Each file's locator comes from its frontmatter (test / skill / question). The
 * --test/--skill/--q flags name the question for a single body without
 * frontmatter; when both are present they must agree. "-" reads stdin.
 *
 * Uses DATABASE_URL from .env.local / .env, so it writes wherever the app's
 * database is — no dev server and no sign-in needed. Explanations exist only in
 * the database: an import that re-creates a test's questions drops them, so run
 * `npm run tcf:explain-export` first.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { readFileSync } from "fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "../src/lib/db/schema";
import { writeExplanation } from "../src/lib/tcf/write-explanation";

function parseArgs(argv: string[]): { files: string[]; query: URLSearchParams } {
  const files: string[] = [];
  const query = new URLSearchParams();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--test" || flag === "--skill" || flag === "--q") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      query.set(flag.slice(2), value);
    } else {
      files.push(flag);
    }
  }
  if (files.length === 0) throw new Error("Pass one or more markdown files, or - for stdin.");
  if ([...query.keys()].length > 0 && files.length > 1) {
    throw new Error("--test/--skill/--q name one question; pass a single file with them.");
  }
  return { files, query };
}

async function main() {
  const { files, query } = parseArgs(process.argv.slice(2));
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });
  let failed = 0;
  try {
    for (const file of files) {
      const raw = readFileSync(file === "-" ? 0 : file, "utf8");
      const result = await writeExplanation(db, raw, query);
      if (result.ok) {
        const parts = [result.hasTranslation ? "translation" : "no translation", result.hasVerdict ? "verdict" : "no verdict"];
        console.log(`✓ ${file} → ${result.locator} (${parts.join(", ")})`);
      } else {
        failed++;
        const detail = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "ok" && key !== "error"));
        console.error(`✗ ${file}: ${result.error}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ""}`);
      }
    }
  } finally {
    await client.end();
  }
  console.log(`${files.length - failed}/${files.length} written`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
