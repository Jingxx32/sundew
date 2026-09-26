// Explicit isolated target only; never loads application environment files.
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { validateTarget } from "./review-rehearsal/safety.mjs";
const { values } = parseArgs({ options: { "expected-database":{type:"string"},owner:{type:"string"},source:{type:"string"},
  "dry-run":{type:"boolean"},apply:{type:"boolean"},resume:{type:"string"} } });
if (!values.owner || !values["expected-database"] || (!values["dry-run"] && !values.apply && !values.resume)) throw new Error("Explicit owner, target and mode are required");
const target=validateTarget(process.env.REVIEW_TEST_DATABASE_URL,values["expected-database"],process.env.DATABASE_URL);
// Imported service's default DB must remain isolated even when it is never used here.
process.env.DATABASE_URL=target.href;
const require=createRequire(import.meta.url);
const { sourceKeys,createBackfillJob,backfillPage }=require("../src/lib/review/backfill") as typeof import("../src/lib/review/backfill");
const { SOURCES }=require("../src/lib/review/state") as typeof import("../src/lib/review/state");
if (values.source && !SOURCES.includes(values.source as typeof SOURCES[number])) throw new Error("Invalid source");
if ([values["dry-run"],values.apply,values.resume].filter(Boolean).length!==1) throw new Error("Choose exactly one mode");
const client=postgres(target.href,{ max:1,onnotice:()=>{} });
const schema=require("../src/lib/db/schema") as typeof import("../src/lib/db/schema");
const db=drizzle(client,{schema});
try {
  const [identity]=await client`select current_database() as name,current_user as role`;
  if (identity.name!==values["expected-database"] || !identity.role.startsWith("sundew_review_test")) throw new Error("Isolation mismatch");
  if (values.resume) {
    let job;
    do { job=await db.transaction(tx=>backfillPage(tx,values.owner!,values.resume!)); console.log(JSON.stringify(job)); } while(job.status!=="completed");
  } else for (const source of SOURCES.filter(s=>!values.source || s===values.source)) {
    if (values["dry-run"]) {
      let cursor="",count=0; const cutoff=new Date();
      for (;;) { const keys=await sourceKeys(db,values.owner,source,cursor,cutoff); count+=keys.length; if(keys.length<200)break; cursor=keys.at(-1)!; }
      console.log(JSON.stringify({ source,candidateTargets:count,mode:"dry-run" }));
    } else {
      let job=await createBackfillJob(db,values.owner,source);
      console.log(JSON.stringify({ jobId:job.id,source }));
      do { job=await db.transaction(tx=>backfillPage(tx,values.owner!,job.id)); } while(job.status!=="completed");
      console.log(JSON.stringify(job));
    }
  }
} finally { await client.end(); }
