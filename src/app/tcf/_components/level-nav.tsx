"use client";

import { cn } from "@/lib/utils";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";
import { groupQuestionsByTest } from "@/lib/tcf/drill-nav";
import type { TcfLearningStatus } from "@/lib/tcf/learning";

interface LevelNavProps {
  questions: TcfQuestionForDrill[];
  currentIndex: number;
  onSelect: (index: number) => void;
  statusByQuestion: Record<string, TcfLearningStatus>;
  completedIds: Set<string>;
}

const STATUS_STYLE: Record<TcfLearningStatus, string> = {
  unseen: "bg-surface-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
  needs_review: "bg-danger-soft text-danger hover:bg-danger-soft",
  in_progress: "bg-warning-soft text-warning hover:bg-warning-soft",
  stable: "bg-success-soft text-success hover:bg-success-soft",
};

export function LevelNav({ questions, currentIndex, onSelect, statusByQuestion, completedIds }: LevelNavProps) {
  const answeredCount = questions.reduce((count, question) => count + (completedIds.has(question.id) ? 1 : 0), 0);
  const reviewCount = questions.reduce((count, question) => count + (statusByQuestion[question.id] === "needs_review" ? 1 : 0), 0);
  const groups = groupQuestionsByTest(questions);
  return (
    <nav className="w-[180px] shrink-0 space-y-4" aria-label="Navigation des questions">
      <div className="space-y-1 text-[11px] text-muted-foreground"><p>{answeredCount} répondue{answeredCount > 1 ? "s" : ""}</p><p className={reviewCount > 0 ? "text-danger" : undefined}>{reviewCount} à revoir</p></div>
      <div className="space-y-3">{groups.map((group) => (
        <div key={group.testNumber} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-subtle-foreground">Test {group.testNumber}</p>
          <div className="flex flex-wrap gap-1">{group.entries.map(({ question, index }) => {
            const isCurrent = index === currentIndex;
            const status = statusByQuestion[question.id] ?? "unseen";
            return <button key={question.id} type="button" onClick={() => onSelect(index)} title={`Test ${group.testNumber} · question ${question.orderIndex} · ${status.replace("_", " ")}`} className={cn("relative h-7 w-7 rounded text-xs font-medium transition-colors", isCurrent ? "bg-accent text-accent-foreground" : STATUS_STYLE[status])}>{question.orderIndex}{completedIds.has(question.id) && !isCurrent && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-current" />}</button>;
          })}</div>
        </div>
      ))}</div>
      <p className="text-[10px] leading-relaxed text-subtle-foreground">Gris · non abordée<br />Orange · en cours<br />Rouge · à revoir<br />Vert · stable</p>
    </nav>
  );
}
