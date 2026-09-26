import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingOperations } from "@/lib/db/schema";

const RESERVATION_KEYS = {
  turn: "SPEAKING_TURN_RESERVE_CENTS",
  assessment: "SPEAKING_ASSESSMENT_RESERVE_CENTS",
  follow_up: "SPEAKING_FOLLOWUP_RESERVE_CENTS",
} as const;

function reservationCents(kind: keyof typeof RESERVATION_KEYS) {
  const amount = Number(process.env[RESERVATION_KEYS[kind]]);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100) throw new Error("Speaking pilot reservation prices are not configured");
  return amount;
}

export function simulationEnabled() {
  if (process.env.SPEAKING_SIMULATION_ENABLED !== "true" || !process.env.OPENAI_API_KEY ||
    !process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) return false;
  if (process.env.NODE_ENV === "production" && (!process.env.CLOUDFLARE_R2_BUCKET ||
    !process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
    !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY)) return false;
  return Object.values(RESERVATION_KEYS).every((key) => {
    const amount = Number(process.env[key]);
    return Number.isSafeInteger(amount) && amount > 0 && amount <= 100;
  });
}

/** Reservations are conservatively charged; an unknown provider outcome remains charged. */
export async function reserveOperation(
  userId: string,
  sessionId: string,
  kind: keyof typeof RESERVATION_KEYS,
  requestKey: string,
  requestHash?: string,
) {
  if (!simulationEnabled()) throw new Error("Speaking simulation is disabled");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(987654321::bigint)`);
    const [existing] = await tx.select().from(speakingOperations).where(and(
      eq(speakingOperations.sessionId, sessionId),
      eq(speakingOperations.kind, kind),
      eq(speakingOperations.requestKey, requestKey),
      eq(speakingOperations.userId, userId),
    )).limit(1);
    if (existing) {
      if (existing.requestHash !== (requestHash ?? null)) throw new Error("Request key was reused with different input");
      return { operation: existing, replay: true };
    }
    const [kindTotal] = await tx.select({ count: sql<number>`count(*)::int` }).from(speakingOperations).where(and(
      eq(speakingOperations.sessionId, sessionId), eq(speakingOperations.kind, kind),
    ));
    if (kindTotal.count >= (kind === "turn" ? 24 : 3)) {
      throw new Error("Speaking operation limit reached");
    }

    const [busy] = await tx.select({ id: speakingOperations.id }).from(speakingOperations).where(and(
      eq(speakingOperations.sessionId, sessionId),
      eq(speakingOperations.status, "reserved"),
      gte(speakingOperations.leaseExpiresAt, new Date()),
    )).limit(1);
    if (busy) throw new Error("Another speaking operation is in progress");
    const [inFlight] = await tx.select({ count: sql<number>`count(*)::int` }).from(speakingOperations).where(and(
      eq(speakingOperations.status, "reserved"), gte(speakingOperations.leaseExpiresAt, new Date()),
    ));
    if (inFlight.count >= 2) throw new Error("Speaking pilot is at capacity");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totals = await tx.select({
      session: sql<number>`coalesce(sum(case when ${speakingOperations.sessionId} = ${sessionId} then ${speakingOperations.reservedCents} else 0 end), 0)::int`,
      owner: sql<number>`coalesce(sum(case when ${speakingOperations.userId} = ${userId} and ${speakingOperations.createdAt} >= ${today} then ${speakingOperations.reservedCents} else 0 end), 0)::int`,
      global: sql<number>`coalesce(sum(${speakingOperations.reservedCents}), 0)::int`,
    }).from(speakingOperations);
    const amount = reservationCents(kind);
    if (totals[0].session + amount > 100 || totals[0].owner + amount > 500 || totals[0].global + amount > 2500) {
      throw new Error("Speaking pilot budget exhausted");
    }
    const [operation] = await tx.insert(speakingOperations).values({
      userId, sessionId, kind, requestKey, requestHash: requestHash ?? null, reservedCents: amount,
      leaseExpiresAt: new Date(Date.now() + 90_000),
    }).returning();
    return { operation, replay: false };
  });
}

export async function settleOperation(id: string, status: "done" | "uncertain", usage?: {
  audioSeconds?: number; chatInputTokens?: number; chatOutputTokens?: number; speechCharacters?: number; latencyMs?: number;
}) {
  await db.update(speakingOperations).set({ status, usage: usage ?? null }).where(eq(speakingOperations.id, id));
}
