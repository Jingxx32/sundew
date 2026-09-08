"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOpenAI, MODELS } from "@/lib/ai/client";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import type { CefrLevel } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/cefr";
import { requireAdmin, requireUser } from "@/lib/auth/session";

export type ApiKeyStatus =
  | { ok: true; maskedKey: string; models: typeof MODELS }
  | { ok: false; error: string };

export async function testApiKey(): Promise<ApiKeyStatus> {
  await requireAdmin();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, error: "OPENAI_API_KEY is not set in your .env file." };
  }

  try {
    await getOpenAI().models.list();
    const maskedKey = key.slice(0, 7) + "·".repeat(16) + key.slice(-4);
    return { ok: true, maskedKey, models: MODELS };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  getCefrLevel / setCefrLevel                                        */
/* ------------------------------------------------------------------ */

export async function getCefrLevel(): Promise<CefrLevel | null> {
  const user = await requireUser();
  const row = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, "cefr_level")))
    .limit(1)
    .then((r) => r[0] ?? null);
  const val = row?.value;
  return CEFR_LEVELS.includes(val as CefrLevel) ? (val as CefrLevel) : null;
}

export async function setCefrLevel(level: CefrLevel): Promise<void> {
  const user = await requireUser();
  await db
    .insert(userSettings)
    .values({ userId: user.id, key: "cefr_level", value: level })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: level, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}

/* ------------------------------------------------------------------ */
/*  getSpeakingProfile / setSpeakingProfile                            */
/* ------------------------------------------------------------------ */

export async function getSpeakingProfile(): Promise<string> {
  const user = await requireUser();
  const row = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, "speaking_profile")))
    .limit(1)
    .then((r) => r[0] ?? null);
  return row?.value ?? "";
}

export async function setSpeakingProfile(text: string): Promise<void> {
  const user = await requireUser();
  await db
    .insert(userSettings)
    .values({ userId: user.id, key: "speaking_profile", value: text })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: text, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}

/* ------------------------------------------------------------------ */
/*  getStudyGoal / setStudyGoal — the anchor for Readiness & /today    */
/* ------------------------------------------------------------------ */

export type StudyGoal = {
  /** Target CLB/NCLC level, 4–10. null = not set. */
  targetClb: number | null;
  /** Exam date as YYYY-MM-DD. null = long-term prep, no date yet. */
  examDate: string | null;
};

const EXAM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getStudyGoal(): Promise<StudyGoal> {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, user.id), inArray(userSettings.key, ["target_clb", "exam_date"])));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const clb = Number(map.get("target_clb"));
  const date = map.get("exam_date") ?? "";
  return {
    targetClb: Number.isInteger(clb) && clb >= 4 && clb <= 10 ? clb : null,
    examDate: EXAM_DATE_RE.test(date) ? date : null,
  };
}

export async function setStudyGoal(goal: StudyGoal): Promise<void> {
  const user = await requireUser();
  const clb =
    goal.targetClb !== null && Number.isInteger(goal.targetClb) && goal.targetClb >= 4 && goal.targetClb <= 10
      ? String(goal.targetClb)
      : "";
  const date = goal.examDate && EXAM_DATE_RE.test(goal.examDate) ? goal.examDate : "";
  for (const [key, value] of [
    ["target_clb", clb],
    ["exam_date", date],
  ] as const) {
    await db
      .insert(userSettings)
      .values({ userId: user.id, key, value })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.key],
        set: { value, updatedAt: new Date() },
      });
  }
  revalidatePath("/settings");
  revalidatePath("/progress");
}
