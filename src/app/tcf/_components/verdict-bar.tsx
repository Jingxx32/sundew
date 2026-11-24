import { cn } from "@/lib/utils";
import type { TcfExplanationMeta } from "@/lib/db/schema";

/**
 * The three lines worth reading in the first seconds after answering: what you
 * picked, what was right, and the one thing in the text that decides it. The
 * result line is always shown; the key point only once the learner opens the
 * explanation (`showKeyPoint`), so the answer is not handed over for free.
 */
export function VerdictBar({
  meta,
  chosen,
  answer,
  showKeyPoint,
}: {
  meta: TcfExplanationMeta | null;
  chosen?: number;
  answer: number;
  showKeyPoint: boolean;
}) {
  const letter = (index: number) => String.fromCharCode(65 + index);
  const correct = chosen === answer;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", chosen === undefined ? "border-border/60 bg-surface-muted/60" : correct ? "border-success/40 bg-success-soft" : "border-danger/40 bg-danger-soft")}>
      <p className={cn("text-sm font-medium", chosen === undefined ? "text-muted-foreground" : correct ? "text-success" : "text-danger")}>
        {chosen === undefined
          ? `Bonne réponse : ${letter(answer)}`
          : correct
            ? `Correct · ${letter(answer)}`
            : `Votre réponse : ${letter(chosen)} · Bonne réponse : ${letter(answer)}`}
      </p>
      {showKeyPoint && meta?.keyPoint && (
        <p className="mt-1.5 flex gap-2 text-sm leading-relaxed text-foreground">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          {meta.keyPoint}
        </p>
      )}
    </div>
  );
}
