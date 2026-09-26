import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingAssets, speakingSessions, speakingTurns } from "@/lib/db/schema";
import { assessPronunciation } from "@/lib/speech/azure";
import { AuthenticationError, requireUser } from "@/lib/auth/session";
import { assertSpeakingStorageReady, putRecording, recordingKey } from "@/lib/storage/speaking-recordings";
import { wavDurationSeconds } from "@/lib/speaking/audio";

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
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "audio_too_large" }, { status: 413 });
  }
  const referenceText = (form.get("referenceText") as string | null)?.trim() || null;
  if (referenceText && referenceText.length > 1000) {
    return Response.json({ error: "reference_too_long" }, { status: 400 });
  }
  // sessionId is interpolated into a filesystem path — accept UUIDs only.
  const sessionIdRaw = (form.get("sessionId") as string | null) || null;
  if (sessionIdRaw && !UUID_RE.test(sessionIdRaw)) {
    return Response.json({ error: "invalid_session" }, { status: 400 });
  }
  const sessionId = sessionIdRaw;
  const orderIndexRaw = form.get("orderIndex") as string | null;
  const orderIndex = orderIndexRaw === null ? NaN : Number(orderIndexRaw);
  if (!sessionId || !Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex >= 200 || !referenceText) {
    return Response.json({ error: "active_script_session_required" }, { status: 400 });
  }

  if (sessionId) {
    const ownedSession = await db
      .select({ id: speakingSessions.id })
      .from(speakingSessions)
      .where(and(eq(speakingSessions.id, sessionId), eq(speakingSessions.userId, user.id), eq(speakingSessions.mode, "script_practice"), eq(speakingSessions.status, "active")))
      .limit(1);
    if (ownedSession.length === 0) {
      return Response.json({ error: "invalid_session" }, { status: 404 });
    }
  }

  const wav = Buffer.from(await audio.arrayBuffer());
  if (!wavDurationSeconds(wav)) {
    return Response.json({ error: "invalid_audio" }, { status: 400 });
  }
  try {
    assertSpeakingStorageReady();
  } catch {
    return Response.json({ error: "private_storage_unavailable" }, { status: 503 });
  }

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
  if (sessionId && Number.isInteger(orderIndex) && orderIndex >= 0 && orderIndex < 200) {
    const assetId = crypto.randomUUID();
    const key = recordingKey(sessionId, assetId, "user", "wav");
    await putRecording(key, wav, "audio/wav");
    const { transcript, ...assessment } = result;
    const [turn] = await db
      .insert(speakingTurns)
      .values({
        userId: user.id,
        sessionId,
        orderIndex,
        role: "user",
        text: transcript,
        audioPath: `/api/speaking/recordings/${assetId}`,
        assessment,
      })
      .returning({ id: speakingTurns.id });
    await db.insert(speakingAssets).values({
      id: assetId,
      userId: user.id,
      sessionId,
      turnId: turn.id,
      objectKey: key,
      mimeType: "audio/wav",
      byteLength: wav.length,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    turnId = turn.id;
  }

  return Response.json({ ...result, turnId });
}
