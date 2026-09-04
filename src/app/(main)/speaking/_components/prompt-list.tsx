import Link from "next/link";
import { Mic } from "lucide-react";
import type { PromptWithStats } from "@/lib/actions/speaking";

const TASK_LABELS: Record<number, { title: string; hint: string }> = {
  1: { title: "Tâche 1 — Entretien dirigé", hint: "Questions about yourself · ~2 min · no prep" },
  2: { title: "Tâche 2 — Interaction", hint: "You ask the questions · ~5 min · 2 min prep" },
  3: { title: "Tâche 3 — Point de vue", hint: "Defend an opinion · ~4.5 min · no prep" },
};

export function PromptList({ prompts }: { prompts: PromptWithStats[] }) {
  const byTask = [1, 2, 3].map((task) => ({
    task,
    items: prompts.filter((p) => p.task === task),
  }));

  if (prompts.length === 0) {
    return (
      <div className="rounded-2xl bg-surface shadow-card p-8 text-center text-sm text-muted-foreground">
        No prompts yet. Add entries to <code className="font-mono">data/tcf-speaking.json</code> and
        run <code className="font-mono">npx tsx scripts/import-tcf-speaking.ts</code>.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {byTask.map(({ task, items }) =>
        items.length === 0 ? null : (
          <section key={task}>
            <h2 className="font-medium text-sm mb-1">{TASK_LABELS[task].title}</h2>
            <p className="text-xs text-muted-foreground mb-4">{TASK_LABELS[task].hint}</p>
            <ul className="space-y-2">
              {items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/speaking/${p.id}/script`}
                    className="flex items-center gap-4 rounded-xl border border-transparent bg-surface shadow-card px-5 py-4 hover:border-accent/50 transition-colors"
                  >
                    <span className="flex-1 text-sm leading-snug">{p.prompt}</span>
                    <span className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      {p.sessionCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Mic className="h-3 w-3" />
                          {p.sessionCount}
                        </span>
                      )}
                      {p.bestScore !== null && (
                        <span className="font-mono text-accent">{p.bestScore}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
