"use client";

import { useState, useTransition, useEffect } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createMicroDrill, getMicroDrillsForError } from "@/lib/actions/errors";
import type { MicroDrillFeedback } from "@/lib/ai/micro-drill";

import type { MicroDrill } from "@/lib/db/schema";

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [priorAttempts, setPriorAttempts] = useState<MicroDrill[]>([]);
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
    startTransition(async () => {
      try {
        const result = await createMicroDrill(errorId, response);
        setFeedback(result);
        // Prepend the new attempt to the list so it shows on a New Attempt reset
        setPriorAttempts((prev) => [
          {
            id: crypto.randomUUID(),
            errorId,
            promptText: microDrill,
            responseFr: response,
            feedbackJson: result,
            createdAt: new Date(),
          },
          ...prev,
        ]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleNewAttempt() {
    setResponse("");
    setFeedback(null);
    setErrorMsg(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset form state when dialog closes
      setResponse("");
      setFeedback(null);
      setErrorMsg(null);
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
        ) : (
          /* Response textarea */
          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed resize-none h-24 focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Write 2 sentences in French using the correct form…"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              disabled={isPending}
            />
            {errorMsg && <p className="text-xs text-danger">{errorMsg}</p>}
          </div>
        )}

        <DialogFooter>
          {feedback ? (
            <Button variant="outline" size="sm" onClick={handleNewAttempt}>
              New attempt
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
