"use server";

import { and, asc, desc, eq, inArray, lt, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  tcfNoteReviews,
  tcfNotes,
  tcfQuestions,
  tcfSets,
  tcfTutorMessages,
  vocabularyGaps,
  type TcfGeneratedReviewItem,
  type TcfNoteKind,
} from "@/lib/db/schema";
import { AuthenticationError } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";
import { canUse } from "@/lib/access/features";
import { requireUser } from "@/lib/auth/session";
import { assertAiBudget } from "@/lib/access/ai-guard";
import { generateReviewItems, proposeCard } from "@/lib/ai/tutor";
import { leitnerAfter } from "@/lib/vocabulary/leitner";
import { resolveLookupForUser } from "@/lib/vocabulary/resolve-lookup";
import { upsertGap } from "@/lib/vocabulary/gaps";
import { explanationLocatorLabel } from "@/lib/tcf/parse-explanation";
import { findVocabularyDuplicate } from "@/lib/tcf/notebook/rules";
import { countDueNotes, listNoteLines } from "@/lib/tcf/notebook/queries";
import {
  CardDraftSchema,
  normalizeProposal,
  validateReviewItem,
  type CardDraft,
  type CardProposalResult,
} from "@/lib/tcf/tutor/schemas";

export type TutorThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  note: { point: string } | null;
};

const NOTEBOOK_REVIEW_LIMIT = 15;

export type NotebookReviewCard = {
  noteId: string;
  kind: Exclude<TcfNoteKind, "vocabulary">;
  point: string;
  front: string;
  back: string;
  box: number;
  sourceQuestionId: string | null;
  sourceLocator: string | null;
};

const LETTERS = ["A", "B", "C", "D"];

/** Short prompt context: the question, its options and the correct letter. No passage or transcript. */
function summarizeQuestion(q: { questionText: string; options: string[]; answer: number }): string {
  const options = q.options.map((o, i) => `${LETTERS[i] ?? i + 1}. ${o}`).join("\n");
  return `${q.questionText}\n${options}\nCorrect: ${LETTERS[q.answer] ?? q.answer + 1}`;
}

/** The user's own assistant message; anything else is "not found". */
async function loadOwnedAssistantMessage(userId: string, messageId: string) {
  const [message] = await db
    .select()
    .from(tcfTutorMessages)
    .where(
      and(
        eq(tcfTutorMessages.id, messageId),
        eq(tcfTutorMessages.userId, userId),
        eq(tcfTutorMessages.role, "assistant"),
      ),
    )
    .limit(1);
  if (!message) throw new Error("Tutor message not found");
  return message;
}

/** A vocabulary note is scheduled through its gap; its own status still drives duplicate detection. */
async function activateNote(userId: string, noteId: string): Promise<void> {
  await db
    .update(tcfNotes)
    .set({ status: "active" })
    .where(and(eq(tcfNotes.id, noteId), eq(tcfNotes.userId, userId)));
}

export async function getTutorThread(questionId: string): Promise<TutorThreadMessage[]> {
  const user = await requireFeature("tcf");
  const rows = await db
    .select({
      id: tcfTutorMessages.id,
      role: tcfTutorMessages.role,
      content: tcfTutorMessages.content,
      notePoint: tcfNotes.point,
    })
    .from(tcfTutorMessages)
    .leftJoin(
      tcfNotes,
      and(eq(tcfNotes.sourceMessageId, tcfTutorMessages.id), eq(tcfNotes.userId, user.id)),
    )
    .where(and(eq(tcfTutorMessages.userId, user.id), eq(tcfTutorMessages.questionId, questionId)))
    .orderBy(asc(tcfTutorMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    note: r.notePoint === null ? null : { point: r.notePoint },
  }));
}

export async function proposeTutorCard(messageId: string): Promise<CardProposalResult> {
  const user = await requireFeature("tcf");
  await assertAiBudget("lookup");
  const answer = await loadOwnedAssistantMessage(user.id, messageId);

  const [ask] = await db
    .select({ content: tcfTutorMessages.content })
    .from(tcfTutorMessages)
    .where(
      and(
        eq(tcfTutorMessages.userId, user.id),
        eq(tcfTutorMessages.questionId, answer.questionId),
        eq(tcfTutorMessages.role, "user"),
        lt(tcfTutorMessages.createdAt, answer.createdAt),
      ),
    )
    .orderBy(desc(tcfTutorMessages.createdAt))
    .limit(1);
  const [question] = await db
    .select({ questionText: tcfQuestions.questionText, options: tcfQuestions.options, answer: tcfQuestions.answer })
    .from(tcfQuestions)
    .where(eq(tcfQuestions.id, answer.questionId))
    .limit(1);
  if (!ask || !question) return { type: "none" };

  const lines = await listNoteLines(user.id, 200);
  try {
    return normalizeProposal(
      await proposeCard({
        ask: ask.content,
        answer: answer.content,
        questionSummary: summarizeQuestion(question),
        existing: lines,
      }),
      lines,
    );
  } catch (err) {
    console.error("Tutor card proposal failed", err);
    return { type: "none" };
  }
}

export async function addTutorCard(messageId: string, draft: CardDraft): Promise<{ noteId: string; point: string }> {
  const card = CardDraftSchema.parse(draft);
  const user = await requireFeature("tcf");

  const bySource = () =>
    db
      .select({ id: tcfNotes.id, point: tcfNotes.point })
      .from(tcfNotes)
      .where(and(eq(tcfNotes.userId, user.id), eq(tcfNotes.sourceMessageId, messageId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  // A repeated click on the same message returns the card it already made, even with the budget spent.
  const already = await bySource();
  if (already) return { noteId: already.id, point: already.point };

  const message = await loadOwnedAssistantMessage(user.id, messageId);

  const [question] = await db
    .select({ orderIndex: tcfQuestions.orderIndex, testNumber: tcfSets.testNumber, skill: tcfSets.skill })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfSets.id, tcfQuestions.setId))
    .where(eq(tcfQuestions.id, message.questionId))
    .limit(1);
  if (!question) throw new Error("Tutor message not found");
  const sourceLocator = explanationLocatorLabel({
    skill: question.skill,
    test: question.testNumber,
    question: question.orderIndex,
  });

  let lemma: string | null = null;
  let vocabularyGapId: string | null = null;
  if (card.kind === "vocabulary") {
    const lemmaInput = card.lemma?.trim();
    if (!lemmaInput) throw new Error("A vocabulary card needs a lemma");
    const gapType = card.byEar ? "listening" : "recognition";
    await assertAiBudget("lookup");

    const lines = await listNoteLines(user.id, 200);
    const duplicate = findVocabularyDuplicate(lines, lemmaInput);
    const duplicateGap = duplicate
      ? (
          await db
            .select({ lemma: vocabularyGaps.lemma, gapType: vocabularyGaps.gapType })
            .from(vocabularyGaps)
            .innerJoin(tcfNotes, eq(tcfNotes.vocabularyGapId, vocabularyGaps.id))
            .where(and(eq(tcfNotes.id, duplicate.id), eq(tcfNotes.userId, user.id), eq(vocabularyGaps.userId, user.id)))
            .limit(1)
        )[0]
      : undefined;
    if (duplicate && duplicateGap) {
      await upsertGap({ userId: user.id, lemma: duplicateGap.lemma, gapType: duplicateGap.gapType, source: "tutor" });
      await activateNote(user.id, duplicate.id);
      revalidatePath("/today");
      revalidatePath("/review");
      return { noteId: duplicate.id, point: duplicate.point };
    }

    const outcome = await resolveLookupForUser(
      user,
      lemmaInput,
      card.sentence ?? card.front,
      { type: "tcf", tcfQuestionId: message.questionId },
      { gapType, source: "tutor" },
    );
    if (outcome.status === "locked") throw new AuthenticationError("FEATURE_LOCKED");
    lemma = outcome.lemma;
    const [gap] = await db
      .select({ id: vocabularyGaps.id })
      .from(vocabularyGaps)
      .where(
        and(
          eq(vocabularyGaps.userId, user.id),
          eq(vocabularyGaps.lemma, outcome.lemma),
          eq(vocabularyGaps.gapType, gapType),
        ),
      )
      .limit(1);
    vocabularyGapId = gap?.id ?? null;

    // The model's lemma may be an inflected form; the resolved lemma is canonical.
    const existing = duplicate ?? findVocabularyDuplicate(lines, outcome.lemma);
    if (existing) {
      await db
        .update(tcfNotes)
        .set({ vocabularyGapId, status: "active" })
        .where(and(eq(tcfNotes.id, existing.id), eq(tcfNotes.userId, user.id)));
      revalidatePath("/today");
      revalidatePath("/review");
      return { noteId: existing.id, point: existing.point };
    }
  }

  const [inserted] = await db
    .insert(tcfNotes)
    .values({
      userId: user.id,
      kind: card.kind,
      lemma,
      byEar: card.kind === "vocabulary" && card.byEar,
      vocabularyGapId,
      comprehensionTag: card.comprehensionTag,
      point: card.point,
      front: card.front,
      back: card.back,
      sourceQuestionId: message.questionId,
      sourceLocator,
      sourceMessageId: messageId,
      box: 1,
      dueAt: new Date(),
    })
    .onConflictDoNothing({ target: [tcfNotes.userId, tcfNotes.sourceMessageId] })
    .returning({ id: tcfNotes.id, point: tcfNotes.point });

  const note = inserted ?? (await bySource());
  if (!note) throw new Error("Could not save the card");
  revalidatePath("/today");
  revalidatePath("/review");
  return { noteId: note.id, point: note.point };
}

export async function reviveNote(noteId: string): Promise<void> {
  const user = await requireFeature("tcf");
  const [note] = await db
    .select({
      id: tcfNotes.id,
      kind: tcfNotes.kind,
      lemma: tcfNotes.lemma,
      byEar: tcfNotes.byEar,
      vocabularyGapId: tcfNotes.vocabularyGapId,
    })
    .from(tcfNotes)
    .where(and(eq(tcfNotes.id, noteId), eq(tcfNotes.userId, user.id)))
    .limit(1);
  if (!note) return;

  const [gap] =
    note.kind === "vocabulary" && note.vocabularyGapId
      ? await db
          .select({ lemma: vocabularyGaps.lemma, gapType: vocabularyGaps.gapType })
          .from(vocabularyGaps)
          .where(and(eq(vocabularyGaps.id, note.vocabularyGapId), eq(vocabularyGaps.userId, user.id)))
          .limit(1)
      : [];
  if (gap) {
    await upsertGap({ userId: user.id, lemma: gap.lemma, gapType: gap.gapType, source: "tutor" });
    await activateNote(user.id, note.id);
  } else if (note.kind === "vocabulary" && note.lemma) {
    // The gap was deleted or merged: recreate it and relink the note.
    const gapType = note.byEar ? "listening" : "recognition";
    await upsertGap({ userId: user.id, lemma: note.lemma, gapType, source: "tutor" });
    const [fresh] = await db
      .select({ id: vocabularyGaps.id })
      .from(vocabularyGaps)
      .where(and(eq(vocabularyGaps.userId, user.id), eq(vocabularyGaps.lemma, note.lemma), eq(vocabularyGaps.gapType, gapType)))
      .limit(1);
    await db
      .update(tcfNotes)
      .set({ vocabularyGapId: fresh?.id ?? null, status: "active" })
      .where(and(eq(tcfNotes.id, note.id), eq(tcfNotes.userId, user.id)));
  } else {
    await db
      .update(tcfNotes)
      .set({ status: "active", box: 1, dueAt: new Date() })
      .where(and(eq(tcfNotes.id, note.id), eq(tcfNotes.userId, user.id)));
  }
  revalidatePath("/today");
  revalidatePath("/review");
}

export async function getDueNotebookCards(): Promise<NotebookReviewCard[]> {
  const user = await requireFeature("tcf");
  const rows = await db
    .select({
      noteId: tcfNotes.id,
      kind: tcfNotes.kind,
      point: tcfNotes.point,
      front: tcfNotes.front,
      back: tcfNotes.back,
      box: tcfNotes.box,
      sourceQuestionId: tcfNotes.sourceQuestionId,
      sourceLocator: tcfNotes.sourceLocator,
    })
    .from(tcfNotes)
    .where(
      and(
        eq(tcfNotes.userId, user.id),
        eq(tcfNotes.status, "active"),
        ne(tcfNotes.kind, "vocabulary"),
        lte(tcfNotes.dueAt, new Date()),
      ),
    )
    .orderBy(asc(tcfNotes.dueAt))
    .limit(NOTEBOOK_REVIEW_LIMIT);
  return rows.flatMap((r) => (r.kind === "vocabulary" ? [] : [{ ...r, kind: r.kind }]));
}

/** One AI call for a whole session. A card whose item is missing or invalid maps to null (self-grading). */
export async function generateNotebookReview(
  noteIds: string[],
): Promise<Record<string, TcfGeneratedReviewItem | null>> {
  if (noteIds.length > NOTEBOOK_REVIEW_LIMIT) throw new Error("Too many cards in one review");
  const user = await requireFeature("tcf");
  await assertAiBudget("lookup");

  const result: Record<string, TcfGeneratedReviewItem | null> = {};
  for (const id of noteIds) result[id] = null;
  if (noteIds.length === 0) return result;

  const notes = await db
    .select({ id: tcfNotes.id, kind: tcfNotes.kind, point: tcfNotes.point, front: tcfNotes.front, back: tcfNotes.back })
    .from(tcfNotes)
    .where(
      and(
        eq(tcfNotes.userId, user.id),
        inArray(tcfNotes.id, noteIds),
        eq(tcfNotes.status, "active"),
        ne(tcfNotes.kind, "vocabulary"),
      ),
    );
  if (notes.length === 0) return result;

  try {
    const { items } = await generateReviewItems(
      notes.map((n) => ({ kind: n.kind, point: n.point, front: n.front, back: n.back })),
    );
    const seen = new Set<number>();
    for (const item of items) {
      const note = notes[item.index];
      if (!note || seen.has(item.index)) continue;
      seen.add(item.index);
      result[note.id] = validateReviewItem(item, note.kind);
    }
  } catch (err) {
    console.error("Notebook review generation failed", err);
    for (const id of noteIds) result[id] = null;
  }
  return result;
}

export async function gradeNotebookCard(input: {
  noteId: string;
  item: TcfGeneratedReviewItem | null;
  chosen: number | null;
  selfCorrect: boolean | null;
}): Promise<{ box: number; status: "active" | "mastered"; correct: boolean }> {
  const user = await requireFeature("tcf");
  const { noteId, item, chosen, selfCorrect } = input;

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const [note] = await tx
      .select()
      .from(tcfNotes)
      .where(and(eq(tcfNotes.id, noteId), eq(tcfNotes.userId, user.id)))
      .limit(1)
      .for("update");
    if (!note || note.kind === "vocabulary" || note.status !== "active" || note.dueAt.getTime() > now.getTime()) {
      throw new Error("Review card is no longer due");
    }

    let correct: boolean;
    let checked: TcfGeneratedReviewItem | null = null;
    if (item) {
      if (!Number.isInteger(chosen) || chosen === null || chosen < 0 || chosen > 3) {
        throw new Error("Invalid answer");
      }
      const valid = validateReviewItem(item, note.kind);
      if (!valid) throw new Error("Invalid review item");
      checked = valid;
      correct = chosen === valid.answer;
    } else {
      if (typeof selfCorrect !== "boolean") throw new Error("Invalid self-grade");
      correct = selfCorrect;
    }

    const next = leitnerAfter(note.box, correct, now);
    await tx
      .update(tcfNotes)
      .set({ box: next.box, status: next.status, dueAt: next.dueAt ?? note.dueAt, lastReviewedAt: now })
      .where(and(eq(tcfNotes.id, note.id), eq(tcfNotes.userId, user.id)));
    await tx.insert(tcfNoteReviews).values({
      userId: user.id,
      noteId: note.id,
      generated: checked,
      chosen: checked ? chosen : null,
      correct,
      boxBefore: note.box,
      boxAfter: next.box,
      createdAt: now,
    });
    return { box: next.box, status: next.status, correct };
  });

  revalidatePath("/today");
  revalidatePath("/review");
  return result;
}

export async function dismissNote(noteId: string): Promise<void> {
  const user = await requireFeature("tcf");
  await db
    .update(tcfNotes)
    .set({ status: "dismissed" })
    .where(and(eq(tcfNotes.id, noteId), eq(tcfNotes.userId, user.id)));
  revalidatePath("/today");
  revalidatePath("/review");
}

export async function getDueNotebookCount(): Promise<number> {
  const user = await requireUser();
  // Today (open to guests) shows this count; guests have no notebook.
  if (canUse(user.access, "tcf") !== true) return 0;
  return countDueNotes(user.id, new Date());
}
