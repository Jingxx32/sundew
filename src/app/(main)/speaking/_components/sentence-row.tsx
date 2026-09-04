"use client";

import { useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import type { TurnAssessment } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { useWavRecorder } from "./use-wav-recorder";
import { WordScores } from "./word-scores";

export type SentenceResult = { transcript: string } & TurnAssessment;

type Props = {
  index: number;
  sentence: string;
  sessionId: string | null;
  result: SentenceResult | null;
  onResult: (r: SentenceResult) => void;
};

export function SentenceRow({ index, sentence, sessionId, result, onResult }: Props) {
  const { isRecording, start, stop, error: micError } = useWavRecorder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    if (!isRecording) {
      await start().catch(() => {});
      return;
    }
    setBusy(true);
    try {
      const blob = await stop();
      const form = new FormData();
      form.append("audio", blob, "sentence.wav");
      form.append("referenceText", sentence);
      if (sessionId) {
        form.append("sessionId", sessionId);
        form.append("orderIndex", String(index));
      }
      const res = await fetch("/api/speaking/assess", { method: "POST", body: form });
      if (res.status === 422) {
        setError("No speech detected — try again, a bit louder.");
        return;
      }
      if (!res.ok) {
        setError("Scoring failed — check server logs and Azure credentials.");
        return;
      }
      onResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const active = sessionId !== null;

  return (
    <li className="rounded-xl border border-border/70 px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          onClick={handleToggle}
          disabled={!active || busy}
          title={active ? (isRecording ? "Stop" : "Record") : "Start practice first"}
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            isRecording
              ? "bg-danger text-white animate-pulse"
              : active
                ? "bg-accent-soft text-accent hover:bg-accent hover:text-white"
                : "bg-surface-muted text-subtle-foreground",
          )}
        >
          {busy ? (
            <RotateCcw className="h-3.5 w-3.5 animate-spin" />
          ) : isRecording ? (
            <Square className="h-3 w-3" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {result ? (
            <WordScores words={result.words} />
          ) : (
            <p className="text-[15px] leading-relaxed">{sentence}</p>
          )}
          {result && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono text-accent">{Math.round(result.pronunciationScore)}</span>
              {" · "}accuracy {Math.round(result.accuracyScore)} · fluency{" "}
              {Math.round(result.fluencyScore)}
            </p>
          )}
          {(error || micError) && <p className="mt-1 text-xs text-danger">{error ?? micError}</p>}
        </div>
      </div>
    </li>
  );
}
