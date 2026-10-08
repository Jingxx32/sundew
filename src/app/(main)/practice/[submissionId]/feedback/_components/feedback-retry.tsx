"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { regenerateFeedback } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { InviteOnlyNote } from "@/components/invite-only-note";
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
  const [failed, setFailed] = useState(false);
  const locked = useFeatureLocked("writing");

  function handleRetry() {
    setFailed(false);
    startTransition(async () => {
      const res = await regenerateFeedback(submissionId);
      if (res.ok) {
        router.refresh();
      } else {
        setFailed(true);
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
          ? "The background job seems to have died (this can happen if the server restarted). Your writing is safe — retry now."
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
      {locked && <InviteOnlyNote className="justify-center" />}
      {failed && (
        <p className="text-xs text-danger">
          Still failing. Wait a moment and retry, or check your API key.
        </p>
      )}
    </div>
  );
}
