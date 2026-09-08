"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { readingSessions, documents } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

export async function createReadingSession(documentId: string): Promise<string> {
  const user = await requireUser();
  const doc = await db
    .select({ title: documents.title })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!doc) throw new Error("Document not found");

  const id = randomUUID();
  await db.insert(readingSessions).values({
    id,
    userId: user.id,
    documentId,
    documentTitleSnapshot: doc?.title ?? null,
  });
  return id;
}

export async function updateSessionDuration(
  sessionId: string,
  durationSeconds: number,
): Promise<void> {
  const user = await requireUser();
  await db
    .update(readingSessions)
    .set({ durationSeconds, endedAt: new Date() })
    .where(and(eq(readingSessions.id, sessionId), eq(readingSessions.userId, user.id)));
}

export async function updateReadingProgress(
  documentId: string,
  progress: number,
): Promise<void> {
  const user = await requireUser();
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));
  await db
    .update(documents)
    .set({ readingProgress: clamped })
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)));
}
