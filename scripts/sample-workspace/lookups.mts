/**
 * Pre-generates look-up entries for every word in the sample texts, so guests
 * can look words up without an AI call. Resumable: writes every 25 entries.
 *   npm run sample:lookups            # dry run: counts and cost estimate
 *   npm run sample:lookups -- --yes   # generate with gpt-4o-mini (≈ US$0.00015 per word)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const { tokenizeForLookups } = await import("../../src/lib/sample-workspace/lookups");

const dir = path.join(process.cwd(), "src/lib/sample-workspace/fixtures");
const outFile = path.join(dir, "lookups.json");
const workspace = JSON.parse(await readFile(path.join(dir, "workspace.json"), "utf8"));
const entries: Record<string, unknown> = JSON.parse(await readFile(outFile, "utf8"));
const documents = (workspace.tables.documents ?? []) as Array<{ content: string }>;
if (!documents.length) throw new Error("workspace.json has no documents; run sample:export first");

const items = new Map(documents.flatMap((d) => tokenizeForLookups(d.content)).map((item) => [item.key, item]));
const missing = [...items.values()].filter((item) => !Object.hasOwn(entries, item.key));
console.log(`${items.size} distinct words, ${missing.length} without an entry; estimated cost ≈ US$${(missing.length * 0.00015).toFixed(2)}`);
if (!process.argv.includes("--yes")) {
  console.log("Dry run. Re-run with --yes to generate.");
  process.exit(0);
}

const { lookupWord } = await import("../../src/lib/ai/lookup");
const sorted = () => Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
let succeeded = 0;
const failed: string[] = [];
for (const [i, item] of missing.entries()) {
  try {
    entries[item.key] = await lookupWord(item.surface, item.context);
    succeeded += 1;
  } catch (error) {
    failed.push(`${item.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if ((i + 1) % 25 === 0 || i === missing.length - 1) {
    await writeFile(outFile, JSON.stringify(sorted(), null, 2) + "\n");
    console.log(`${i + 1}/${missing.length}`);
  }
}
console.log(JSON.stringify({ processed: missing.length, succeeded, failed: failed.length }));
for (const line of failed) console.log("  failed", line);
process.exit(0);
