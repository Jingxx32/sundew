"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { regenerateFeedback } from "@/lib/actions/tasks";
import { userErrorMessage } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { MembersOnlyNote } from "@/components/members-only-note";
import { useFeatureLocked } from "@/components/access-context";

export function FeedbackRetry({
  submissionId,
  stalePending = false,
}: {
  submissionId: string;
  /** True when the submission is stuck in 'pending' past the staleness window
   *  (background job likely died) rather than having failed outright. */
  stalePending?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = useFeatureLocked("writing");

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await regenerateFeedback(submissionId);
        if (res.ok) router.refresh();
        else setError("Still failing. Wait a moment and retry.");
      } catch (err) {
        setError(userErrorMessage(err, "Still failing. Wait a moment and retry."));
      }
    });
  }

  return (
    <div className="max-w-md mx-auto rounded-2xl bg-surface shadow-card px-8 py-10 text-center space-y-4">
      <h2 className="text-xl font-semibold">
        {stalePending ? "Feedback is taking too long" : "Feedback generation failed"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {stalePending
          ? "Feedback stopped before it finished. Your writing is saved — try again."
          : "Your writing is saved. The AI feedback didn't come through — this can happen on a timeout or rate limit. Try again."}
      </p>
      <Button onClick={handleRetry} disabled={pending || locked}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Retry feedback
          </>
        )}
      </Button>
      {locked && <MembersOnlyNote feature="writing" className="justify-center" />}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
