"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushPendingSync, usePendingSyncCount } from "@/lib/tcf/pending-sync";

export function TcfHeader() {
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") === "reading" ? "reading" : "listening";
  const pendingCount = usePendingSyncCount();

  return (
    <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-4 py-3 sm:px-6">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="rounded border border-accent/30 bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-accent">
          TCF
        </span>
        <span className="hidden text-lg font-semibold tracking-tight sm:inline">Canada</span>
      </div>

      <div className="inline-flex shrink-0 rounded-lg border border-border/70 bg-surface p-0.5">
        {(["listening", "reading"] as const).map((s) => (
          <Link
            key={s}
            href={`/tcf?skill=${s}`}
            aria-current={s === skill ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:px-4",
              s === skill
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "listening" ? "Écoute" : "Lecture"}
          </Link>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => void flushPendingSync()}
            title="Ces réponses n'ont pas pu être enregistrées sur le serveur — cliquez pour réessayer maintenant."
            className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-2 py-1 text-xs font-medium text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingCount} non enregistrée{pendingCount > 1 ? "s" : ""}
          </button>
        )}
        <Link
          href="/today"
          aria-label="Retour à Sundew"
          className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Today</span>
        </Link>
      </div>
    </header>
  );
}
