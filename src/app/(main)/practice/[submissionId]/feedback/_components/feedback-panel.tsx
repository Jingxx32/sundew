import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { ErrorRecord } from "@/lib/db/schema";
import type { FeedbackResult } from "@/lib/ai/feedback";
import { batchGetRules } from "@/lib/actions/errors";
import { ErrorCard } from "./error-card";
import { ImprovementCard } from "./improvement-card";
import { PraiseCard } from "./praise-card";

type Props = {
  feedback: FeedbackResult | null;
  errors: ErrorRecord[];
};

const CATEGORY_ORDER = Object.keys(ERROR_TAXONOMY) as ErrorCategory[];

export async function FeedbackPanel({ feedback, errors }: Props) {
  if (!feedback) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-6 space-y-4">
        <div className="text-[11px] uppercase tracking-wider text-accent font-medium">
          Feedback
        </div>
        <p className="text-sm text-warning bg-warning-soft rounded-lg p-3">
          Feedback generation failed. Your writing has been saved — please try refreshing.
        </p>
      </div>
    );
  }

  const praise = (feedback.praise as string[]) ?? [];
  const improvements = feedback.improvements ?? [];

  // Batch-fetch rules for all errors on this page
  const ruleIds = [...new Set(errors.map((e) => e.ruleId).filter(Boolean) as string[])];
  const ruleMap = await batchGetRules(ruleIds);

  // Group errors by category while preserving original DB-order index (for #error-N links)
  const byCategory = new Map<ErrorCategory, { error: ErrorRecord; index: number }[]>();
  errors.forEach((err, index) => {
    const cat = err.category as ErrorCategory;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ error: err, index });
  });

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-6 space-y-5">
      <div className="text-[11px] uppercase tracking-wider text-accent font-medium">Feedback</div>

      {/* Praise first */}
      {praise.length > 0 && <PraiseCard praise={praise} />}

      {/* Errors grouped by category in taxonomy declaration order */}
      {errors.length === 0 ? (
        <div className="rounded-xl bg-success-soft border border-success/20 p-4 text-center space-y-1">
          <p className="text-success font-medium text-sm">Clean run!</p>
          <p className="text-xs text-muted-foreground">No errors found. Keep writing!</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Errors ({errors.length})
          </div>
          {CATEGORY_ORDER.flatMap((cat) => {
            const group = byCategory.get(cat);
            if (!group) return [];
            return group.map(({ error, index }) => (
              <ErrorCard
                key={error.id}
                error={error}
                index={index}
                rule={error.ruleId ? (ruleMap.get(error.ruleId) ?? null) : null}
              />
            ));
          })}
        </div>
      )}

      {/* Style improvements last */}
      {improvements.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Style suggestions ({improvements.length})
          </div>
          {improvements.map((imp, i) => (
            <ImprovementCard key={i} improvement={imp} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
