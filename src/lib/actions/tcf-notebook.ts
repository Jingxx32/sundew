"use server";

import { and, asc, desc, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tcfNotes, tcfQuestions, tcfSets, tcfTutorMessages, vocabularyGaps } from "@/lib/db/schema";
import { AuthenticationError } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";
import { assertAiBudget } from "@/lib/access/ai-guard";
import { proposeCard } from "@/lib/ai/tutor";
import { resolveLookupForUser } from "@/lib/vocabulary/resolve-lookup";
import { upsertGap } from "@/lib/vocabulary/gaps";
import { explanationLocatorLabel } from "@/lib/tcf/parse-explanation";
import { findVocabularyDuplicate } from "@/lib/tcf/notebook/rules";
import { listNoteLines } from "@/lib/tcf/notebook/queries";
import {
  CardDraftSchema,
  normalizeProposal,
  type CardDraft,
  type CardProposalResult,
} from "@/lib/tcf/tutor/schemas";

export type TutorThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  note: { point: string } | null;
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
  await assertAiBudget("lookup");
  const message = await loadOwnedAssistantMessage(user.id, messageId);

  const bySource = () =>
    db
      .select({ id: tcfNotes.id, point: tcfNotes.point })
      .from(tcfNotes)
      .where(and(eq(tcfNotes.userId, user.id), eq(tcfNotes.sourceMessageId, messageId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  // A repeated click on the same message returns the card it already made.
  const already = await bySource();
  if (already) return { noteId: already.id, point: already.point };

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

    const duplicate = findVocabularyDuplicate(await listNoteLines(user.id, 200), lemmaInput);
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
    .select({ id: tcfNotes.id, kind: tcfNotes.kind, vocabularyGapId: tcfNotes.vocabularyGapId })
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
  } else {
    await db
      .update(tcfNotes)
      .set({ status: "active", box: 1, dueAt: new Date() })
      .where(and(eq(tcfNotes.id, note.id), eq(tcfNotes.userId, user.id)));
  }
  revalidatePath("/today");
  revalidatePath("/review");
}
