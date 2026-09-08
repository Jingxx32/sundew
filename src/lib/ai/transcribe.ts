// Plain server module (not a "use server" Server Action file): called only from
// server actions in lib/actions, never directly from the client.

import { toFile } from "openai";
import { getOpenAI, MODELS } from "./client";

export type WordTiming = { word: string; start: number; end: number };

export type TranscribeResult =
  | { ok: true; text: string; words: WordTiming[]; durationSec: number }
  | { ok: false; error: "too_large" | "fetch_failed" | "transcribe_failed" };

/** Whisper hard limit on a single uploaded file. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function transcribePodcast(
  mp3Url: string,
): Promise<TranscribeResult> {
  let buf: Buffer;
  try {
    const res = await fetch(mp3Url, { redirect: "follow" });
    if (!res.ok) return { ok: false, error: "fetch_failed" };

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_AUDIO_BYTES) {
      return { ok: false, error: "too_large" };
    }

    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return { ok: false, error: "fetch_failed" };
  }

  // CDNs sometimes omit or understate Content-Length — re-check the real size.
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: "too_large" };
  }

  try {
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: await toFile(buf, "episode.mp3"),
      model: MODELS.transcribe,
      language: "fr",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words: WordTiming[] = (transcription.words ?? []).map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    }));

    if (!transcription.text?.trim() || words.length === 0) {
      return { ok: false, error: "transcribe_failed" };
    }

    return {
      ok: true,
      text: transcription.text,
      words,
      durationSec: Math.round(
        transcription.duration ?? words[words.length - 1].end,
      ),
    };
  } catch {
    return { ok: false, error: "transcribe_failed" };
  }
}
