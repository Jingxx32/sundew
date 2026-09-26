"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { createMicroDrill, getMicroDrillsForError, retryMicroDrillFeedback, type MicroDrillView } from "@/lib/actions/errors";
import type { MicroDrillFeedback } from "@/lib/ai/micro-drill";

type Props = {
  errorId: string;
  microDrill: string;
  original: string;
  correction: string;
};

export function MicroDrillDialog({ errorId, microDrill, original, correction }: Props) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState("");
  const [feedback, setFeedback] = useState<MicroDrillFeedback | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<MicroDrillView | null>(null);
  const requestKey = useRef<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [priorAttempts, setPriorAttempts] = useState<MicroDrillView[]>([]);
  const [isPending, startTransition] = useTransition();

  // Load prior attempts whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    getMicroDrillsForError(errorId)
      .then(setPriorAttempts)
      .catch(() => {});
  }, [open, errorId]);

  function handleSubmit() {
    if (!response.trim()) {
      setErrorMsg("Please write at least one sentence before submitting.");
      return;
    }
    setErrorMsg(null);
    requestKey.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    startTransition(async () => {
      try {
        const result = await createMicroDrill(errorId, response, requestKey.current!);
        setCurrentAttempt(result);
        setFeedback(result.feedbackJson);
        setPriorAttempts((prev) => [result, ...prev.filter((item) => item.id !== result.id)]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleRetryFeedback() {
    if (!currentAttempt) return;
    startTransition(async () => {
      try {
        const result = await retryMicroDrillFeedback(currentAttempt.id);
        setCurrentAttempt(result);
        setFeedback(result.feedbackJson);
        setPriorAttempts((prev) => prev.map((item) => item.id === result.id ? result : item));
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Feedback is unavailable.");
      }
    });
  }

  function handleNewAttempt() {
    setResponse("");
    setFeedback(null);
    setCurrentAttempt(null);
    setErrorMsg(null);
    requestKey.current = null;
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset form state when dialog closes
      setResponse("");
      setFeedback(null);
      setCurrentAttempt(null);
      setErrorMsg(null);
      requestKey.current = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent hover:underline"
      >
        Practice this
      </button>

      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Micro-drill</DialogTitle>
        </DialogHeader>

        {/* Drill prompt */}
        <p className="text-sm leading-relaxed">{microDrill}</p>

        {/* Error context reminder */}
        <div className="rounded-lg bg-surface-muted border border-border/60 p-3 space-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Error: </span>
            <span className="line-through text-muted-foreground">{original}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Correction: </span>
            <span className="font-medium">{correction}</span>
          </div>
        </div>

        {/* Prior attempts — most recent first */}
        {priorAttempts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Prior attempts
            </div>
            {priorAttempts.map((attempt, i) => {
              const fb = attempt.feedbackJson as MicroDrillFeedback | null;
              return (
                <div
                  key={attempt.id ?? i}
                  className="rounded-lg border border-border p-3 text-xs space-y-1.5"
                >
                  <p>{attempt.responseFr}</p>
                  {fb && (
                    <p
                      className={
                        fb.ok ? "text-success font-medium" : "text-muted-foreground"
                      }
                    >
                      {fb.ok ? "✓ " : ""}
                      {fb.comments[0]}
                    </p>
                  )}
                  {!fb && <p className="text-muted-foreground">Response saved · feedback {attempt.feedbackStatus}</p>}
                  {!fb && <button type="button" onClick={() => {
                    setCurrentAttempt(attempt);
                    setResponse(attempt.responseFr);
                    setFeedback(null);
                    setErrorMsg(null);
                  }} className="font-medium text-accent hover:underline">Open saved response</button>}
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback panel (shown after submission) */}
        {feedback ? (
          <div
            className={`rounded-xl p-4 space-y-3 ${
              feedback.ok
                ? "bg-success-soft border border-success/20"
                : "bg-surface border border-border"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.ok && <Check className="h-4 w-4 text-success" />}
              <span
                className={`text-sm font-medium ${
                  feedback.ok ? "text-success" : "text-foreground"
                }`}
              >
                {feedback.ok ? "Good work!" : "Keep practising"}
              </span>
            </div>
            <ul className="space-y-1">
              {feedback.comments.map((c, i) => (
                <li key={i} className="text-sm">
                  {c}
                </li>
              ))}
            </ul>
            {feedback.better_examples.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Better examples
                </div>
                {feedback.better_examples.map((ex, i) => (
                  <p key={i} className="text-sm">
                    {ex}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : currentAttempt ? (
          <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
            <p>Your response was saved. Feedback is {currentAttempt.feedbackStatus}.</p>
            {errorMsg && <p role="alert" className="mt-2 text-danger">{errorMsg}</p>}
          </div>
        ) : (
          /* Response textarea */
          <div className="space-y-2">
            <Textarea
              aria-label="Your French response"
              className="h-24 min-h-0 resize-none text-sm leading-relaxed"
              placeholder="Write 2 sentences in French using the correct form…"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              disabled={isPending}
            />
            {errorMsg && <p className="text-xs text-danger" role="alert">{errorMsg}</p>}
          </div>
        )}

        <DialogFooter>
          {feedback ? (
            <Button variant="outline" size="sm" onClick={handleNewAttempt}>
              New attempt
            </Button>
          ) : currentAttempt ? (
            <Button size="sm" onClick={handleRetryFeedback} disabled={isPending || currentAttempt.feedbackStatus === "ready"}>
              {isPending ? "Checking…" : "Retry feedback"}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                {isPending ? "Checking…" : "Submit"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
