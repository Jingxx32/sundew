"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { markTcfVocabGap } from "@/lib/actions/vocab-gaps";
import type { VocabGapType } from "@/lib/db/schema";

const LABELS: Record<VocabGapType, string> = {
  recognition: "Inconnu",
  listening: "Mal entendu",
  production: "À réemployer",
};

/** Which buttons show, in order; first is the visually-primary default. */
function gapChoices(skill: "listening" | "reading"): VocabGapType[] {
  return skill === "listening" ? ["listening", "recognition", "production"] : ["recognition", "production"];
}

export function MarkGapFloater({
  skill,
  questionId,
  children,
}: {
  skill: "listening" | "reading";
  questionId: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; surface: string; context: string } | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  const onSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return setPopover(null);
    const text = sel.toString().trim();
    // A markable unit is a word or short expression, not a sentence.
    if (!text || text.length > 40 || text.split(/\s+/).length > 4) return setPopover(null);
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return setPopover(null);
    const rect = range.getBoundingClientRect();
    const host = containerRef.current.getBoundingClientRect();
    // ±80 chars of surrounding block text as sentence context
    const block = range.startContainer.parentElement?.textContent ?? "";
    const at = block.indexOf(text);
    const context = at >= 0 ? block.slice(Math.max(0, at - 80), at + text.length + 80).trim() : block.slice(0, 160);
    setState("idle");
    setPopover({ x: rect.left - host.left + rect.width / 2, y: rect.top - host.top, surface: text, context });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [onSelect]);

  function mark(gapType: VocabGapType) {
    if (!popover) return;
    setState("saving");
    markTcfVocabGap({ surface: popover.surface, sentenceContext: popover.context, tcfQuestionId: questionId, gapType })
      .then(() => setState("done"))
      .catch(() => setState("idle"));
    setTimeout(() => setPopover(null), 900);
  }

  return (
    <div ref={containerRef} className="relative">
      {children}
      {popover && (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
          style={{ left: popover.x, top: popover.y - 6 }}
        >
          {state === "saving" ? (
            <Loader2 className="mx-2 my-1 h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : state === "done" ? (
            <Check className="mx-2 my-1 h-3.5 w-3.5 text-accent" aria-hidden="true" />
          ) : (
            <div className="flex items-center gap-1">
              {gapChoices(skill).map((g, i) => (
                <button
                  key={g}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep the selection alive through the click
                    mark(g);
                  }}
                  className={
                    i === 0
                      ? "rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
                      : "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {LABELS[g]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
