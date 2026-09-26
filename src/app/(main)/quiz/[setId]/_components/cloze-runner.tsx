"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { submitQuizAttempt } from "@/lib/actions/quiz";
import type { QuizPassage, QuizQuestion } from "@/lib/db/schema";

type PassageWithQuestions = QuizPassage & { questions: QuizQuestion[] };

/** Accent-tolerant comparison key: NFC → lowercase → strip diacritics + edge punctuation. */
function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ClozeRunner({
  setId,
  passages,
}: {
  setId: string;
  passages: PassageWithQuestions[];
}) {
  const passage = passages[0];
  const blanks = passage?.questions ?? [];

  const audioRef = useRef<HTMLAudioElement>(null);
  // End of the currently looping window (seconds); null = free playback
  const loopEndRef = useRef<number | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(
    null,
  );
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  if (!passage) return null;

  const submitted = result !== null;
  const answeredCount = blanks.filter(
    (q) => (answers[q.id] ?? "").trim() !== "",
  ).length;

  function playWindow(start: number | null, end: number | null) {
    const audio = audioRef.current;
    if (!audio || start === null) return;
    loopEndRef.current = end;
    audio.currentTime = start;
    void audio.play();
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    const end = loopEndRef.current;
    if (!audio || end === null) return;
    if (audio.currentTime >= end) {
      audio.pause();
      loopEndRef.current = null;
    }
  }

  function gradeBlank(question: QuizQuestion): boolean {
    const accepted = (question.answer ?? []) as string[];
    const given = normalizeAnswer(answers[question.id] ?? "");
    return given !== "" && accepted.some((a) => normalizeAnswer(a) === given);
  }

  function handleSubmit() {
    if (saving || answeredCount === 0) return;
    requestKey.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setSaveError(null);
    startTransition(async () => {
      try {
        const attempt = await submitQuizAttempt({ setId, requestKey: requestKey.current!, answers: blanks.map((question) => ({ questionId: question.id, answer: answers[question.id] ?? "" })) });
        setResult({ score: attempt.score, total: attempt.total });
        setSaved(true);
      } catch {
        setSaved(false);
        setSaveError("The attempt was not saved. Please retry.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* D-5: the one and only audio element, streaming the original URL */}
      <div className="rounded-xl bg-surface shadow-card px-5 py-4">
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={passage.audioUrl ?? undefined}
          onTimeUpdate={handleTimeUpdate}
          className="w-full"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Listen, then fill each blank. The loop button replays just that
          phrase.
        </p>
      </div>

      {/* Blanks */}
      <div className="space-y-4">
        {blanks.map((question, index) => {
          const correct = submitted && gradeBlank(question);
          const accepted = (question.answer ?? []) as string[];
          return (
            <div
              key={question.id}
              className="rounded-xl bg-surface shadow-card px-5 py-4"
            >
              <p className="text-base leading-relaxed mb-3">
                <span className="font-sans text-xs text-muted-foreground mr-2">
                  {index + 1}.
                </span>
                {question.questionText}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() =>
                    playWindow(question.audioStart, question.audioEnd)
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {question.audioStart != null
                    ? formatTime(question.audioStart)
                    : "Loop"}
                </Button>
                <Input
                  value={answers[question.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: e.target.value,
                    }))
                  }
                  disabled={submitted}
                  placeholder="Type what you hear…"
                  className="max-w-xs"
                  lang="fr"
                  autoComplete="off"
                  spellCheck={false}
                />
                {submitted &&
                  (correct ? (
                    <Check className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-danger shrink-0" />
                  ))}
              </div>

              {submitted && (
                <div
                  className={cn(
                    "mt-3 rounded-lg px-3 py-2 text-xs",
                    correct
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger",
                  )}
                >
                  <span className="font-medium">
                    {correct ? "Correct." : "Incorrect."}
                  </span>{" "}
                  {!correct && accepted.length > 0 && (
                    <span>
                      Correct spelling:{" "}
                      <span className="font-medium">
                        {accepted[0]}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapsible transcript */}
      <div className="rounded-xl bg-surface-muted">
        <button
          type="button"
          onClick={() => setTranscriptOpen((open) => !open)}
          className="flex w-full items-center gap-1.5 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {transcriptOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {transcriptOpen ? "Hide transcript" : "Show transcript"}
        </button>
        {transcriptOpen && (
          <article className="reading-prose whitespace-pre-wrap px-5 pb-5">
            {passage.text}
          </article>
        )}
      </div>

      {/* Submit / result bar */}
      {result === null ? (
        <div className="flex items-center justify-between rounded-xl bg-surface-muted px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {answeredCount}/{blanks.length} filled
          </p>
          <Button onClick={handleSubmit} disabled={answeredCount === 0 || saving}>
            {saving ? "Saving…" : saveError ? "Retry saving" : "Check answers"}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-surface shadow-card px-5 py-4">
          <p className="text-xl font-semibold">
            {result.score}/{result.total} correct
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {saving
              ? "Saving attempt…"
              : saved
                ? "Attempt saved."
                : "Attempt could not be saved."}
          </p>
        </div>
      )}
      {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
    </div>
  );
}
