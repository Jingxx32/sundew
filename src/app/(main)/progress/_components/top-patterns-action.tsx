"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { practiceFromPattern } from "@/lib/actions/tasks";
import { InviteOnlyNote } from "@/components/invite-only-note";
import { useFeatureLocked } from "@/components/access-context";
import type { ErrorCategory } from "@/lib/taxonomy";

type Props = {
  category: ErrorCategory;
  subcategory: string;
};

export function PracticeFromPatternButton({ category, subcategory }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = useFeatureLocked("writing");

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const taskId = await practiceFromPattern(category, subcategory);
        router.push(`/practice?taskId=${taskId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate task.";
        setError(message);
      }
    });
  }

  if (locked) return <InviteOnlyNote />;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </>
        ) : (
          <>Practice →</>
        )}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
