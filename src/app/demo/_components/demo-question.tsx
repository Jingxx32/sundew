"use client";

import { useState } from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUESTION_OPTIONS = [
  "Ils devront payer une pénalité avant lundi.",
  "Ils auront plus de temps pour rendre certains documents.",
  "Ils ne pourront rendre aucun document pendant le week-end.",
  "Ils pourront emprunter des livres avec le nouveau système.",
] as const;

const DRILL_OPTIONS = ["car", "malgré", "pourtant"] as const;
const CORRECT_ANSWER = 1;
const CORRECT_DRILL_ANSWER = 0;

type DemoPhase = "question" | "feedback" | "drill";

function Choice({
  index,
  label,
  selected,
  correct,
  revealed,
  onClick,
}: {
  index: number;
  label: string;
  selected: boolean;
  correct: boolean;
  revealed: boolean;
  onClick: () => void;
}) {
  const wrong = revealed && selected && !correct;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={revealed}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-6 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:opacity-100",
        revealed && correct
          ? "border-success/40 bg-success-soft text-success"
          : wrong
            ? "border-danger/40 bg-danger-soft text-danger"
            : selected
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-border bg-surface hover:border-accent/35 hover:bg-accent-soft/40",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold",
          revealed && correct
            ? "border-success"
            : wrong
              ? "border-danger"
              : selected
                ? "border-accent"
                : "border-border text-muted-foreground",
        )}
      >
        {revealed && correct ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : wrong ? (
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          String.fromCharCode(65 + index)
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function DemoQuestion() {
  const [phase, setPhase] = useState<DemoPhase>("question");
  const [answer, setAnswer] = useState<number | null>(null);
  const [drillAnswer, setDrillAnswer] = useState<number | null>(null);

  const questionRevealed = phase !== "question";
  const answerIsCorrect = answer === CORRECT_ANSWER;
  const drillRevealed = drillAnswer !== null;
  const drillIsCorrect = drillAnswer === CORRECT_DRILL_ANSWER;

  function chooseAnswer(index: number) {
    if (phase !== "question") return;
    setAnswer(index);
    setPhase("feedback");
  }

  function restart() {
    setAnswer(null);
    setDrillAnswer(null);
    setPhase("question");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.42fr)_minmax(290px,0.58fr)]">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7" aria-labelledby="demo-question-title">
        {phase !== "drill" ? (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Compréhension écrite · B1
                </p>
                <h3 id="demo-question-title" className="mt-1 text-xl font-bold tracking-[-0.025em]">
                  Question 1 of 1
                </h3>
              </div>
              <span className="rounded-full bg-surface-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
                01:30
              </span>
            </div>

            <div className="rounded-xl bg-surface-muted px-5 py-4 sm:px-6 sm:py-5">
              <p className="reading-prose !text-[1.05rem] !leading-7">
                La bibliothèque du quartier fermera exceptionnellement à 17 h vendredi afin de permettre
                l’installation d’un nouveau système informatique. Les documents qui arrivent à échéance ce
                jour-là pourront être rendus jusqu’au lundi suivant sans pénalité. La boîte de retour extérieure
                restera accessible pendant toute la fin de semaine.
              </p>
            </div>

            <p className="mb-4 mt-6 font-semibold leading-6">
              Quelle conséquence la fermeture aura-t-elle pour les usagers ?
            </p>

            <div className="space-y-2" role="group" aria-label="Choose an answer">
              {QUESTION_OPTIONS.map((option, index) => (
                <Choice
                  key={option}
                  index={index}
                  label={option}
                  selected={answer === index}
                  correct={index === CORRECT_ANSWER}
                  revealed={questionRevealed}
                  onClick={() => chooseAnswer(index)}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  Targeted micro-drill
                </p>
                <h3 id="demo-question-title" className="mt-1 text-xl font-bold tracking-[-0.025em]">
                  Make the causal link explicit
                </h3>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1.5 font-mono text-xs font-semibold text-accent">
                1 min
              </span>
            </div>

            <div className="rounded-xl bg-surface-blue px-5 py-7 sm:px-7">
              <p className="reading-prose !mb-0 !text-[1.15rem] !leading-8">
                La réunion a été reportée _____ le directeur était absent.
              </p>
            </div>

            <p className="mb-4 mt-6 font-semibold">Choose the connector that expresses a cause.</p>
            <div className="space-y-2" role="group" aria-label="Choose a connector">
              {DRILL_OPTIONS.map((option, index) => (
                <Choice
                  key={option}
                  index={index}
                  label={option}
                  selected={drillAnswer === index}
                  correct={index === CORRECT_DRILL_ANSWER}
                  revealed={drillRevealed}
                  onClick={() => {
                    if (!drillRevealed) setDrillAnswer(index);
                  }}
                />
              ))}
            </div>

            {drillRevealed && (
              <div
                className={cn(
                  "mt-5 rounded-xl border px-4 py-4",
                  drillIsCorrect
                    ? "border-success/30 bg-success-soft"
                    : "border-danger/30 bg-danger-soft",
                )}
                role="status"
              >
                <p className={cn("font-semibold", drillIsCorrect ? "text-success" : "text-danger")}>
                  {drillIsCorrect ? "Signal understood." : "The cause connector is car."}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  “Car” introduces the reason the meeting was postponed. This is the same reading signal used in
                  the library question.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="relative overflow-hidden rounded-2xl bg-foreground p-5 text-white sm:p-7" aria-live="polite">
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-[57%_43%_63%_37%/42%_51%_49%_58%] bg-primary/30" aria-hidden="true" />
        <div className="relative flex min-h-[390px] flex-col">
          {phase === "question" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Your learning signal</p>
              <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em]">Answer once. Learn what to train next.</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Choose an answer to reveal the reasoning pattern behind the question—not only the correct letter.
              </p>
              <div className="mt-auto space-y-3 pt-10">
                {["Exam-style task", "Explain the reasoning", "Generate the next drill"].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 border-t border-white/15 pt-3">
                    <span className="font-mono text-xs text-white/45">0{index + 1}</span>
                    <span className={cn("text-sm", index === 0 ? "font-semibold text-white" : "text-white/55")}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : phase === "feedback" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Answer explained</p>
              <div className="mt-5 flex items-center gap-3">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", answerIsCorrect ? "bg-success" : "bg-focus-star")}>
                  {answerIsCorrect ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                </span>
                <p className="text-lg font-bold">{answerIsCorrect ? "Correct" : "Not quite"}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/75">
                The early closure changes the Friday deadline: documents due that day may be returned on Monday
                without penalty. The weekend drop box is an extra detail, not the main consequence.
              </p>

              <div className="mt-6 border-l-2 border-focus-star pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Detected signal</p>
                <p className="mt-1 font-semibold">Cause → consequence</p>
                <p className="mt-1 text-sm leading-6 text-white/65">Reading · explicit detail · B1</p>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={() => setPhase("drill")}
                className="mt-auto w-full bg-white text-foreground hover:bg-white/90"
              >
                Practise this signal
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Learning loop</p>
              <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em]">One error becomes the next useful minute.</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">
                The private product can remember this signal across sessions. The public demo keeps it only in this
                browser tab.
              </p>
              <div className="mt-8 space-y-4">
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white" />
                  <div>
                    <p className="text-sm font-semibold">Exam evidence</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">A causal link appeared in the answer.</p>
                  </div>
                </div>
                <div className="ml-[3px] h-7 w-px bg-white/20" />
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-focus-star" />
                  <div>
                    <p className="text-sm font-semibold">Focused follow-up</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">A shorter task checks the same signal.</p>
                  </div>
                </div>
              </div>
              {drillRevealed && (
                <Button
                  type="button"
                  size="lg"
                  onClick={restart}
                  className="mt-auto w-full bg-white text-foreground hover:bg-white/90"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Replay the demo
                </Button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
