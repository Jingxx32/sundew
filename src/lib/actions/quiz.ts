"use server";

import { syncReviewTarget } from "@/lib/review/service";
import { reviewDataEnabled, lockReviewOwner } from "@/lib/review/adapters";

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { eq, desc, and, inArray, asc, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  quizSets,
  quizPassages,
  quizQuestions,
  quizAttempts,
  quizQuestionAttempts,
  type QuizSet,
  type QuizPassage,
  type QuizQuestion,
  type QuizAttempt,
} from "@/lib/db/schema";
import { extractPdfText } from "@/lib/pdf/extract";
import { parseQuizFromText } from "@/lib/ai/quiz-parse";
import { QuizParseSchema, type ParsedQuiz } from "@/lib/ai/quiz-schema";
import { requireFeature } from "@/lib/access/guard";
import { gradeQuizAnswers, type QuizAnswer } from "@/lib/quiz/grading";

const QUIZ_SECTIONS = [
  "reading",
  "listening",
  "grammar",
  "vocabulary",
  "dictation",
  "conjugation",
] as const;
type QuizSection = (typeof QUIZ_SECTIONS)[number];

/* ------------------------------------------------------------------ */
/*  Import — step 1: parse only, no DB write (D-4 preview)             */
/* ------------------------------------------------------------------ */

export type ImportQuizResult =
  | { ok: true; parsed: ParsedQuiz }
  | { ok: false; error: "scanned" | "parse_failed" | "empty" };

export async function importQuizFromPdf(
  formData: FormData,
): Promise<ImportQuizResult> {
  await requireFeature("quiz");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "empty" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { text, looksScanned } = await extractPdfText(buf);
  if (looksScanned || !text.trim()) {
    return { ok: false, error: "scanned" };
  }

  return parsePastedOrExtractedText(text);
}

export async function parseQuizFromPastedText(
  rawText: string,
): Promise<ImportQuizResult> {
  await requireFeature("quiz");
  if (!rawText.trim()) return { ok: false, error: "empty" };
  return parsePastedOrExtractedText(rawText);
}

async function parsePastedOrExtractedText(
  text: string,
): Promise<ImportQuizResult> {
  try {
    const parsed = await parseQuizFromText(text, "reading");
    if (parsed.passages.length === 0) {
      return { ok: false, error: "parse_failed" };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, error: "parse_failed" };
  }
}

/* ------------------------------------------------------------------ */
/*  Import — step 2: confirmed insert (writes 3 tables)                */
/* ------------------------------------------------------------------ */

export async function confirmQuizImport(input: {
  exam: string;
  number: number | null;
  section: QuizSection;
  title: string;
  source?: string | null;
  parsed: ParsedQuiz;
}): Promise<{ setId: string }> {
  const user = await requireFeature("quiz");
  // Re-validate the client-held preview payload before trusting it
  const parsed = QuizParseSchema.parse(input.parsed);

  const setId = randomUUID();
  // Pre-generate ids so passages and questions can be batch-inserted.
  const passageRows = parsed.passages.map((passage, pIndex) => ({
    id: randomUUID(),
    setId,
    orderIndex: pIndex,
    text: passage.text,
  }));
  const questionRows = parsed.passages.flatMap((passage, pIndex) =>
    passage.questions.map((q, qIndex) => ({
      id: randomUUID(),
      passageId: passageRows[pIndex].id,
      orderIndex: qIndex,
      type: q.type,
      questionText: q.questionText,
      options: q.options,
      answer: q.correctIndex,
      explanation: q.explanation,
    })),
  );

  // All-or-nothing: a mid-way failure must not leave an empty set behind.
  await db.transaction(async (tx) => {
    await tx.insert(quizSets).values({
      id: setId,
      userId: user.id,
      exam: input.exam.trim() || "TCF",
      number: input.number,
      section: input.section,
      title: input.title.trim() || "Untitled set",
      source: input.source?.trim() || null,
    });
    await tx.insert(quizPassages).values(passageRows);
    if (questionRows.length > 0) {
      await tx.insert(quizQuestions).values(questionRows);
    }
  });

  revalidatePath("/quiz");
  return { setId };
}

/* ------------------------------------------------------------------ */
/*  Attempts                                                           */
/* ------------------------------------------------------------------ */

export async function submitQuizAttempt(input: {
  setId: string;
  answers: QuizAnswer[];
  requestKey: string;
}): Promise<QuizAttempt> {
  const user = await requireFeature("quiz");
  if (typeof input.requestKey !== "string" || !/^[a-zA-Z0-9-]{12,100}$/.test(input.requestKey)) {
    throw new Error("Invalid request key");
  }
  if (!Array.isArray(input.answers) || input.answers.length > 200) throw new Error("Invalid answers");
  const ownedSet = await db
    .select({ id: quizSets.id, section: quizSets.section })
    .from(quizSets)
    .where(and(eq(quizSets.id, input.setId), eq(quizSets.userId, user.id)))
    .limit(1);
  if (ownedSet.length === 0) throw new Error("Quiz set not found");
  const questions = await db.select({
    id: quizQuestions.id,
    type: quizQuestions.type,
    answer: quizQuestions.answer,
    options: quizQuestions.options,
  }).from(quizQuestions).innerJoin(quizPassages, eq(quizQuestions.passageId, quizPassages.id))
    .where(eq(quizPassages.setId, input.setId));
  const targetType = ownedSet[0].section === "dictation" ? "fill_blank" : "single";
  const gradable = questions.filter((q) => q.type === targetType) as Array<{
    id: string; type: "single" | "fill_blank"; answer: unknown; options: string[] | null;
  }>;
  const graded = gradeQuizAnswers(gradable, input.answers);
  const score = graded.filter((answer) => answer.correct).length;
  const requestHash = createHash("sha256").update(JSON.stringify({ setId: input.setId,
    answers: [...graded].sort((a, b) => a.questionId.localeCompare(b.questionId)).map(({ questionId, answer, uncertain }) => ({ questionId, answer, uncertain })) })).digest("hex");
  const attempt = await db.transaction(async (tx) => {
    if (reviewDataEnabled()) await lockReviewOwner(tx,user.id);
    const [created] = await tx.insert(quizAttempts).values({
      id: randomUUID(), userId: user.id, setId: input.setId, score, total: graded.length,
      requestKey: input.requestKey, requestHash,
    }).onConflictDoNothing({ target: [quizAttempts.userId, quizAttempts.requestKey] }).returning();
    if (!created) {
      const [existing] = await tx.select().from(quizAttempts).where(and(
        eq(quizAttempts.userId, user.id), eq(quizAttempts.requestKey, input.requestKey),
      )).limit(1);
      if (!existing || existing.requestHash !== requestHash) throw new Error("Request key was used for different answers");
      return existing;
    }
    await tx.insert(quizQuestionAttempts).values(graded.map((answer) => ({
      userId: user.id, attemptId: created.id, questionId: answer.questionId,
      answer: answer.answer, correct: answer.correct, uncertain: answer.uncertain,
    })));
    if (reviewDataEnabled()) for (const answer of graded) await syncReviewTarget(tx,user.id,"quiz",answer.questionId);
    return created;
  });

  revalidatePath("/quiz");
  revalidatePath("/review");
  revalidatePath("/today");
  return attempt;
}

/* ------------------------------------------------------------------ */
/*  Read helpers (callable from server components)                     */
/* ------------------------------------------------------------------ */

export type QuizSetListItem = QuizSet & {
  questionCount: number;
  latestAttempt: QuizAttempt | null;
};

export async function listQuizSets(opts?: {
  exam?: string;
  section?: string;
}): Promise<QuizSetListItem[]> {
  const user = await requireFeature("quiz");
  const filters: SQL[] = [eq(quizSets.userId, user.id)];
  if (opts?.exam && opts.exam !== "all") {
    filters.push(eq(quizSets.exam, opts.exam));
  }
  if (
    opts?.section &&
    opts.section !== "all" &&
    QUIZ_SECTIONS.includes(opts.section as QuizSection)
  ) {
    filters.push(eq(quizSets.section, opts.section as QuizSection));
  }

  const sets = await db
    .select()
    .from(quizSets)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(quizSets.createdAt));

  if (sets.length === 0) return [];
  const setIds = sets.map((s) => s.id);

  const [passages, attempts] = await Promise.all([
    db
      .select({ id: quizPassages.id, setId: quizPassages.setId })
      .from(quizPassages)
      .where(inArray(quizPassages.setId, setIds)),
    db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), inArray(quizAttempts.setId, setIds)))
      .orderBy(desc(quizAttempts.answeredAt)),
  ]);

  const questionCounts = new Map<string, number>();
  if (passages.length > 0) {
    const questions = await db
      .select({ passageId: quizQuestions.passageId })
      .from(quizQuestions)
      .where(
        inArray(
          quizQuestions.passageId,
          passages.map((p) => p.id),
        ),
      );
    const passageToSet = new Map(passages.map((p) => [p.id, p.setId]));
    for (const q of questions) {
      const setId = passageToSet.get(q.passageId);
      if (!setId) continue;
      questionCounts.set(setId, (questionCounts.get(setId) ?? 0) + 1);
    }
  }

  const latestAttemptBySet = new Map<string, QuizAttempt>();
  for (const a of attempts) {
    if (!latestAttemptBySet.has(a.setId)) latestAttemptBySet.set(a.setId, a);
  }

  return sets.map((set) => ({
    ...set,
    questionCount: questionCounts.get(set.id) ?? 0,
    latestAttempt: latestAttemptBySet.get(set.id) ?? null,
  }));
}

export type QuizSetDetail = {
  set: QuizSet;
  passages: (QuizPassage & { questions: QuizQuestion[] })[];
};

export async function getQuizSet(setId: string): Promise<QuizSetDetail | null> {
  const user = await requireFeature("quiz");
  const set = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.id, setId), eq(quizSets.userId, user.id)))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!set) return null;

  const passages = await db
    .select()
    .from(quizPassages)
    .where(eq(quizPassages.setId, setId))
    .orderBy(asc(quizPassages.orderIndex));

  const questions =
    passages.length > 0
      ? await db
          .select()
          .from(quizQuestions)
          .where(
            inArray(
              quizQuestions.passageId,
              passages.map((p) => p.id),
            ),
          )
          .orderBy(asc(quizQuestions.orderIndex))
      : [];

  return {
    set,
    passages: passages.map((p) => ({
      ...p,
      questions: questions.filter((q) => q.passageId === p.id),
    })),
  };
}

export async function deleteQuizSet(setId: string) {
  const user = await requireFeature("quiz");
  await db.delete(quizSets).where(and(eq(quizSets.id, setId), eq(quizSets.userId, user.id)));
  revalidatePath("/quiz");
}
