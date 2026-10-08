"use client";

import { useState, useTransition } from "react";
import { Loader2, PenLine } from "lucide-react";

import { quickWrite } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { InviteOnlyNote } from "@/components/invite-only-note";
import { useFeatureLocked } from "@/components/access-context";

/** One-click entry into the writing loop: generates an archive-driven task
 *  (no document required) and redirects to the task stage. */
export function QuickWriteButton({ compact = false }: { compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const locked = useFeatureLocked("writing");

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      try {
        await quickWrite(); // redirects on success
      } catch (err) {
        // Next's redirect propagates as a throw — only real errors reach here.
        if (err && typeof err === "object" && "digest" in err) throw err;
        setFailed(true);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={pending || locked} size={compact ? "default" : "lg"}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating your task… ~10s
          </>
        ) : (
          <>
            <PenLine className="h-4 w-4" />
            Écrire maintenant
          </>
        )}
      </Button>
      {locked ? (
        <InviteOnlyNote />
      ) : (
        !compact && (
          <p className="text-xs text-muted-foreground">
            A prompt tuned to your error profile — no document needed.
          </p>
        )
      )}
      {failed && (
        <p className="text-xs text-danger">
          Task generation failed. Check your API key in Settings and retry.
        </p>
      )}
    </div>
  );
}
