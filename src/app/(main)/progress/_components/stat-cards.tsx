import { CATEGORY_STYLES } from "@/lib/category-styles";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { getDashboardStats } from "@/lib/actions/errors";

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;

type Props = {
  stats: Stats;
};

export function StatCards({ stats }: Props) {
  const { totalSubmissions, totalErrors, activeDays, mostImprovedCategory } = stats;

  const mostImprovedCat = mostImprovedCategory as ErrorCategory | null;
  const mostImprovedLabel = mostImprovedCat
    ? (ERROR_TAXONOMY[mostImprovedCat]?.label ?? mostImprovedCat)
    : null;
  const mostImprovedStyle = mostImprovedCat ? CATEGORY_STYLES[mostImprovedCat] : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="rounded-2xl bg-surface shadow-card p-6">
        <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-foreground">{totalSubmissions}</p>
        <p className="text-xs text-muted-foreground mt-1">writing attempts</p>
      </div>

      <div className="rounded-2xl bg-surface shadow-card p-6">
        <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-foreground">{totalErrors}</p>
        <p className="text-xs text-muted-foreground mt-1">classified errors</p>
      </div>

      <div className="rounded-2xl bg-surface shadow-card p-6">
        <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-foreground">{activeDays}</p>
        <p className="text-xs text-muted-foreground mt-1">days with practice</p>
      </div>

      <div className="rounded-2xl bg-surface shadow-card p-6">
        {mostImprovedLabel && mostImprovedStyle ? (
          <>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${mostImprovedStyle.chip}`}
            >
              {mostImprovedLabel}
            </span>
            <p className="text-xs text-muted-foreground mt-2">compared to last month</p>
          </>
        ) : (
          <>
            <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-1">Not enough data yet</p>
          </>
        )}
      </div>
    </div>
  );
}
