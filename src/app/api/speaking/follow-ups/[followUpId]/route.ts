import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingAssessments, speakingAssets, speakingFollowUps } from "@/lib/db/schema";
import { AuthenticationError, requireUser } from "@/lib/auth/session";
import { MAX_TURN_BYTES, wavDurationSeconds } from "@/lib/speaking/audio";
import { reserveOperation, settleOperation } from "@/lib/speaking/operations";
import { DRILLS, type DrillId } from "@/lib/speaking/scenario";
import { assessPronunciation } from "@/lib/speech/azure";
import { putRecording, recordingKey } from "@/lib/storage/speaking-recordings";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let user;
  try { user = await requireUser(); }
  catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Unauthorized" }, { status: error.code === "FORBIDDEN" ? 403 : 401 });
    throw error;
  }
  const { followUpId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(followUpId)) return Response.json({ error: "Invalid follow-up" }, { status: 400 });
  const requestKey = request.headers.get("idempotency-key");
  if (!requestKey || !/^[0-9a-f-]{36}$/i.test(requestKey)) return Response.json({ error: "Invalid request key" }, { status: 400 });
  const [row] = await db.select({ followUp: speakingFollowUps, assessment: speakingAssessments })
    .from(speakingFollowUps).innerJoin(speakingAssessments, eq(speakingAssessments.id, speakingFollowUps.assessmentId))
    .where(and(eq(speakingFollowUps.id, followUpId), eq(speakingFollowUps.userId, user.id),
      eq(speakingAssessments.userId, user.id))).limit(1);
  if (!row) return Response.json({ error: "Follow-up not found" }, { status: 404 });
  if (row.followUp.transcript) return Response.json({ transcript: row.followUp.transcript, feedback: row.followUp.feedback });
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size > MAX_TURN_BYTES) return Response.json({ error: "Invalid audio" }, { status: 400 });
  const wav = Buffer.from(await audio.arrayBuffer());
  if (!wavDurationSeconds(wav)) return Response.json({ error: "Invalid WAV" }, { status: 400 });
  let reserved;
  try {
    reserved = await reserveOperation(user.id, row.assessment.sessionId, "follow_up", requestKey,
      createHash("sha256").update(wav).digest("hex"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Follow-up unavailable" }, { status: 429 });
  }
  const { operation, replay } = reserved;
  if (replay) return Response.json({ error: "Attempt already processing or needs review" }, { status: 409 });
  const startedAt = Date.now();
  try {
    const assetId = crypto.randomUUID();
    const key = recordingKey(row.assessment.sessionId, assetId, "user", "wav");
    await putRecording(key, wav, "audio/wav");
    await db.insert(speakingAssets).values({ id: assetId, userId: user.id, sessionId: row.assessment.sessionId,
      objectKey: key, mimeType: "audio/wav", byteLength: wav.length,
      expiresAt: new Date(Date.now() + 30 * 86400_000) });
    const recognized = await assessPronunciation(wav, null);
    if (!recognized?.transcript.trim()) {
      await settleOperation(operation.id, "done");
      return Response.json({ error: "No usable speech detected" }, { status: 422 });
    }
    const drill = DRILLS[row.followUp.drillId as DrillId];
    const feedback = `Recorded answer: “${recognized.transcript.trim().slice(0, 350)}”. Compare your question with this example: ${drill?.example ?? "Ask for the missing information clearly."} This single attempt does not establish mastery.`;
    await db.update(speakingFollowUps).set({ transcript: recognized.transcript.trim().slice(0, 1000),
      audioPath: `/api/speaking/recordings/${assetId}`, feedback }).where(and(
        eq(speakingFollowUps.id, followUpId), eq(speakingFollowUps.userId, user.id),
      ));
    await settleOperation(operation.id, "done", { audioSeconds: wavDurationSeconds(wav) ?? undefined,
      latencyMs: Date.now() - startedAt });
    return Response.json({ transcript: recognized.transcript, feedback });
  } catch {
    await settleOperation(operation.id, "uncertain", { latencyMs: Date.now() - startedAt });
    return Response.json({ error: "Follow-up processing failed" }, { status: 502 });
  }
}
