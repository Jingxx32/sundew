"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { transcriptPanel } from "@/lib/tcf/reveal";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";
import { ExplanationPanel } from "./explanation-panel";
import { MarkGapFloater } from "./mark-gap-floater";

/** The single control that opens or closes everything the explanation adds. */
export function ExplanationToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button variant="soft" size="sm" onClick={onToggle} aria-expanded={open}>
      {open ? "Masquer l'explication" : "Voir l'explication"}
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
    </Button>
  );
}

/**
 * Transcript and explanation below the question card. The raw transcript stays
 * while collapsed; when the explanation is open and rewrites the recording itself,
 * the rewritten one replaces it (see `transcriptPanel`).
 */
export function AnswerDetails({
  question,
  skill,
  explanationOpen,
  markGaps,
}: {
  question: TcfQuestionForDrill;
  skill: "listening" | "reading";
  explanationOpen: boolean;
  markGaps: boolean;
}) {
  const showRaw =
    transcriptPanel({ transcript: question.transcript, explanation: question.explanation, explanationOpen }) === "raw";

  const raw = (
    <div className="mt-4 rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Transcription</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{question.transcript}</p>
    </div>
  );

  return (
    <>
      {showRaw && (markGaps ? <MarkGapFloater skill={skill} questionId={question.id}>{raw}</MarkGapFloater> : raw)}
      {explanationOpen && question.explanation && (
        <div className="mt-4">
          <ExplanationPanel markdown={question.explanation} />
        </div>
      )}
    </>
  );
}
