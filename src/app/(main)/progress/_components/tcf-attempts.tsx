import { format } from "date-fns";
import type { TcfAttempt } from "@/lib/db/schema";

const SKILL_LABELS: Record<TcfAttempt["skill"], string> = {
  listening: "Compréhension orale",
  reading: "Compréhension écrite",
};

export function TcfAttempts({ attempts }: { attempts: TcfAttempt[] }) {
  if (attempts.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">TCF practice</h2>
      <div className="rounded-xl bg-surface shadow-card divide-y divide-border/50 overflow-hidden">
        {attempts.map((a) => {
          const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
          return (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Test {a.testNumber} · {SKILL_LABELS[a.skill]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(a.answeredAt, "MMM d, yyyy · HH:mm")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold text-foreground">
                  {a.score}
                  <span className="text-sm text-muted-foreground">/{a.total}</span>
                </p>
                <p className="text-xs text-muted-foreground">{pct}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
