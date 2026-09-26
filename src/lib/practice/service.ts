import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { expiredPauses, hash, lockReviewOwner, resolveSource, reviewUiEnabled, type ReviewDb } from "@/lib/review/adapters";
import { assertRequestKey, syncReviewTarget } from "@/lib/review/service";
import { publicPrompt, type ReviewSnapshot } from "@/lib/review/types";
import { gradeQuizAnswers } from "@/lib/quiz/grading";
import { gradeGapInTransaction } from "@/lib/vocabulary/gaps";

export const commandSchema = z.object({
  runId:z.string().uuid(), requestKey:z.string().min(12).max(100).regex(/^[a-zA-Z0-9-]+$/), revision:z.number().int().nonnegative(),
  command:z.enum(["draft","submit","reveal","pause","resume","cancel"]), itemId:z.string().uuid().optional(),
  answer:z.union([z.string().max(1000),z.number().int().min(0).max(100)]).optional(),
  uncertain:z.boolean().optional(), draftRevision:z.number().int().nonnegative().optional(),
}).strict();
export type PracticeCommand = z.infer<typeof commandSchema>;
function enabled() { if (!reviewUiEnabled()) throw new Error("FEATURE_DISABLED"); }
function supported(snapshot: ReviewSnapshot) {
  // Paid writing recovery and versioned vocabulary audio have separate acceptance gates.
  return snapshot.kind !== "writing" && snapshot.kind !== "listening";
}
export async function startRun(userId:string,input:{itemIds:string[];requestKey:string}) {
  assertRequestKey(input.requestKey);
  const ids=z.array(z.string().uuid()).min(1).max(20).parse(input.itemIds);
  if(new Set(ids).size!==ids.length)throw new Error("VALIDATION");
  const digest=hash({ids});
  return db.transaction(async tx=>{
    await lockReviewOwner(tx,userId);
    const [prior]=await tx.select().from(s.practiceRuns).where(and(eq(s.practiceRuns.userId,userId),eq(s.practiceRuns.requestKey,input.requestKey)));
    if(prior){if(prior.requestHash!==digest)throw new Error("REQUEST_CONFLICT");return {id:prior.id};}
    enabled(); await expiredPauses(tx,userId,new Date());
    const targets: {id:string;snapshot:ReviewSnapshot}[]=[];
    for(const id of ids){
      const [item]=await tx.select().from(s.reviewItems).where(and(eq(s.reviewItems.userId,userId),eq(s.reviewItems.id,id)));
      if(!item)throw new Error("NOT_FOUND");
      const current=await syncReviewTarget(tx,userId,item.source,item.sourceKey);
      const resolved=await resolveSource(tx,userId,item.source,item.sourceKey);
      if(!current || current.management!=="active" || current.availability!=="ready" || !resolved || !supported(resolved.snapshot))throw new Error("SNAPSHOT_UNAVAILABLE");
      targets.push({id,snapshot:resolved.snapshot});
    }
    const [run]=await tx.insert(s.practiceRuns).values({userId,count:targets.length,requestKey:input.requestKey,requestHash:digest}).returning();
    await tx.insert(s.practiceRunItems).values(targets.map((t,position)=>({userId,runId:run.id,reviewItemId:t.id,position,snapshot:t.snapshot})));
    return {id:run.id};
  });
}

function itemDto(item:typeof s.practiceRunItems.$inferSelect){
  const snap=item.snapshot;
  return {id:item.id,position:item.position,state:item.state,draft:item.draft,draftRevision:item.draftRevision,
    prompt:snap ? publicPrompt(snap):null, source:snap?.source ?? null, revealed:!!item.revealedAt,
    correct:item.correct,uncertain:item.uncertain,submittedAt:item.submittedAt,
    feedback:snap && (item.revealedAt || item.state==="saved") ? {expected:snap.expected,explanation:snap.explanation}:null};
}
async function readRun(tx:ReviewDb,userId:string,id:string){
  const [run]=await tx.select().from(s.practiceRuns).where(and(eq(s.practiceRuns.userId,userId),eq(s.practiceRuns.id,id)));
  if(!run)throw new Error("NOT_FOUND");
  const rows=await tx.select().from(s.practiceRunItems).where(and(eq(s.practiceRunItems.userId,userId),eq(s.practiceRunItems.runId,id))).orderBy(asc(s.practiceRunItems.position));
  return {id:run.id,state:run.state,revision:run.revision,count:run.count,completedAt:run.completedAt,items:rows.map(itemDto),enabled:reviewUiEnabled()};
}
export type RunView = Awaited<ReturnType<typeof getRun>>;
export async function getRun(userId:string,id:string){
  z.string().uuid().parse(id);
  return db.transaction(tx=>readRun(tx,userId,id),{isolationLevel:"repeatable read"});
}
export async function recentRuns(userId:string){
  return db.select({id:s.practiceRuns.id,state:s.practiceRuns.state,count:s.practiceRuns.count,createdAt:s.practiceRuns.createdAt})
    .from(s.practiceRuns).where(eq(s.practiceRuns.userId,userId)).orderBy(asc(s.practiceRuns.state),s.practiceRuns.createdAt).limit(20);
}

function grade(snapshot:ReviewSnapshot,answer:string|number|undefined){
  if(answer===undefined)throw new Error("VALIDATION");
  if(snapshot.source==="quiz" || snapshot.source==="tcf"){
    return gradeQuizAnswers([{id:snapshot.key,type:snapshot.kind==="choice"?"single":"fill_blank",answer:snapshot.expected,options:snapshot.choices}],
      [{questionId:snapshot.key,answer}])[0].correct;
  }
  if(typeof answer!=="string" || !answer.trim() || answer.length>200 || !Array.isArray(snapshot.expected))throw new Error("VALIDATION");
  const normalize=(value:string)=>snapshot.source==="vocabulary" ? value.normalize("NFC").trim().toLocaleLowerCase("fr") : value.normalize("NFD").replace(/\p{Diacritic}/gu,"").trim().toLowerCase().replace(/[’]/g,"'").replace(/\s+/g," ").replace(/^[^\p{L}']+|[^\p{L}']+$/gu,"");
  return snapshot.expected.some(value=>normalize(value)===normalize(answer));
}
async function writeAnswer(tx:ReviewDb,userId:string,item:typeof s.practiceRunItems.$inferSelect,answer:string|number,correct:boolean,uncertain:boolean,requestHash:string){
  const snap=item.snapshot!; const base={userId,runItemId:item.id};
  if(snap.source==="tcf"){
    const [a]=await tx.insert(s.tcfQuestionAttempts).values({...base,questionId:snap.key,mode:"review",chosen:answer as number,correct,uncertain,gradeVersion:1,requestKey:item.id,requestHash}).returning();
    return {id:a.id,type:"tcf_question"};
  }
  if(snap.source==="quiz"){
    const [a]=await tx.insert(s.quizQuestionAttempts).values({...base,attemptId:null,questionId:snap.key,answer,correct,uncertain,graderVersion:1}).returning();
    return {id:a.id,type:"quiz_question"};
  }
  if(snap.source==="conjugation"){
    const [a]=await tx.insert(s.conjugationAttempts).values({...base,id:randomUUID(),...snap.target!,userInput:answer as string,expected:(snap.expected as string[])[0],correct,requestKey:item.id,requestHash}).returning();
    return {id:a.id,type:"conjugation"};
  }
  if(snap.source==="vocabulary"){
    const [gap]=await tx.select().from(s.vocabularyGaps).where(and(eq(s.vocabularyGaps.userId,userId),eq(s.vocabularyGaps.id,snap.key))).for("update");
    if(!gap)throw new Error("SNAPSHOT_UNAVAILABLE");
    await gradeGapInTransaction(tx,userId,gap.id,correct,{answer:answer as string,gradingMethod:"objective",requestKey:item.id,
      practiceOnly:!!item.revealedAt || uncertain || gap.status!=="active" || +gap.dueAt>Date.now()});
    const [a]=await tx.update(s.vocabularyReviewAttempts).set({runItemId:item.id}).where(and(eq(s.vocabularyReviewAttempts.userId,userId),eq(s.vocabularyReviewAttempts.requestKey,item.id))).returning();
    return {id:a.id,type:"vocabulary_review"};
  }
  throw new Error("SNAPSHOT_UNAVAILABLE");
}

export async function runCommand(userId:string,raw:PracticeCommand){
  const input=commandSchema.parse(raw); const digest=hash(input);
  return db.transaction(async tx=>{
    await lockReviewOwner(tx,userId);
    const [receipt]=await tx.select().from(s.practiceRequests).where(and(eq(s.practiceRequests.userId,userId),eq(s.practiceRequests.requestKey,input.requestKey)));
    if(receipt){if(receipt.requestHash!==digest)throw new Error("REQUEST_CONFLICT");return readRun(tx,userId,receipt.runId);}
    enabled();
    const [run]=await tx.select().from(s.practiceRuns).where(and(eq(s.practiceRuns.userId,userId),eq(s.practiceRuns.id,input.runId))).for("update");
    if(!run)throw new Error("NOT_FOUND");
    if(run.revision!==input.revision)throw new Error("REVISION_CONFLICT");
    if(run.state==="completed" || run.state==="cancelled")throw new Error("RUN_CLOSED");
    let state:typeof s.practiceRuns.$inferSelect.state=run.state; let completedAt:Date|null=null;
    if(input.command==="pause")state="paused";
    else if(input.command==="cancel")state="cancelled";
    else if(input.command==="resume"){
      if(run.state!=="paused")throw new Error("INVALID_STATE"); state="active";
    } else {
      if(run.state!=="active")throw new Error("RUN_PAUSED");
      if(!input.itemId)throw new Error("VALIDATION");
      const [item]=await tx.select().from(s.practiceRunItems).where(and(eq(s.practiceRunItems.userId,userId),eq(s.practiceRunItems.runId,run.id),eq(s.practiceRunItems.id,input.itemId))).for("update");
      if(!item)throw new Error("NOT_FOUND");
      if(item.state==="saved")throw new Error("ALREADY_ANSWERED");
      if(!item.reviewItemId || !item.snapshot)throw new Error("SNAPSHOT_UNAVAILABLE");
      await expiredPauses(tx,userId,new Date());
      const current=await syncReviewTarget(tx,userId,item.snapshot.source,item.snapshot.key);
      if(!current || current.id!==item.reviewItemId || current.management!=="active" || current.availability!=="ready" || current.contentHash!==item.snapshot.contentHash){
        await tx.update(s.practiceRunItems).set({state:"blocked"}).where(eq(s.practiceRunItems.id,item.id));
        await tx.update(s.practiceRuns).set({state:"paused",revision:run.revision+1}).where(eq(s.practiceRuns.id,run.id));
        return readRun(tx,userId,run.id);
      }
      if(input.command==="draft"){
        if(input.answer===undefined || input.draftRevision!==item.draftRevision)throw new Error("REVISION_CONFLICT");
        await tx.update(s.practiceRunItems).set({draft:input.answer,draftRevision:item.draftRevision+1,state:"pending"}).where(eq(s.practiceRunItems.id,item.id));
      } else if(input.command==="reveal"){
        const now=new Date();
        await tx.update(s.practiceRunItems).set({revealedAt:item.revealedAt ?? now}).where(eq(s.practiceRunItems.id,item.id));
        await tx.insert(s.reviewChanges).values({userId,itemId:current.id,command:"reveal",requestKey:input.requestKey,requestHash:digest,revision:current.revision+1,createdAt:now});
        await tx.update(s.reviewItems).set({revision:current.revision+1}).where(eq(s.reviewItems.id,current.id));
      } else {
        const correct=grade(item.snapshot,input.answer); const uncertain=input.uncertain===true;
        const attempt=await writeAnswer(tx,userId,item,input.answer!,correct,uncertain,digest);
        await syncReviewTarget(tx,userId,item.snapshot.source,item.snapshot.key,{attemptId:attempt.id,independent:true,revealedAt:item.revealedAt});
        const now=new Date();
        await tx.update(s.practiceRunItems).set({state:"saved",draft:input.answer,attemptId:attempt.id,attemptType:attempt.type,correct,uncertain,submittedAt:now}).where(eq(s.practiceRunItems.id,item.id));
        // Feedback is displayed on save; this exposure affects later recall, not this response.
        await tx.insert(s.reviewChanges).values({userId,itemId:current.id,command:"reveal",requestKey:input.requestKey,requestHash:digest,revision:current.revision+1,createdAt:now});
        const pending=await tx.select({state:s.practiceRunItems.state}).from(s.practiceRunItems).where(eq(s.practiceRunItems.runId,run.id));
        if(pending.every(i=>i.state==="saved")){state="completed";completedAt=now;}
      }
    }
    await tx.update(s.practiceRuns).set({state,completedAt,revision:run.revision+1}).where(eq(s.practiceRuns.id,run.id));
    await tx.insert(s.practiceRequests).values({userId,runId:run.id,itemId:input.itemId,requestKey:input.requestKey,requestHash:digest,command:input.command,revision:run.revision+1});
    return readRun(tx,userId,run.id);
  });
}
