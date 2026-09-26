import { and, eq, sql } from "drizzle-orm";
import { reviewBackfillJobs } from "@/lib/db/schema";
import { hash, conjugationKey, lockReviewOwner, type ReviewDb } from "./adapters";
import { syncReviewTarget } from "./service";
import { REVIEW_POLICY_VERSION, SOURCES, type ReviewSource } from "./state";

/** Canonical target-key cursor, stable across retries; old Quiz totals never enter it. */
export async function sourceKeys(tx: ReviewDb, owner: string, source: ReviewSource, cursor: string, cutoff: Date, limit = 200) {
  const query = source === "tcf" ? sql`select distinct question_id::text as key from tcf_question_attempts where user_id=${owner} and answered_at<=${cutoff}` :
    source === "quiz" ? sql`select distinct question_id as key from quiz_question_attempts where user_id=${owner} and answered_at<=${cutoff}` :
    source === "writing" ? sql`select id as key from errors where user_id=${owner} and created_at<=${cutoff}` :
    source === "vocabulary" ? sql`select id::text as key from vocabulary_gaps where user_id=${owner} and created_at<=${cutoff}` :
    sql`select distinct json_build_array(lower(trim(verb)),tense,person)::text as key from conjugation_attempts where user_id=${owner} and answered_at<=${cutoff}`;
  const rows = await tx.execute<{ key:string }>(sql`select key from (${query}) candidates where key collate "C">${cursor} collate "C" order by key collate "C" limit ${limit}`);
  return rows.map(r=>r.key);
}

export async function createBackfillJob(tx: ReviewDb, userId: string, source: ReviewSource) {
  if (!SOURCES.includes(source)) throw new Error("VALIDATION");
  const cutoff = new Date();
  const fingerprint = hash({ userId,source,cutoff,policy:REVIEW_POLICY_VERSION,ordering:"canonical-target-v1" });
  return (await tx.insert(reviewBackfillJobs).values({ userId,source,cutoff,fingerprint }).returning())[0];
}

export async function backfillPage(tx: ReviewDb, userId: string, jobId: string) {
  await lockReviewOwner(tx,userId);
  const [job] = await tx.select().from(reviewBackfillJobs).where(and(eq(reviewBackfillJobs.userId,userId),eq(reviewBackfillJobs.id,jobId))).for("update");
  if (!job) throw new Error("NOT_FOUND");
  if (job.fingerprint!==hash({ userId,source:job.source,cutoff:job.cutoff,policy:REVIEW_POLICY_VERSION,ordering:"canonical-target-v1" })) throw new Error("BACKFILL_VERSION_CHANGED");
  if (job.status==="completed") return job;
  const keys = await sourceKeys(tx,userId,job.source,job.cursor,job.cutoff);
  let unresolved = 0;
  for (const key of keys) {
    // PostgreSQL JSON contains whitespace; normalize before hashing a tuple identity.
    const normalized = job.source==="conjugation" ? conjugationKey(...JSON.parse(key) as [string,string,number]) : key;
    if (!(await syncReviewTarget(tx,userId,job.source,normalized))) unresolved++;
  }
  return (await tx.update(reviewBackfillJobs).set({ cursor:keys.at(-1) ?? job.cursor, processed:job.processed+keys.length,
    unresolved:job.unresolved+unresolved,status:keys.length<200 ? "completed":"running",updatedAt:new Date() }).where(eq(reviewBackfillJobs.id,jobId)).returning())[0];
}
