import { CATEGORY_STYLES } from "@/lib/category-styles";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { RecurringPattern } from "@/lib/actions/errors";
import { PracticeFromPatternButton } from "./top-patterns-action";

type Props = {
  patterns: RecurringPattern[];
};

export function TopPatterns({ patterns }: Props) {
  if (patterns.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Most frequent errors</h2>
      <div className="space-y-3">
        {patterns.map((p) => {
          const style = CATEGORY_STYLES[p.category as ErrorCategory];
          return (
            <div
              key={`${p.category}-${p.subcategory}`}
              className="rounded-xl bg-surface shadow-card p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}
                >
                  {p.category}
                </span>
                <span className="text-xs text-muted-foreground">{p.subcategoryLabel}</span>
              </div>

              {/* Example */}
              {p.exampleOriginal && (
                <div className="flex items-start gap-4 text-xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">
                      Original
                    </span>
                    <span className="line-through text-muted-foreground">
                      {p.exampleOriginal}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">
                      Correction
                    </span>
                    <span className="font-medium">{p.exampleCorrection}</span>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <span className="text-xs text-muted-foreground">{p.count} times</span>
                <PracticeFromPatternButton
                  category={p.category as ErrorCategory}
                  subcategory={p.subcategory}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
