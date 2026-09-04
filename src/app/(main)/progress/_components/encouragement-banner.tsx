import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { getDashboardStats } from "@/lib/actions/errors";

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;

function encouragementText(stats: Stats): string {
  if (stats.totalSubmissions === 0) return "";
  if (stats.mostImprovedCategory) {
    const label =
      ERROR_TAXONOMY[stats.mostImprovedCategory as ErrorCategory]?.label;
    return `Your ${label} errors are trending down — keep it up.`;
  }
  if (stats.totalErrors > 20) {
    return `${stats.totalErrors} errors logged and classified — every one is a step forward.`;
  }
  return "You're building a track record. Submit more tasks to see your trends.";
}

type Props = {
  stats: Stats;
};

export function EncouragementBanner({ stats }: Props) {
  if (stats.totalSubmissions === 0) return null;
  const text = encouragementText(stats);
  if (!text) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface/50 px-6 py-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
