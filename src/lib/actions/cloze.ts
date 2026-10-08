"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { quizSets, quizPassages, quizQuestions } from "@/lib/db/schema";
import { transcribePodcast, type WordTiming } from "@/lib/ai/transcribe";
import { selectBlanks } from "@/lib/ai/cloze-select";
import {
  ClozePayloadSchema,
  type ClozeBlankParsed,
  type ClozePayload,
} from "@/lib/ai/cloze-schema";
import { requireFeature } from "@/lib/access/guard";

/** Seconds of audio padding around a blanked word's loop window. */
const LOOP_PAD_SEC = 0.5;
/** Tokens of transcript context shown on each side of the blank. */
const CONTEXT_TOKENS = 8;

/* ------------------------------------------------------------------ */
/*  Import — step 1: transcribe + select blanks, no DB write (D-4)     */
/* ------------------------------------------------------------------ */

export type PrepareClozeResult =
  | { ok: true; payload: ClozePayload }
  | {
      ok: false;
      error:
        | "invalid_url"
        | "too_large"
        | "fetch_failed"
        | "transcribe_failed"
        | "select_failed";
    };

export async function preparePodcastCloze(input: {
  url: string;
}): Promise<PrepareClozeResult> {
  await requireFeature("quiz");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, error: "invalid_url" };
  }

  const transcribed = await transcribePodcast(parsedUrl.toString());
  if (!transcribed.ok) return { ok: false, error: transcribed.error };

  let chosen: { wordIndex: number }[];
  try {
    chosen = await selectBlanks(transcribed.words);
  } catch {
    return { ok: false, error: "select_failed" };
  }
  if (chosen.length === 0) return { ok: false, error: "select_failed" };

  const blanks = chosen.map(({ wordIndex }) =>
    buildBlank(transcribed.words, wordIndex, transcribed.durationSec),
  );

  return {
    ok: true,
    payload: {
      transcript: transcribed.text,
      durationSec: transcribed.durationSec,
      blanks,
    },
  };
}

function buildBlank(
  words: WordTiming[],
  wordIndex: number,
  durationSec: number,
): ClozeBlankParsed {
  const target = words[wordIndex];

  const before = words
    .slice(Math.max(0, wordIndex - CONTEXT_TOKENS), wordIndex)
    .map((w) => w.word)
    .join(" ");
  const after = words
    .slice(wordIndex + 1, wordIndex + 1 + CONTEXT_TOKENS)
    .map((w) => w.word)
    .join(" ");

  // Strip punctuation Whisper occasionally glues onto the word.
  const surface = target.word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  return {
    questionText: `${wordIndex > CONTEXT_TOKENS ? "… " : ""}${before} ____ ${after}${
      wordIndex + 1 + CONTEXT_TOKENS < words.length ? " …" : ""
    }`.trim(),
    answer: [surface],
    audioStart: Math.max(0, Math.floor(target.start - LOOP_PAD_SEC)),
    audioEnd: Math.min(
      Math.max(durationSec, 1),
      Math.ceil(target.end + LOOP_PAD_SEC),
    ),
  };
}

/* ------------------------------------------------------------------ */
/*  Import — step 2: confirmed insert (D-5: only text + timings)       */
/* ------------------------------------------------------------------ */

export async function confirmPodcastCloze(input: {
  url: string;
  title: string;
  source?: string | null;
  payload: ClozePayload;
}): Promise<{ setId: string }> {
  const user = await requireFeature("quiz");
  // Re-validate the client-held preview payload before trusting it
  const payload = ClozePayloadSchema.parse(input.payload);

  const setId = randomUUID();
  const passageId = randomUUID();

  // All-or-nothing: a mid-way failure must not leave an empty set / blank-less passage.
  await db.transaction(async (tx) => {
    await tx.insert(quizSets).values({
      id: setId,
      userId: user.id,
      exam: "podcast",
      number: null,
      section: "dictation",
      title: input.title.trim() || "Untitled episode",
      source: input.source?.trim() || null,
    });

    await tx.insert(quizPassages).values({
      id: passageId,
      setId,
      orderIndex: 0,
      text: payload.transcript,
      audioUrl: input.url,
      sourceType: "asr",
      sourceUrl: input.url,
      mediaDuration: payload.durationSec,
    });

    await tx.insert(quizQuestions).values(
      payload.blanks.map((blank, index) => ({
        id: randomUUID(),
        passageId,
        orderIndex: index,
        type: "fill_blank" as const,
        questionText: blank.questionText,
        options: null,
        answer: blank.answer,
        explanation: null,
        audioStart: blank.audioStart,
        audioEnd: blank.audioEnd,
      })),
    );
  });

  revalidatePath("/quiz");
  return { setId };
}
