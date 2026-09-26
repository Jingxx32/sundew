import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reviewChanges, reviewEvidence, reviewItems, type ReviewItem } from "@/lib/db/schema";
import { availability, deriveReviewState, managementTransition, vocabularyState, type ReviewCommand, type ReviewSource } from "./state";
import { expiredPauses, hash, lockReviewOwner, resolveSource, type ReviewDb } from "./adapters";

export type LiveEvidence = { attemptId: string; independent?: boolean; revealedAt?: Date | null; permitted?: boolean };
export async function syncReviewTarget(tx: ReviewDb, userId: string, source: ReviewSource, key: string, live?: LiveEvidence, manual = false) {
  await lockReviewOwner(tx,userId);
  // Also protects target creation.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId + ":" + source + ":" + key}, 0))`);
  let [item] = await tx.select().from(reviewItems).where(and(eq(reviewItems.userId,userId),eq(reviewItems.source,source),eq(reviewItems.sourceKey,key))).for("update");
  const resolved = await resolveSource(tx,userId,source,key);
  if (!resolved) {
    if (item) await tx.delete(reviewItems).where(eq(reviewItems.id,item.id));
    return null;
  }
  const { snapshot, history, gap } = resolved;
  if (!item && !manual && !gap && !history.some(h => h.correct === false || h.uncertain)) return null;
  if (!item) {
    const dates = history.map(h => +h.at);
    const first = dates.length ? new Date(Math.min(...dates)) : new Date();
    [item] = await tx.insert(reviewItems).values({ userId, source, sourceKey: key, title: snapshot.title, skill: snapshot.skill, href: snapshot.href,
      contentHash: snapshot.contentHash, firstObservedAt: first, lastObservedAt: first,
      management: gap?.status === "dismissed" ? "archived" : "active",
      tcfQuestionId: source === "tcf" ? key : null, quizQuestionId: source === "quiz" ? key : null,
      errorId: source === "writing" ? key : null, gapId: source === "vocabulary" ? key : null,
    }).returning();
  }
  const prior = await tx.select().from(reviewEvidence).where(and(eq(reviewEvidence.userId,userId),eq(reviewEvidence.itemId,item.id)));
  const priorById = new Map(prior.map(e => [`${e.attemptType}:${e.attemptId}`,e]));
  const currentIds = new Set(history.map(h => `${h.attemptType}:${h.id}`));
  for (const old of prior) if (!currentIds.has(`${old.attemptType}:${old.attemptId}`)) await tx.delete(reviewEvidence).where(eq(reviewEvidence.id,old.id));
  for (const event of history) {
    const old = priorById.get(`${event.attemptType}:${event.id}`);
    const isLive = event.id === live?.attemptId;
    const provenance = old?.provenance ?? snapshot.contentHash;
    const valid = event.valid && provenance === snapshot.contentHash;
    await tx.insert(reviewEvidence).values({ userId, itemId: item.id, attemptId: event.id, attemptType: event.attemptType,
      answeredAt: event.at, correct: event.correct, uncertain: event.uncertain, valid, provenance,
      independent: old?.independent ?? (isLive && live?.independent === true), revealedAt: old?.revealedAt ?? (isLive ? live?.revealedAt : null),
      permitted: old?.permitted ?? (isLive ? live?.permitted ?? (item.management === "active" && !item.disputedAt) : true),
    }).onConflictDoUpdate({ target: [reviewEvidence.userId,reviewEvidence.itemId,reviewEvidence.attemptType,reviewEvidence.attemptId],
      set: { correct: event.correct, uncertain: event.uncertain, valid } });
  }
  const evidence = await tx.select().from(reviewEvidence).where(eq(reviewEvidence.itemId,item.id));
  const reveals = await tx.select({ at: reviewChanges.createdAt }).from(reviewChanges).where(and(eq(reviewChanges.itemId,item.id),eq(reviewChanges.command,"reveal")));
  const derived = gap ? vocabularyState(gap) : deriveReviewState(item.firstObservedAt,evidence.map(e => ({ ...e, id: `${e.attemptType}:${e.attemptId}`, at: e.answeredAt })),reveals.map(r=>r.at));
  const updates = { learningState: derived.learningState, dueAt: derived.dueAt, eligibleAfter: derived.eligibleAfter, successCount: derived.successCount,
    title: snapshot.title, skill: snapshot.skill, href: snapshot.href, contentHash: snapshot.contentHash,
    availability: availability([resolved.available,...(item.disputedAt ? ["disputed" as const] : [])]),
    lastObservedAt: history.length ? new Date(Math.max(...history.map(h=>+h.at))) : item.lastObservedAt };
  const before = Object.fromEntries(Object.keys(updates).map(k => [k,item[k as keyof ReviewItem]]));
  if (hash(before) !== hash(updates)) [item] = await tx.update(reviewItems).set({ ...updates, revision: item.revision+1 }).where(eq(reviewItems.id,item.id)).returning();
  return item;
}

export function assertRequestKey(key: string) {
  if (typeof key !== "string" || !/^[a-zA-Z0-9-]{12,100}$/.test(key)) throw new Error("VALIDATION");
}
export async function changeReviewItem(userId: string, input: { id: string; command: ReviewCommand; revision: number; requestKey: string; value?: string }) {
  assertRequestKey(input.requestKey);
  if (!["pause","resume","archive","restore","note","dispute","clear_dispute","reveal"].includes(input.command) || !Number.isInteger(input.revision) || (input.value!==undefined && typeof input.value!=="string")) throw new Error("VALIDATION");
  const requestHash = hash(input);
  return db.transaction(async tx => {
    await lockReviewOwner(tx,userId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId+":command:"+input.requestKey},0))`);
    const [receipt] = await tx.select().from(reviewChanges).where(and(eq(reviewChanges.userId,userId),eq(reviewChanges.requestKey,input.requestKey)));
    if (receipt) { if (receipt.requestHash !== requestHash) throw new Error("REQUEST_CONFLICT"); return { id: receipt.itemId, revision: receipt.revision }; }
    const [item] = await tx.select().from(reviewItems).where(and(eq(reviewItems.userId,userId),eq(reviewItems.id,input.id))).for("update");
    if (!item) throw new Error("NOT_FOUND");
    if (item.revision !== input.revision) throw new Error("REVISION_CONFLICT");
    const patch: Partial<typeof reviewItems.$inferInsert> = { management: managementTransition(item.management,input.command), revision: item.revision+1 };
    const now = new Date();
    if (input.command === "pause") {
      const until = input.value ? new Date(input.value) : null;
      if (until && (!Number.isFinite(+until) || +until <= +now)) throw new Error("VALIDATION");
      patch.pauseUntil = until;
    }
    if (["resume","archive","restore"].includes(input.command)) patch.pauseUntil = null;
    if (input.command === "note") { if ((input.value?.length ?? 0)>2000) throw new Error("VALIDATION"); patch.note = input.value ?? ""; }
    if (input.command === "dispute") {
      if (!input.value?.trim() || input.value.length>1000) throw new Error("VALIDATION");
      patch.disputedAt = now; patch.disputeReason = input.value; patch.availability = "disputed";
    }
    if (input.command === "clear_dispute") {
      patch.disputedAt = null; patch.disputeReason = null;
      patch.availability = (await resolveSource(tx,userId,item.source,item.sourceKey))?.available ?? "source_missing";
    }
    await tx.update(reviewItems).set(patch).where(eq(reviewItems.id,item.id));
    await tx.insert(reviewChanges).values({ userId,itemId:item.id,command:input.command,requestKey:input.requestKey,requestHash,revision:item.revision+1,createdAt:now });
    return { id:item.id,revision:item.revision+1 };
  });
}

export type ReviewFilters = { source?: string; skill?: string; view?: string; search?: string; cursor?: string; limit?: number };
export async function listReviewItems(userId: string, input: ReviewFilters = {}) {
  if (input.limit!==undefined && !Number.isInteger(input.limit)) throw new Error("VALIDATION");
  const limit = Math.max(1,Math.min(100,input.limit ?? 20));
  const search = (input.search ?? "").normalize("NFC").trim();
  if (search.length>200) throw new Error("VALIDATION");
  const view = ["all","stable","archived"].includes(input.view ?? "") ? input.view! : "due";
  const fingerprint = hash({ source:input.source ?? "",skill:input.skill ?? "",view,search });
  let cursor: {at:string;id:string}|null = null;
  if (input.cursor) {
    try { const c = JSON.parse(Buffer.from(input.cursor,"base64url").toString());
      if (c.fingerprint!==fingerprint || typeof c.id!=="string" || !/^[0-9a-f-]{36}$/i.test(c.id) || typeof c.at!=="string" || !Number.isFinite(+new Date(c.at))) throw new Error(); cursor={id:c.id,at:c.at};
    } catch { throw new Error("VALIDATION"); }
  }
  return db.transaction(async tx => {
    await lockReviewOwner(tx,userId);
    const now = new Date(); await expiredPauses(tx,userId,now);
    const clauses = [sql`${reviewItems.userId}=${userId}`];
    clauses.push(view === "archived" ? sql`${reviewItems.management}='archived'` : sql`${reviewItems.management}<>'archived'`);
    if (view === "due") clauses.push(sql`${reviewItems.management}='active' and ${reviewItems.availability}='ready' and ${reviewItems.dueAt}<=${now}`);
    if (view === "stable") clauses.push(sql`${reviewItems.learningState}='stable'`);
    if (input.source) clauses.push(sql`${reviewItems.source}::text=${input.source}`);
    if (input.skill) clauses.push(sql`${reviewItems.skill}=${input.skill}`);
    if (search) { const pattern = `%${search.replace(/[\\%_]/g,"\\$&")}%`; clauses.push(sql`(${reviewItems.title} ilike ${pattern} or ${reviewItems.note} ilike ${pattern})`); }
    const where = sql.join(clauses,sql` and `);
    const count = await tx.select({ value:sql<number>`count(*)::int` }).from(reviewItems).where(where);
    const sortTime = view==="due" ? sql`date_trunc('milliseconds',${reviewItems.dueAt})` : sql`date_trunc('milliseconds',${reviewItems.lastObservedAt})`;
    const pageWhere = cursor ? sql`${where} and (${sortTime} ${view==="due" ? sql`>`:sql`<`} ${new Date(cursor.at)} or (${sortTime}=${new Date(cursor.at)} and ${reviewItems.id}>${cursor.id}))` : where;
    const rows = await tx.select().from(reviewItems).where(pageWhere).orderBy(view==="due" ? sql`${sortTime} asc`:sql`${sortTime} desc`,asc(reviewItems.id)).limit(limit+1);
    const items=rows.slice(0,limit); const last=items.at(-1);
    return { items, count:count[0].value, nextCursor: rows.length>limit && last ? Buffer.from(JSON.stringify({at:(view==="due" ? last.dueAt!:last.lastObservedAt).toISOString(),id:last.id,fingerprint})).toString("base64url") : null };
  }, { isolationLevel:"repeatable read" });
}
