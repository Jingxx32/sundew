import { BookOpen } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { cn } from "@/lib/utils";
import type { WritingTask, Document } from "@/lib/db/schema";

type Props = {
  task: WritingTask;
  doc: Document | null | undefined;
};

export function TaskCard({ task, doc }: Props) {
  const targetWords = (task.targetWords as string[]) ?? [];
  const targetGrammar = (task.targetGrammar as string[]) ?? [];
  const targetLemmas = (task.targetLemmas as string[] | null) ?? [];
  const level = (task.difficulty ?? "B1") as CefrLevel;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-6 space-y-5">
      {/* Source: document title or archive fallback */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="uppercase tracking-wider font-medium">From</span>
        <span className="font-medium text-foreground truncate">
          {doc ? doc.title : "your error archive"}
        </span>
      </div>

      {/* Prompt */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-accent font-medium mb-2">
          Your Task
        </div>
        <p className="text-base leading-relaxed text-foreground">{task.promptEn}</p>
      </div>

      {/* Target words */}
      {targetWords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
            Use
          </span>
          {targetWords.map((w) => (
            <Chip key={w}>
              {w}
            </Chip>
          ))}
        </div>
      )}

      {/* Target grammar */}
      {targetGrammar.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
            Grammar
          </span>
          {targetGrammar.map((g) => (
            <Chip key={g} variant="accent">
              {g.replace(/_/g, " ")}
            </Chip>
          ))}
        </div>
      )}

      {/* Target lemmas: production gaps this task was asked to elicit */}
      {targetLemmas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
            Mots à employer
          </span>
          {targetLemmas.map((l) => (
            <Chip key={l} variant="accent">
              {l}
            </Chip>
          ))}
        </div>
      )}

      {/* Footer: level + word count target */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Aim for {task.minWordCount}–{task.maxWordCount} words
        </p>
        <Chip className={cn(CEFR_CHIP_CLASSES[level])}>{level}</Chip>
      </div>
    </div>
  );
}
