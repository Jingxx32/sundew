"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Loader2, PenLine } from "lucide-react";

import { quickWrite } from "@/lib/actions/tasks";
import { userErrorMessage } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { MembersOnlyNote } from "@/components/members-only-note";
import { useFeatureLocked } from "@/components/access-context";

/** One-click entry into the writing loop: generates an archive-driven task
 *  (no document required) and redirects to the task stage. */
export function QuickWriteButton({ compact = false }: { compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = useFeatureLocked("writing");

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await quickWrite(); // redirects on success
      } catch (err) {
        unstable_rethrow(err); // the success redirect
        setError(userErrorMessage(err, "Task generation failed. Try again."));
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
        <MembersOnlyNote feature="writing" />
      ) : (
        !compact && (
          <p className="text-xs text-muted-foreground">
            A prompt tuned to your error profile — no document needed.
          </p>
        )
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
