export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Flame, Headphones, PenLine, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrganicShape } from "@/components/organic-shape";
import { getTodayPlan } from "@/lib/actions/today";
import type { TodayBlock } from "@/lib/actions/today";
import { QuickWriteButton } from "../practice/_components/quick-write-button";

const BLOCK_ICONS = {
  tcf: Headphones,
  writing: PenLine,
  review: Repeat,
} as const;

function BlockCard({ block, featured = false }: { block: TodayBlock; featured?: boolean }) {
  const Icon = BLOCK_ICONS[block.key];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
        featured
          ? "border-transparent bg-surface-blue px-6 py-5 md:px-7 md:py-6"
          : "border-border/80 bg-surface shadow-card",
        block.done && "opacity-70",
      )}
    >
      {featured && (
        <OrganicShape className="absolute -bottom-28 -right-16 h-64 w-64 -rotate-12 opacity-80" />
      )}
      <div className="relative z-10 flex items-start gap-4">
        <div className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl bg-surface text-primary shadow-card",
          featured ? "h-14 w-14" : "h-11 w-11",
        )}>
          <Icon className={featured ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.9} />
          {block.done && (
            <CheckCircle2 className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-surface text-success" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={cn(
                featured ? "text-lg font-bold tracking-[-0.02em]" : "text-sm font-semibold",
                block.done && "line-through decoration-border",
              )}
            >
              {block.title}
            </h2>
            {block.progress && !block.done && block.progress.done > 0 && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {block.progress.done}/{block.progress.target}
              </span>
            )}
          </div>
          <p className={cn("leading-relaxed text-muted-foreground", featured ? "max-w-lg text-[15px]" : "text-[13px]")}>
            {block.detail}
          </p>
          {featured && block.progress && block.progress.done > 0 && (
            <div className="max-w-xs pt-1.5" aria-label={`${block.progress.done} of ${block.progress.target} complete`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface/80">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${(block.progress.done / block.progress.target) * 100}%` }}
                />
              </div>
            </div>
          )}
          {!block.done && (
            <div className="pt-2">
              {block.href ? (
                <Link
                  href={block.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                    featured
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "bg-accent-soft text-accent hover:bg-accent-soft-strong",
                  )}
                >
                  Start
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <QuickWriteButton compact={!featured} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function TodayPage() {
  const plan = await getTodayPlan();
  const doneCount = plan.blocks.filter((b) => b.done).length;
  const [focusBlock, ...otherBlocks] = plan.blocks;

  return (
    <div className="mr-auto max-w-[920px] px-5 py-8 md:px-8 md:py-10">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
        </p>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h1 className="text-[38px] font-bold tracking-[-0.035em]">Today</h1>
          <div className="flex items-center gap-3 rounded-full border border-border/70 bg-surface px-3 py-2 text-[15px] shadow-card">
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
        <p className="mt-1 text-[15px] text-muted-foreground">
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
        {focusBlock && <BlockCard block={focusBlock} featured />}
        {otherBlocks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {otherBlocks.map((block) => (
              <BlockCard key={block.key} block={block} />
            ))}
          </div>
        )}
      </div>

      {doneCount === plan.blocks.length && (
        <div className="mt-8 rounded-2xl border border-success/30 bg-success-soft px-6 py-5 text-center">
          <p className="text-lg font-semibold text-success">Plan complete — à demain !</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check <Link href="/progress" className="text-accent hover:underline">Progress</Link> to
            see where today&apos;s work landed.
          </p>
        </div>
      )}

      <p className="mt-10 text-[11px] text-muted-foreground text-center">
        Picks are heuristic: weakest skill first (within {plan.cefr} ±1), then least-recent.
        Everything else lives in the sidebar.
      </p>
    </div>
  );
}
