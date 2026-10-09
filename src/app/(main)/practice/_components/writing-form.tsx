"use client";

import { useTransition, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MembersOnlyNote } from "@/components/members-only-note";
import { useFeatureLocked } from "@/components/access-context";
import { createSubmission } from "@/lib/actions/tasks";

type Props = {
  taskId: string;
  minWordCount: number;
  maxWordCount: number;
};

function countWords(text: string): number {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

export function WritingForm({ taskId, minWordCount, maxWordCount }: Props) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const locked = useFeatureLocked("writing");

  const words = text.trim() ? countWords(text) : 0;
  const belowMin = words > 0 && words < minWordCount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || isPending || locked) return;
    startTransition(async () => {
      await createSubmission(taskId, text.trim());
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Écrivez votre réponse en français…"
        disabled={isPending || locked}
        rows={12}
        className="w-full text-base leading-relaxed resize-none rounded-xl border border-border bg-surface px-5 py-4 text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 transition-colors"
      />

      <div className="flex items-center justify-between gap-4">
        {/* Word count indicator */}
        <p className="text-xs">
          {words === 0 ? (
            <span className="text-muted-foreground">
              Target: {minWordCount}–{maxWordCount} words
            </span>
          ) : belowMin ? (
            <span className="text-warning">
              {words} word{words !== 1 ? "s" : ""} — aim for {minWordCount}+
            </span>
          ) : (
            <span className="text-success">
              {words} word{words !== 1 ? "s" : ""}
            </span>
          )}
        </p>

        {locked && <MembersOnlyNote feature="writing" className="mr-auto" />}
        <Button type="submit" disabled={isPending || locked || !text.trim()}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit for Feedback"
          )}
        </Button>
      </div>

      {belowMin && (
        <p className="text-xs text-warning">
          You&apos;re below the minimum — you can still submit, but a longer response gives
          richer feedback.
        </p>
      )}
    </form>
  );
}
