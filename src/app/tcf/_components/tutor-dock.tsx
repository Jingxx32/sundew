"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TutorPanel, type TutorStatus } from "./tutor-panel";

function SundewSymbol() {
  return (
    <Image
      src="/assets/sundew-logo-assets/sundew-symbol-3d-512.png"
      alt=""
      width={48}
      height={48}
      className="size-6 shrink-0"
    />
  );
}

/**
 * The tutor chat as a dock: a bar bottom-right that expands into a chat window and
 * collapses back. Collapsing only hides the window, so a streaming answer keeps going.
 * No overlay: the question and its text stay readable while the learner chats.
 */
export function TutorDock({
  questionId,
  chosen,
  revealed,
  aboveNav,
}: {
  questionId: string;
  chosen: number | null;
  /** False before the learner answers; see TutorPanel. */
  revealed: boolean;
  /** True when the page has the fixed "Précédent / Suivant" bar at the bottom (mobile). */
  aboveNav: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(false);
  const windowId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const lastStatus = useRef<TutorStatus>({ answers: 0, streaming: false });

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // An answer that finishes while collapsed marks the bar unread. Loading the saved
  // thread also raises the count, but without a stream, so it does not.
  const handleStatus = useCallback((s: TutorStatus) => {
    const prev = lastStatus.current;
    if (s.answers > prev.answers && (prev.streaming || s.streaming) && !openRef.current) setUnread(true);
    lastStatus.current = s;
    setAnswers(s.answers);
    setStreaming(s.streaming);
  }, []);

  useEffect(() => {
    if (!open) return;
    // While hidden the thread cannot follow new text, so jump to the latest on opening.
    const thread = windowRef.current?.querySelector<HTMLElement>("[data-tutor-scroll]");
    if (thread) thread.scrollTop = thread.scrollHeight;
    // On a phone the keyboard would cover the sheet; focus the input on wider screens only.
    if (window.matchMedia("(min-width: 768px)").matches) windowRef.current?.querySelector("textarea")?.focus();
  }, [open]);

  function collapse() {
    setOpen(false);
    requestAnimationFrame(() => barRef.current?.focus());
  }

  const status = streaming
    ? "…"
    : answers > 0
      ? `${answers} réponse${answers > 1 ? "s" : ""}`
      : "Posez une question";

  return (
    <>
      {!open && (
        <button
          ref={barRef}
          type="button"
          aria-expanded={false}
          aria-controls={windowId}
          aria-label={`Ouvrir le tuteur · ${status}${unread ? " · nouvelle réponse" : ""}`}
          onClick={() => {
            setOpen(true);
            setUnread(false);
          }}
          className={cn(
            "fixed inset-x-3 z-30 flex h-12 items-center gap-2 rounded-[var(--radius-button)] border border-border bg-surface px-4 text-sm shadow-lg transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "md:inset-x-auto md:bottom-6 md:right-6",
            aboveNav ? "bottom-[calc(4.25rem+env(safe-area-inset-bottom))]" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]",
          )}
        >
          <SundewSymbol />
          <span className="font-semibold text-foreground">Tuteur</span>
          <span className="text-muted-foreground">· {status}</span>
          {unread && <span aria-hidden="true" className="size-2 rounded-full bg-danger" />}
          <ChevronUp aria-hidden="true" className="ml-auto size-4 text-muted-foreground md:ml-2" />
        </button>
      )}

      <div
        ref={windowRef}
        id={windowId}
        role="dialog"
        aria-modal="false"
        aria-label="Tuteur"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            collapse();
          }
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col rounded-t-2xl border border-border bg-surface shadow-xl",
          "md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(560px,calc(100dvh-6rem))] md:w-[380px] md:rounded-2xl",
          !open && "hidden",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <SundewSymbol />
          <span className="text-sm font-semibold text-foreground">Tuteur</span>
          {streaming && <span className="text-sm text-muted-foreground">…</span>}
          <Button variant="ghost" size="icon" aria-label="Réduire" className="ml-auto" onClick={collapse}>
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <TutorPanel questionId={questionId} chosen={chosen} revealed={revealed} onStatus={handleStatus} />
        </div>
      </div>
    </>
  );
}
