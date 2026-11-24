import "server-only";
import { and, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcfNoteReviews, tcfNotes } from "@/lib/db/schema";
import { formatNotebookContext } from "../tutor/context";
import { notebookCounts, rankNotesForQuestion, type NoteLine } from "./rules";

const ACCURACY_WINDOW_DAYS = 30;
/** Enough to count a notebook for the tutor's overview without loading it all. */
const OVERVIEW_NOTES = 500;

/** Active and mastered cards, newest first. */
export async function listNoteLines(userId: string, limit: number): Promise<NoteLine[]> {
  return db
    .select({
      id: tcfNotes.id,
      kind: tcfNotes.kind,
      point: tcfNotes.point,
      lemma: tcfNotes.lemma,
      comprehensionTag: tcfNotes.comprehensionTag,
      sourceLocator: tcfNotes.sourceLocator,
      createdAt: tcfNotes.createdAt,
      status: tcfNotes.status,
    })
    .from(tcfNotes)
    .where(and(eq(tcfNotes.userId, userId), inArray(tcfNotes.status, ["active", "mastered"])))
    .orderBy(desc(tcfNotes.createdAt))
    .limit(limit);
}

/** Correct / total note reviews over the last 30 days; null when there are none. */
async function recentAccuracy(userId: string): Promise<{ correct: number; total: number } | null> {
  const since = new Date(Date.now() - ACCURACY_WINDOW_DAYS * 86_400_000);
  const [row] = await db
    .select({
      total: count(),
      correct: sql<number>`count(*) filter (where ${tcfNoteReviews.correct})`.mapWith(Number),
    })
    .from(tcfNoteReviews)
    .where(and(eq(tcfNoteReviews.userId, userId), gte(tcfNoteReviews.createdAt, since)));
  return row && row.total > 0 ? { correct: row.correct, total: row.total } : null;
}

export async function loadNotebookContext(
  userId: string,
  q: { skill: "listening" | "reading"; skillTags: string[] | null },
): Promise<string> {
  const [notes, accuracy] = await Promise.all([listNoteLines(userId, OVERVIEW_NOTES), recentAccuracy(userId)]);
  return formatNotebookContext({ notes: rankNotesForQuestion(notes, q, 8), counts: notebookCounts(notes.filter((n) => n.status === "active")), accuracy });
}

/** Active non-vocabulary cards whose review is due. */
export async function countDueNotes(userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tcfNotes)
    .where(and(eq(tcfNotes.userId, userId), eq(tcfNotes.status, "active"), ne(tcfNotes.kind, "vocabulary"), lte(tcfNotes.dueAt, now)));
  return row?.n ?? 0;
}

/** Active non-vocabulary cards. */
export async function countActiveNotes(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tcfNotes)
    .where(and(eq(tcfNotes.userId, userId), eq(tcfNotes.status, "active"), ne(tcfNotes.kind, "vocabulary")));
  return row?.n ?? 0;
}
