import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingSessions, speakingTurns } from "@/lib/db/schema";
import { assessPronunciation } from "@/lib/speech/azure";
import { AuthenticationError, requireUser } from "@/lib/auth/session";

/** ~30s of 16kHz mono PCM16 WAV is <1MB; 10MB is a generous ceiling. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { error: error.code.toLowerCase() },
        { status: error.code === "FORBIDDEN" ? 403 : error.code === "AUTH_MISCONFIGURED" ? 503 : 401 },
      );
    }
    throw error;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "audio_too_large" }, { status: 413 });
  }
  const referenceText = (form.get("referenceText") as string | null)?.trim() || null;
  // sessionId is interpolated into a filesystem path — accept UUIDs only.
  const sessionIdRaw = (form.get("sessionId") as string | null) || null;
  if (sessionIdRaw && !UUID_RE.test(sessionIdRaw)) {
    return Response.json({ error: "invalid_session" }, { status: 400 });
  }
  const sessionId = sessionIdRaw;
  const orderIndexRaw = form.get("orderIndex") as string | null;

  if (sessionId) {
    const ownedSession = await db
      .select({ id: speakingSessions.id })
      .from(speakingSessions)
      .where(and(eq(speakingSessions.id, sessionId), eq(speakingSessions.userId, user.id)))
      .limit(1);
    if (ownedSession.length === 0) {
      return Response.json({ error: "invalid_session" }, { status: 404 });
    }
  }

  const wav = Buffer.from(await audio.arrayBuffer());

  let result;
  try {
    result = await assessPronunciation(wav, referenceText);
  } catch (err) {
    console.error("[speaking/assess]", err);
    return Response.json({ error: "azure_failed" }, { status: 502 });
  }
  if (!result) {
    return Response.json({ error: "no_speech" }, { status: 422 });
  }

  let turnId: string | undefined;
  const orderIndex = orderIndexRaw === null ? NaN : parseInt(orderIndexRaw, 10);
  if (sessionId && Number.isInteger(orderIndex)) {
    const dir = path.join(process.cwd(), "public", "media", "speaking", sessionId);
    await mkdir(dir, { recursive: true });
    const filename = `${String(orderIndex).padStart(3, "0")}.wav`;
    await writeFile(path.join(dir, filename), wav);

    const { transcript, ...assessment } = result;
    const [turn] = await db
      .insert(speakingTurns)
      .values({
        userId: user.id,
        sessionId,
        orderIndex,
        role: "user",
        text: transcript,
        audioPath: `/media/speaking/${sessionId}/${filename}`,
        assessment,
      })
      .returning({ id: speakingTurns.id });
    turnId = turn.id;
  }

  return Response.json({ ...result, turnId });
}
