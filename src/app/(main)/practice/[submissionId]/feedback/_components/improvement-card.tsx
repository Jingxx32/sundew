import type { FeedbackResult } from "@/lib/ai/feedback";

type ImprovementItem = FeedbackResult["improvements"][number];

type Props = {
  improvement: ImprovementItem;
  index: number;
};

export function ImprovementCard({ improvement, index }: Props) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Style tip {index + 1}
      </div>

      <div className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Original
        </div>
        <p className="text-sm text-muted-foreground">{improvement.original}</p>
      </div>

      <div className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Suggestion
        </div>
        <p className="text-sm font-medium text-foreground">{improvement.suggestion}</p>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{improvement.explanation_en}</p>
    </div>
  );
}
