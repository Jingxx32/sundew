import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireFeature } from "@/lib/access/guard";
import { streamTutorAnswer } from "@/lib/ai/tutor";
import { AuthenticationError, authErrorStatus } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tcfQuestions, tcfSets, tcfTutorMessages } from "@/lib/db/schema";
import { loadNotebookContext } from "@/lib/tcf/notebook/queries";
import { buildTutorMessages, THREAD_RESEND_LIMIT, type TutorQuestion } from "@/lib/tcf/tutor/context";
import { encodeEvent, type TutorStreamEvent } from "@/lib/tcf/tutor/ndjson";
import { questionImageInput } from "@/lib/tcf/tutor/question-image";
import { UserFacingError } from "@/lib/user-error";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  questionId: z.string().uuid(),
  chosen: z.number().int().min(0).nullable(),
  ask: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });

  let user;
  try {
    user = await requireFeature("tcf");
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ code: error.code }, { status: authErrorStatus(error.code) });
    throw error;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { questionId, chosen, ask } = body.data;

  const [row] = await db
    .select({ q: tcfQuestions, skill: tcfSets.skill })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfSets.id, tcfQuestions.setId))
    .where(eq(tcfQuestions.id, questionId))
    .limit(1);
  if (!row) return Response.json({ error: "Question not found" }, { status: 404 });
  const { q, skill } = row;
  if (chosen !== null && chosen >= q.options.length) return Response.json({ error: "Invalid body" }, { status: 400 });

  const recent = await db
    .select({ role: tcfTutorMessages.role, content: tcfTutorMessages.content })
    .from(tcfTutorMessages)
    .where(and(eq(tcfTutorMessages.userId, user.id), eq(tcfTutorMessages.questionId, questionId)))
    .orderBy(desc(tcfTutorMessages.createdAt))
    .limit(THREAD_RESEND_LIMIT);
  const thread = recent.reverse();

  const notebook = await loadNotebookContext(user.id, { skill, skillTags: q.skillTags });

  const needsImage = q.type === "image" || (skill === "reading" && q.passage === null);
  const imageUrl = needsImage && q.imagePath ? await questionImageInput(q.imagePath) : null;

  const question: TutorQuestion = {
    skill,
    type: q.type,
    questionText: q.questionText,
    options: q.options,
    answer: q.answer,
    passage: q.passage,
    transcript: q.transcript,
    explanation: q.explanation,
  };
  const messages = buildTutorMessages({ question, chosen, imageUrl, notebook, thread, ask });

  // Budget and guest errors throw here, before any byte is sent.
  let answer: AsyncIterable<string>;
  try {
    answer = await streamTutorAnswer(messages);
  } catch (error) {
    if (error instanceof UserFacingError) return Response.json({ code: error.code }, { status: 429 });
    console.error("tutor: could not start the stream", error);
    return Response.json({ error: "The tutor is unavailable" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const iterator = answer[Symbol.asyncIterator]();
  let text = "";
  const send = (c: ReadableStreamDefaultController<Uint8Array>, e: TutorStreamEvent) => c.enqueue(encoder.encode(encodeEvent(e)));

  const stream = new ReadableStream<Uint8Array>({
    // Pull-based: one upstream chunk per pull, so a closed client stops the upstream read.
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (!next.done) {
          text += next.value;
          send(controller, { type: "delta", text: next.value });
          return;
        }
        if (request.signal.aborted) return controller.close();
        if (!text.trim()) throw new Error("empty tutor answer");
        const userAt = new Date();
        const messageId = await db.transaction(async (tx) => {
          await tx.insert(tcfTutorMessages).values({ userId: user.id, questionId, role: "user", content: ask, createdAt: userAt });
          const [saved] = await tx
            .insert(tcfTutorMessages)
            .values({ userId: user.id, questionId, role: "assistant", content: text, createdAt: new Date(userAt.getTime() + 1) })
            .returning({ id: tcfTutorMessages.id });
          return saved.id;
        });
        send(controller, { type: "done", messageId });
        controller.close();
      } catch (error) {
        console.error("tutor: stream failed", error);
        await iterator.return?.().catch(() => undefined);
        send(controller, { type: "error" });
        controller.close();
      }
    },
    // The client left: close the OpenAI stream (aborts the upstream request) and save nothing.
    async cancel() {
      await iterator.return?.().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
