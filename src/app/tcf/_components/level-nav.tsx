"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";
import { groupQuestionsByTest } from "@/lib/tcf/drill-nav";
import type { TcfLearningStatus } from "@/lib/tcf/learning";
import { STATUS_DOT, STATUS_LABELS, STATUS_STYLE } from "@/lib/tcf/display";

interface LevelNavProps {
  questions: TcfQuestionForDrill[];
  currentIndex: number;
  onSelect: (index: number) => void;
  statusByQuestion: Record<string, TcfLearningStatus>;
  completedIds: Set<string>;
}

/** A round of 10/20 fits one row of segments; "Toutes" (200+) does not. */
const STRIP_MAX = 20;

export function LevelNav({ questions, currentIndex, onSelect, statusByQuestion, completedIds }: LevelNavProps) {
  const [expanded, setExpanded] = useState(false);
  const answeredCount = questions.reduce((count, question) => count + (completedIds.has(question.id) ? 1 : 0), 0);
  const reviewCount = questions.reduce(
    (count, question) => count + (statusByQuestion[question.id] === "needs_review" ? 1 : 0),
    0,
  );
  const groups = groupQuestionsByTest(questions);
  const current = questions[currentIndex];
  const showStrip = questions.length <= STRIP_MAX;

  function select(index: number) {
    onSelect(index);
    // Only matters below md, where the grid is a dropdown over the question —
    // collapsing after a pick avoids scrolling back down past it every time.
    setExpanded(false);
  }

  return (
    <nav className="w-full shrink-0 md:w-[190px]" aria-label="Navigation des questions">
      {/* Below md the sidebar becomes a two-line session header: where you are,
          how far along, and — for a 10/20 round — the whole round as one
          tappable strip, so the grid below stays closed most of the time. */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {current ? `Test ${current.testNumber} · Q${current.orderIndex}` : "Navigation"}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="flex items-center gap-1 font-mono text-xs text-muted-foreground touch-manipulation"
          >
            {answeredCount}/{questions.length}
            {reviewCount > 0 && <span className="text-danger">· {reviewCount} à revoir</span>}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          </button>
        </div>

        {showStrip && (
          <div className="mt-1.5 flex gap-1">
            {questions.map((question, index) => {
              const isCurrent = index === currentIndex;
              const status = statusByQuestion[question.id] ?? "unseen";
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => select(index)}
                  aria-label={`Test ${question.testNumber}, question ${question.orderIndex}, ${STATUS_LABELS[status]}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className="flex-1 py-2 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span
                    className={cn(
                      "block rounded-full transition-all",
                      isCurrent ? "h-2 bg-accent" : "h-1.5",
                      isCurrent ? "" : STATUS_DOT[status],
                    )}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn("space-y-4 md:mt-0 md:block", expanded ? "mt-2 block" : "hidden")}>
        <div className="hidden space-y-1 text-[11px] text-muted-foreground md:block">
          <p>
            {answeredCount} répondue{answeredCount > 1 ? "s" : ""}
          </p>
          <p className={reviewCount > 0 ? "text-danger" : undefined}>{reviewCount} à revoir</p>
        </div>

        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.testNumber} className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Test {group.testNumber}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.entries.map(({ question, index }) => {
                  const isCurrent = index === currentIndex;
                  const status = statusByQuestion[question.id] ?? "unseen";
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => select(index)}
                      title={`Test ${group.testNumber} · question ${question.orderIndex} · ${STATUS_LABELS[status]}`}
                      aria-label={`Test ${group.testNumber}, question ${question.orderIndex}, ${STATUS_LABELS[status]}`}
                      className={cn(
                        "relative h-7 w-7 rounded font-mono text-xs font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                        isCurrent ? "bg-accent text-accent-foreground" : STATUS_STYLE[status],
                      )}
                    >
                      {question.orderIndex}
                      {completedIds.has(question.id) && !isCurrent && (
                        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-[11px] text-muted-foreground">
          {(["unseen", "in_progress", "needs_review", "stable"] as const).map((status) => (
            <p key={status} className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
              {STATUS_LABELS[status]}
            </p>
          ))}
        </div>
      </div>
    </nav>
  );
}
