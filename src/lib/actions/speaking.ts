"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  speakingPrompts,
  speakingScripts,
  speakingSessions,
  speakingTurns,
  type SessionScores,
  type SpeakingPrompt,
  type SpeakingScript,
  type SpeakingTurn,
} from "@/lib/db/schema";
import { generateSpeakingScript } from "@/lib/ai/speaking-script";
import { getSpeakingProfile } from "./settings";
import { requireUser } from "@/lib/auth/session";

export type PromptWithStats = SpeakingPrompt & {
  sessionCount: number;
  bestScore: number | null;
};

export async function listPromptsWithStats(): Promise<PromptWithStats[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      prompt: speakingPrompts,
      sessionCount: sql<number>`count(${speakingSessions.id})::int`,
      bestScore: sql<number | null>`max((${speakingSessions.scores}->>'overall')::numeric)::int`,
    })
    .from(speakingPrompts)
    .leftJoin(
      speakingSessions,
      sql`${speakingSessions.promptId} = ${speakingPrompts.id} and ${speakingSessions.status} = 'completed' and ${speakingSessions.userId} = ${user.id}`,
    )
    .groupBy(speakingPrompts.id)
    .orderBy(speakingPrompts.task, speakingPrompts.createdAt);

  return rows.map((r) => ({ ...r.prompt, sessionCount: r.sessionCount, bestScore: r.bestScore }));
}

export async function getPromptWithScript(
  promptId: string,
): Promise<{ prompt: SpeakingPrompt; script: SpeakingScript | null }> {
  const user = await requireUser();
  const prompt = await db
    .select()
    .from(speakingPrompts)
    .where(eq(speakingPrompts.id, promptId))
    .limit(1)
    .then((r) => r[0]);
  if (!prompt) throw new Error(`Speaking prompt not found: ${promptId}`);

  const script = await db
    .select()
    .from(speakingScripts)
    .where(and(eq(speakingScripts.promptId, promptId), eq(speakingScripts.userId, user.id)))
    .orderBy(desc(speakingScripts.createdAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  return { prompt, script };
}

export async function generateScript(promptId: string): Promise<SpeakingScript> {
  const user = await requireUser();
  const { prompt } = await getPromptWithScript(promptId);
  const profile = await getSpeakingProfile();
  const content = await generateSpeakingScript(prompt, profile);

  const [script] = await db
    .insert(speakingScripts)
    .values({ userId: user.id, promptId, content, profileSnapshot: profile || null })
    .returning();

  revalidatePath(`/speaking/${promptId}/script`);
  return script;
}

export async function updateScript(scriptId: string, content: string): Promise<void> {
  const user = await requireUser();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Script content cannot be empty");
  const [row] = await db
    .update(speakingScripts)
    .set({ content: trimmed })
    .where(and(eq(speakingScripts.id, scriptId), eq(speakingScripts.userId, user.id)))
    .returning({ promptId: speakingScripts.promptId });
  if (row) revalidatePath(`/speaking/${row.promptId}/script`);
}

export async function startScriptSession(promptId: string): Promise<string> {
  const user = await requireUser();
  const [session] = await db
    .insert(speakingSessions)
    .values({ userId: user.id, promptId, mode: "script_practice" })
    .returning({ id: speakingSessions.id });
  return session.id;
}

export async function finishScriptSession(sessionId: string): Promise<SessionScores> {
  const user = await requireUser();
  const turns = await db
    .select()
    .from(speakingTurns)
    .where(
      and(
        eq(speakingTurns.sessionId, sessionId),
        eq(speakingTurns.userId, user.id),
        eq(speakingTurns.role, "user"),
      ),
    )
    .orderBy(speakingTurns.orderIndex, desc(speakingTurns.createdAt));

  // Keep only the latest attempt per sentence (orderIndex)
  const latest = new Map<number, SpeakingTurn>();
  for (const t of turns) {
    if (!latest.has(t.orderIndex)) latest.set(t.orderIndex, t);
  }
  const assessed = [...latest.values()].filter((t) => t.assessment);
  if (assessed.length === 0) throw new Error("No assessed turns in session");

  const avg = (pick: (t: SpeakingTurn) => number) =>
    Math.round(assessed.reduce((sum, t) => sum + pick(t), 0) / assessed.length);

  const scores: SessionScores = {
    accuracy: avg((t) => t.assessment!.accuracyScore),
    fluency: avg((t) => t.assessment!.fluencyScore),
    completeness: avg((t) => t.assessment!.completenessScore),
    overall: avg((t) => t.assessment!.pronunciationScore),
  };

  const [row] = await db
    .update(speakingSessions)
    .set({ status: "completed", scores, completedAt: new Date() })
    .where(and(eq(speakingSessions.id, sessionId), eq(speakingSessions.userId, user.id)))
    .returning({ promptId: speakingSessions.promptId });

  revalidatePath("/speaking");
  if (row) revalidatePath(`/speaking/${row.promptId}/script`);
  return scores;
}
