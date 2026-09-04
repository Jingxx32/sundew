export const dynamic = "force-dynamic";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CheckCircle2, Circle, Flame, Headphones, PenLine, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayPlan } from "@/lib/actions/today";
import type { TodayBlock } from "@/lib/actions/today";
import { QuickWriteButton } from "../practice/_components/quick-write-button";

const BLOCK_ICONS = {
  tcf: Headphones,
  writing: PenLine,
  review: Repeat,
} as const;

function BlockCard({ block }: { block: TodayBlock }) {
  const Icon = BLOCK_ICONS[block.key];
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 flex items-start gap-4",
        block.done && "opacity-70",
      )}
    >
      {block.done ? (
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-5 w-5 text-border shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="h-4 w-4 text-accent" strokeWidth={1.8} />
          <h2 className={cn("font-medium text-sm", block.done && "line-through decoration-border")}>
            {block.title}
          </h2>
          {block.progress && !block.done && block.progress.done > 0 && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {block.progress.done}/{block.progress.target}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{block.detail}</p>
        {!block.done && (
          <div className="pt-2">
            {block.href ? (
              <Link
                href={block.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Start
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <QuickWriteButton />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function TodayPage() {
  const plan = await getTodayPlan();
  const doneCount = plan.blocks.filter((b) => b.done).length;

  return (
    <div className="px-10 py-10 max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-1">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h1 className="text-[38px] font-bold tracking-[-0.035em]">Today</h1>
          <div className="flex items-center gap-3 text-sm">
            {plan.streak > 0 && (
              <span className="flex items-center gap-1 text-warning font-medium">
                <Flame className="h-4 w-4" />
                {plan.streak} day{plan.streak === 1 ? "" : "s"}
              </span>
            )}
            <span className="text-muted-foreground">
              {doneCount}/{plan.blocks.length} done
            </span>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.goal.targetClb !== null ? (
            <>
              Toward CLB {plan.goal.targetClb}
              {plan.goal.daysLeft !== null && <> · exam in {plan.goal.daysLeft} days</>} · level{" "}
              {plan.cefr}
            </>
          ) : (
            <>
              ~45 minutes, weakest things first ·{" "}
              <Link href="/settings" className="text-accent hover:underline">
                set your target CLB →
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="space-y-4">
        {plan.blocks.map((b) => (
          <BlockCard key={b.key} block={b} />
        ))}
      </div>

      {doneCount === plan.blocks.length && (
        <div className="mt-8 rounded-2xl border border-success/30 bg-success-soft px-6 py-5 text-center">
          <p className="font-serif text-lg text-success">Plan complete — à demain !</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check <Link href="/progress" className="text-accent hover:underline">Progress</Link> to
            see where today&apos;s work landed.
          </p>
        </div>
      )}

      <p className="mt-10 text-[11px] text-subtle-foreground text-center">
        Picks are heuristic: weakest skill first (within {plan.cefr} ±1), then least-recent.
        Everything else lives in the sidebar.
      </p>
    </div>
  );
}
