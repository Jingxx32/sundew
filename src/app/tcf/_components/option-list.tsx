"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OptionListProps {
  options: string[];
  chosen: number | undefined;
  answer: number;
  /** Answer is visible — either this question was answered (drill) or the exam is finished. */
  revealed: boolean;
  /** image / spoken_options questions keep option text hidden until revealed — the audio is the question. */
  audioOnly: boolean;
  onChoose: (index: number) => void;
  /** Per-option one-line rationale from the verdict block, for drills only. */
  why?: (string | null)[];
}

export function OptionList({ options, chosen, answer, revealed, audioOnly, onChoose, why }: OptionListProps) {
  return (
    // Plain toggle buttons, not the ARIA radiogroup pattern — arrow keys are
    // already claimed by useQuestionKeyboardNav for question-to-question
    // navigation, so the roving-tabindex radio convention would conflict
    // with it. Each option stays independently focusable via Tab.
    <div className="space-y-1.5" role="group" aria-label="Choisissez une réponse">
      {options.map((option, index) => {
        const isCorrect = index === answer;
        const isChosen = chosen === index;
        const wrong = revealed && isChosen && !isCorrect;
        const showText = !audioOnly || revealed;
        const line = revealed ? why?.[index] : null;

        return (
          <div key={index}>
            <button
              type="button"
              aria-pressed={isChosen}
              aria-disabled={revealed}
              onClick={() => { if (!revealed) onChoose(index); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-[15px] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                revealed && isCorrect
                  ? "border-success/40 bg-success-soft text-success"
                  : wrong
                    ? "border-danger/40 bg-danger-soft text-danger"
                    : revealed
                      ? "border-border/60 bg-surface text-foreground"
                      : isChosen
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-border/60 bg-surface text-foreground hover:border-accent/30 hover:bg-accent-soft/40 cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-medium",
                  revealed && isCorrect
                    ? "border-success text-success"
                    : wrong
                      ? "border-danger text-danger"
                      : isChosen
                        ? "border-accent text-accent"
                        : "border-border",
                )}
              >
                {revealed && isCorrect ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : wrong ? (
                  <X className="h-3 w-3" aria-hidden="true" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>
              {showText ? (
                <span>{option}</span>
              ) : (
                <span className={isChosen ? "" : "text-muted-foreground"}>Proposition {String.fromCharCode(65 + index)}</span>
              )}
            </button>
            {/* Sits under its own option so the eye never leaves what it explains. */}
            {line && (
              <p className={cn("mt-1 pl-8 pr-3 text-[13px] leading-relaxed", isCorrect ? "text-success" : "text-muted-foreground")}>
                {line}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
