import {
  getDrillQueue,
  getConjugationStats,
} from "@/lib/actions/conjugation";
import { DrillCard } from "./_components/drill-card";

export default async function ConjugationPage() {
  const [queue, stats] = await Promise.all([
    getDrillQueue(10),
    getConjugationStats(),
  ]);

  const fromErrorCount = queue.filter((d) => d.fromErrors).length;

  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">
          Conjugation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.totalAttempts === 0
            ? "Type the form, get the verdict — drills are seeded from your error archive."
            : `${stats.totalAttempts} ${stats.totalAttempts === 1 ? "attempt" : "attempts"} · ${Math.round((stats.totalCorrect / stats.totalAttempts) * 100)}% correct overall`}
          {fromErrorCount > 0 &&
            ` · ${fromErrorCount}/${queue.length} of this round from your errors`}
        </p>
      </div>

      <DrillCard queue={queue} />

      {/* D-8: drill mastery per verb/tense, weakest first */}
      {stats.byTarget.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-[11px] uppercase tracking-wider text-subtle-foreground font-medium">
            Mastery by verb · tense
          </h2>
          <div className="space-y-1">
            {stats.byTarget.slice(0, 10).map((t) => (
              <div
                key={`${t.verb}-${t.tense}`}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-surface px-4 py-2 text-sm"
              >
                <span>
                  <span className="font-serif font-medium">{t.verb}</span>
                  <span className="text-muted-foreground"> · {t.tense}</span>
                </span>
                <span
                  className={
                    t.correct === t.attempts
                      ? "text-success text-xs font-medium"
                      : t.correct / t.attempts >= 0.5
                        ? "text-warning text-xs font-medium"
                        : "text-danger text-xs font-medium"
                  }
                >
                  {t.correct}/{t.attempts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
