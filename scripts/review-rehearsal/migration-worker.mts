// Deliberately isolated: terminating the DB backend can crash a client driver's event loop.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { validateTarget } from "./safety.mjs";

const target = validateTarget(process.env.REVIEW_TEST_DATABASE_URL, process.argv[2]);
const sql = postgres(target.href, { max: 1, onnotice: () => {},
  connection: { application_name: "review-test-migration-worker", statement_timeout: 15000 } });
try { await migrate(drizzle(sql), { migrationsFolder: process.argv[3] }); }
catch { process.exitCode = 1; }
finally { await sql.end({ timeout: 2 }); }
