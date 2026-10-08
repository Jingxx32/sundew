import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { speakingAssets, speakingOperations, speakingSimulations, speakingTurns } from "@/lib/db/schema";
import { assessPronunciation } from "@/lib/speech/azure";
import { getOpenAI, MODELS } from "@/lib/ai/client";
import { recordingKey, putRecording } from "@/lib/storage/speaking-recordings";
import { reserveOperation, settleOperation } from "./operations";
import { SCENARIO } from "./scenario";
import { wavDurationSeconds, MAX_TURN_BYTES } from "./audio";

export async function processSimulationTurn(userId: string, sessionId: string, requestKey: string, wav: Buffer) {
  if (wav.length > MAX_TURN_BYTES || !wavDurationSeconds(wav)) throw new Error("Invalid or oversized 16 kHz WAV recording");
  const requestHash = createHash("sha256").update(wav).digest("hex");
  const [previous] = await db.select().from(speakingOperations).where(and(
    eq(speakingOperations.sessionId, sessionId), eq(speakingOperations.userId, userId),
    eq(speakingOperations.kind, "turn"), eq(speakingOperations.requestKey, requestKey),
  )).limit(1);
  if (previous) {
    if (previous.requestHash !== requestHash) throw new Error("Request key was reused with different audio");
    const [saved] = await db.select().from(speakingTurns).where(and(
      eq(speakingTurns.sessionId, sessionId), eq(speakingTurns.userId, userId), eq(speakingTurns.requestKey, requestKey),
    )).limit(1);
    return { status: previous.status === "done" ? (saved ? "saved" : "silence")
      : previous.status === "uncertain" ? (saved ? "partial" : "failed") : "processing", turnId: saved?.id ?? null };
  }
  const [state] = await db.select().from(speakingSimulations).where(and(
    eq(speakingSimulations.sessionId, sessionId), eq(speakingSimulations.userId, userId),
  )).limit(1);
  if (!state || state.phase !== "conversing") throw new Error("Conversation is not active");
  if (state.scenarioVersion !== SCENARIO.version) throw new Error("This scenario version is unavailable");
  if (!state.conversationEndsAt || Date.now() > Math.min(state.conversationEndsAt.getTime() + state.excludedWaitMs, state.preparationEndsAt.getTime() + 480_000)) {
    throw new Error("Conversation time expired");
  }
  const { operation, replay } = await reserveOperation(userId, sessionId, "turn", requestKey, requestHash);
  if (replay) {
    const [saved] = await db.select().from(speakingTurns).where(and(
      eq(speakingTurns.sessionId, sessionId), eq(speakingTurns.userId, userId), eq(speakingTurns.requestKey, requestKey),
    )).limit(1);
    return { status: operation.status === "done" ? (saved ? "saved" : "silence")
      : operation.status === "uncertain" ? (saved ? "partial" : "failed") : "processing", turnId: saved?.id ?? null };
  }

  const waitStarted = Date.now();
  try {
    const assetId = crypto.randomUUID();
    const key = recordingKey(sessionId, assetId, "user", "wav");
    await putRecording(key, wav, "audio/wav");
    await db.insert(speakingAssets).values({ id: assetId, userId, sessionId, objectKey: key,
      mimeType: "audio/wav", byteLength: wav.length, expiresAt: new Date(Date.now() + 30 * 86400_000) });

    const recognized = await assessPronunciation(wav, null);
    if (!recognized?.transcript.trim()) {
      await settleOperation(operation.id, "done");
      return { status: "silence", turnId: null };
    }
    const history = await db.select().from(speakingTurns).where(and(
      eq(speakingTurns.sessionId, sessionId), eq(speakingTurns.userId, userId),
    )).orderBy(speakingTurns.orderIndex);
    if (history.filter((turn) => turn.role === "user").length >= 12) throw new Error("Turn limit reached");
    const orderIndex = history.length;
    const [userTurn] = await db.insert(speakingTurns).values({
      userId, sessionId, orderIndex, role: "user", requestKey, text: recognized.transcript.trim().slice(0, 1000),
      audioPath: `/api/speaking/recordings/${assetId}`,
      assessment: { accuracyScore: recognized.accuracyScore, fluencyScore: recognized.fluencyScore,
        completenessScore: recognized.completenessScore, pronunciationScore: recognized.pronunciationScore, words: recognized.words },
    }).returning({ id: speakingTurns.id });
    await db.update(speakingAssets).set({ turnId: userTurn.id }).where(eq(speakingAssets.id, assetId));

    const response = await (await getOpenAI()).chat.completions.create({
      model: MODELS.speaking,
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: SCENARIO.partnerFacts },
        ...history.slice(-18).map((turn) => ({ role: turn.role === "user" ? "user" as const : "assistant" as const, content: turn.text })),
        { role: "user", content: recognized.transcript.trim().slice(0, 1000) },
      ],
    }, { timeout: 20_000, maxRetries: 0 });
    const reply = response.choices[0]?.message?.content?.trim().slice(0, 450);
    if (!reply) throw new Error("Partner response unavailable");
    const [partnerTurn] = await db.insert(speakingTurns).values({ userId, sessionId, orderIndex: orderIndex + 1,
      role: "examiner", text: reply }).returning({ id: speakingTurns.id });
    const speech = await (await getOpenAI()).audio.speech.create({ model: "tts-1", voice: "alloy", input: reply,
      response_format: "mp3" }, { timeout: 20_000, maxRetries: 0 });
    const audio = Buffer.from(await speech.arrayBuffer());
    const partnerAssetId = crypto.randomUUID();
    const partnerKey = recordingKey(sessionId, partnerAssetId, "partner", "mp3");
    await putRecording(partnerKey, audio, "audio/mpeg");
    await db.insert(speakingAssets).values({ id: partnerAssetId, userId, sessionId, turnId: partnerTurn.id,
      objectKey: partnerKey, mimeType: "audio/mpeg", byteLength: audio.length,
      expiresAt: new Date(Date.now() + 30 * 86400_000) });
    await db.update(speakingTurns).set({ audioPath: `/api/speaking/recordings/${partnerAssetId}` }).where(eq(speakingTurns.id, partnerTurn.id));
    await db.update(speakingSimulations).set({ excludedWaitMs: state.excludedWaitMs + Date.now() - waitStarted,
      revision: state.revision + 1 }).where(eq(speakingSimulations.sessionId, sessionId));
    await settleOperation(operation.id, "done", { audioSeconds: wavDurationSeconds(wav) ?? undefined,
      chatInputTokens: response.usage?.prompt_tokens, chatOutputTokens: response.usage?.completion_tokens,
      speechCharacters: reply.length, latencyMs: Date.now() - waitStarted });
    return { status: "saved", turnId: userTurn.id };
  } catch (error) {
    await settleOperation(operation.id, "uncertain", { latencyMs: Date.now() - waitStarted });
    throw error;
  }
}
