import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { validateTarget } from "./review-rehearsal/safety.mjs";
import { seed,seedLexicon,A,B,TCF_Q,GAP_A } from "./review-rehearsal/fixtures.mjs";
import { loadActions } from "./review-rehearsal/actions.mjs";
const target=validateTarget(process.env.REVIEW_TEST_DATABASE_URL,process.argv[2],process.env.DATABASE_URL);
const client=postgres(target.href,{max:6,onnotice:()=>{},connection:{statement_timeout:15000}});
const results:{name:string;status:string;error?:string}[]=[];
const check=async(name:string,fn:()=>Promise<void>)=>{try{await fn();results.push({name,status:"passed"});console.log(`PASS ${name}`);}catch(e){results.push({name,status:"failed",error:e instanceof Error?e.message:String(e)});console.error(`FAIL ${name}: ${e}`);throw e;}};
let app:Awaited<ReturnType<typeof loadActions>>|undefined;
try{
 await migrate(drizzle(client),{migrationsFolder:"drizzle"});
 await seedLexicon(client);await seed(client);
 app=await loadActions(client);
 const require=createRequire(import.meta.url);
 const backfill=require("../src/lib/review/backfill") as typeof import("../src/lib/review/backfill");
 const review=require("../src/lib/review/service") as typeof import("../src/lib/review/service");
 const practice=require("../src/lib/practice/service") as typeof import("../src/lib/practice/service");
 const schema=require("../src/lib/db/schema") as typeof import("../src/lib/db/schema");
 const db=drizzle(client,{schema});
 const fill=async(source:"tcf"|"quiz"|"conjugation"|"writing"|"vocabulary")=>{
   let job=await backfill.createBackfillJob(db,A,source);
   do{job=await db.transaction(tx=>backfill.backfillPage(tx,A,job.id));}while(job.status!=="completed");return job;
 };
 process.env.REVIEW_DATA_ENABLED="true";process.env.REVIEW_CENTER_ENABLED="true";
 await check("live writes atomically collect only wrong or uncertain targets",async()=>{
   await app!.as(A,()=>app!.tcf.recordTcfQuestionAttempt({questionId:TCF_Q,chosen:1,requestKey:"m2-tcf-live-0001"}));
   await app!.as(A,()=>app!.quiz.submitQuizAttempt({setId:"quiz-a",answers:[{questionId:"q-a-1",answer:1},{questionId:"q-a-2",answer:0}],requestKey:"m2-quiz-live-0001"}));
   assert.equal((await client`select id from review_items where user_id=${A}`).length,2);
 });
 await check("backfill skips legacy aggregate Quiz and is repeatable",async()=>{
   await fill("quiz");await fill("conjugation");await fill("writing");await fill("vocabulary");
   assert.equal((await client`select id from review_items where source='quiz'`).length,1);
   const before=(await client`select id,revision from review_items order by id`);
   await fill("quiz");await fill("conjugation");
   assert.deepEqual(await client`select id,revision from review_items order by id`,before);
 });
 const [conj]=await client`select * from review_items where user_id=${A} and source='conjugation'`;
 await check("management CAS, receipt replay, ownership, preserved on rebackfill",async()=>{
   const input={id:conj.id,command:"note" as const,revision:conj.revision,requestKey:randomUUID(),value:"Preserve my note"};
   const saved=await review.changeReviewItem(A,input);assert.deepEqual(await review.changeReviewItem(A,input),saved);
   await assert.rejects(review.changeReviewItem(A,{...input,value:"changed"}),/REQUEST_CONFLICT/);
   await assert.rejects(review.changeReviewItem(B,{...input,requestKey:randomUUID()}),/NOT_FOUND/);
   await assert.rejects(review.changeReviewItem(A,{...input,requestKey:randomUUID()}),/REVISION_CONFLICT/);
   await fill("conjugation");assert.equal((await client`select note from review_items where id=${conj.id}`)[0].note,input.value);
 });
 await check("backfill page failure rolls back both items and cursor; resume is exact",async()=>{
   for(let i=0;i<205;i++)await client`insert into errors (id,user_id,submission_id,span_start,span_end,original,correction,category,subcategory,explanation_en,micro_drill)
     values (${"paged-"+String(i).padStart(3,"0")},${A},'submission-a',3,6,'est','suis','Grammar','conjugation_present','Synthetic','Complete je ... ici')`;
   let job=await backfill.createBackfillJob(db,A,"writing");
   await assert.rejects(db.transaction(async tx=>{await backfill.backfillPage(tx,A,job.id);throw new Error("crash after page");}),/crash/);
   assert.equal((await client`select processed from review_backfill_jobs where id=${job.id}`)[0].processed,0);
   assert.equal((await client`select id from review_items where source_key like 'paged-%'`).length,0);
   job=await db.transaction(tx=>backfill.backfillPage(tx,A,job.id));assert.equal(job.processed,200);
   job=await db.transaction(tx=>backfill.backfillPage(tx,A,job.id));assert.equal(job.processed,206);assert.equal(job.status,"completed");
   assert.equal((await db.transaction(tx=>backfill.backfillPage(tx,A,job.id))).processed,206);
 });
 await check("search and keyset pagination remain owner scoped",async()=>{
   let cursor:string|undefined; const ids=new Set<string>();
   do {const page=await review.listReviewItems(A,{view:"all",source:"writing",limit:17,cursor});for(const i of page.items){assert(!ids.has(i.id));ids.add(i.id);}cursor=page.nextCursor??undefined;}while(cursor);
   assert.equal(ids.size,206);assert.equal((await review.listReviewItems(B,{view:"all"})).count,0);
   assert.equal((await review.listReviewItems(A,{view:"all",search:"Preserve my note"})).count,1);
   assert.equal((await review.listReviewItems(A,{view:"all",search:"%"})).count,0);
 });
 const [tcf]=await client`select * from review_items where user_id=${A} and source='tcf'`;
 const [quiz]=await client`select * from review_items where user_id=${A} and source='quiz'`;
 let runId="";
 await check("fixed mixed run, redacted prompt, saved draft and pause survive reload",async()=>{
   const input={itemIds:[tcf.id,conj.id,quiz.id],requestKey:randomUUID()};
   const [one,two]=await Promise.all([practice.startRun(A,input),practice.startRun(A,input)]);assert.equal(one.id,two.id);runId=one.id;
   let run=await practice.getRun(A,runId);assert.equal(run.items.length,3);assert.equal(run.items[0].feedback,null);assert(!JSON.stringify(run).includes('"expected"'));
   await assert.rejects(practice.getRun(B,runId),/NOT_FOUND/);
   run=await practice.runCommand(A,{runId,revision:run.revision,requestKey:randomUUID(),command:"draft",itemId:run.items[0].id,draftRevision:0,answer:0});
   run=await practice.runCommand(A,{runId,revision:run.revision,requestKey:randomUUID(),command:"pause"});
   const reload=await practice.getRun(A,runId);assert.equal(reload.state,"paused");assert.equal(reload.items[0].draft,0);
   await practice.runCommand(A,{runId,revision:run.revision,requestKey:randomUUID(),command:"resume"});
 });
 await check("two tabs save one response, lost receipt replays, wrong answers count as saved",async()=>{
   let run=await practice.getRun(A,runId);
   const command={runId,revision:run.revision,requestKey:randomUUID(),command:"submit" as const,itemId:run.items[0].id,answer:0};
   const results=await Promise.all([practice.runCommand(A,command),practice.runCommand(A,command)]);assert.equal(results[0].items[0].state,"saved");
   assert.equal((await client`select id from tcf_question_attempts where run_item_id=${command.itemId}`).length,1);
   await assert.rejects(practice.runCommand(A,{...command,answer:1}),/REQUEST_CONFLICT/);
   run=await practice.getRun(A,runId);
   const results2=await Promise.allSettled(["suis","est"].map(answer=>practice.runCommand(A,{runId,revision:run.revision,requestKey:randomUUID(),command:"submit",itemId:run.items[1].id,answer})));
   assert.equal(results2.filter(r=>r.status==="fulfilled").length,1);
   run=await practice.getRun(A,runId);
   run=await practice.runCommand(A,{runId,revision:run.revision,requestKey:randomUUID(),command:"submit",itemId:run.items[2].id,answer:1});
   assert.equal(run.state,"completed");assert.equal(run.items[2].correct,false);
   assert.equal((await client`select id from quiz_attempts where user_id=${A}`).length,2);
   assert.equal((await client`select id from quiz_question_attempts where run_item_id=${run.items[2].id} and attempt_id is null`).length,1);
 });
 await check("reveal cannot advance recall; UI rollback retains readable receipts",async()=>{
   const {id}=await practice.startRun(A,{itemIds:[conj.id],requestKey:randomUUID()});let run=await practice.getRun(A,id);
   run=await practice.runCommand(A,{runId:id,revision:run.revision,requestKey:randomUUID(),command:"reveal",itemId:run.items[0].id});assert(run.items[0].feedback);
   const command={runId:id,revision:run.revision,requestKey:randomUUID(),command:"submit" as const,itemId:run.items[0].id,answer:"suis"};
   run=await practice.runCommand(A,command);assert.equal(run.state,"completed");
   assert.equal((await client`select success_count from review_items where id=${conj.id}`)[0].success_count,0);
   process.env.REVIEW_CENTER_ENABLED="false";
   assert.equal((await practice.runCommand(A,command)).state,"completed");
   await assert.rejects(practice.startRun(A,{itemIds:[conj.id],requestKey:randomUUID()}),/FEATURE_DISABLED/);
   process.env.REVIEW_CENTER_ENABLED="true";
 });
 await check("vocabulary uses one scheduler even when a second open run answers later",async()=>{
   const [v]=await client`select id from review_items where gap_id=${GAP_A}`;
   const runs=await Promise.all([1,2].map(()=>practice.startRun(A,{itemIds:[v.id],requestKey:randomUUID()})));
   for(const r of runs){const run=await practice.getRun(A,r.id);await practice.runCommand(A,{runId:r.id,revision:run.revision,requestKey:randomUUID(),command:"submit",itemId:run.items[0].id,answer:"hello"});}
   assert.equal((await client`select box from vocabulary_gaps where id=${GAP_A}`)[0].box,2);
   assert.equal((await client`select id from vocabulary_review_attempts where gap_id=${GAP_A}`).length,2);
 });
 await check("source edits block submission without saving a wrong answer",async()=>{
   const {id}=await practice.startRun(A,{itemIds:[quiz.id],requestKey:randomUUID()});const run=await practice.getRun(A,id);
   await client`update quiz_questions set question_text='Changed prompt' where id='q-a-1'`;
   const next=await practice.runCommand(A,{runId:id,revision:run.revision,requestKey:randomUUID(),command:"submit",itemId:run.items[0].id,answer:0});
   assert.equal(next.state,"paused");assert.equal(next.items[0].state,"blocked");
   assert.equal((await client`select id from quiz_question_attempts where run_item_id=${run.items[0].id}`).length,0);
 });
 await check("deleting source or attempt scrubs snapshots and revokes completion",async()=>{
   const run=await practice.getRun(A,runId);
   await client`delete from tcf_question_attempts where run_item_id=${run.items[0].id}`;
   const after=await practice.getRun(A,runId);assert.equal(after.state,"paused");assert.equal(after.items[0].prompt,null);assert.equal(after.items[0].draft,null);
   await client`delete from quiz_questions where id='q-a-1'`;
   const removed=await practice.getRun(A,runId);assert.equal(removed.items[2].prompt,null);assert.equal(removed.items[2].feedback,null);
 });
}catch(e){process.exitCode=1;console.error(e);}finally{
 await app?.close();await client.end();
 await writeFile(process.env.REVIEW_EVIDENCE_PATH??"/private/tmp/review-state-results.json",JSON.stringify({database:target.pathname.slice(1),results},null,2));
}
