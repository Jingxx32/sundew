import Link from "next/link";
import { Headphones, BookOpenText, PenLine, Mic, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import type { ReadinessSummary, SkillReadiness } from "@/lib/actions/readiness";

const SKILL_META = {
  listening: { label: "Listening", icon: Headphones },
  reading: { label: "Reading", icon: BookOpenText },
  writing: { label: "Writing", icon: PenLine },
  speaking: { label: "Speaking", icon: Mic },
} as const;

function SkillTile({ skill, targetCefr }: { skill: SkillReadiness; targetCefr: CefrLevel | null }) {
  const meta = SKILL_META[skill.skill];
  const Icon = meta.icon;
  const isCefr = skill.label !== null && (CEFR_CHIP_CLASSES as Record<string, string>)[skill.label];
  const muted = skill.status !== "ok";

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-surface px-4 py-3.5 space-y-1.5",
        muted && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
          {meta.label}
        </div>
        {targetCefr && isCefr && (
          <span className="text-[10px] uppercase tracking-wider text-subtle-foreground">
            target {targetCefr}
          </span>
        )}
      </div>
      <div>
        {skill.label ? (
          <span
            className={cn(
              "inline-block rounded-md px-2 py-0.5 font-mono font-bold text-lg ring-1",
              isCefr ? CEFR_CHIP_CLASSES[skill.label as CefrLevel] : "bg-surface-muted text-foreground ring-border/60",
            )}
          >
            {skill.label}
          </span>
        ) : (
          <span className="text-lg text-subtle-foreground">—</span>
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{skill.detail}</p>
    </div>
  );
}

/** "Am I ready?" — four-skill snapshot vs the study goal. Honest by design:
 *  no score predictions, sample sizes always visible. */
export function ReadinessCard({ summary }: { summary: ReadinessSummary }) {
  const { goal, skills } = summary;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Target className="h-4.5 w-4.5 text-accent" strokeWidth={1.8} />
          Readiness
        </h2>
        <p className="text-xs text-muted-foreground">
          {goal.targetClb !== null ? (
            <>
              Objective <span className="font-medium text-foreground">CLB {goal.targetClb}</span>
              {goal.targetCefr && <> ≈ {goal.targetCefr}</>}
              {goal.daysLeft !== null && (
                <>
                  {" · "}
                  <span className={cn(goal.daysLeft < 60 && "text-warning font-medium")}>
                    exam in {goal.daysLeft} day{goal.daysLeft === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </>
          ) : (
            <Link href="/settings" className="text-accent hover:underline">
              Set your target CLB in Settings →
            </Link>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {skills.map((s) => (
          <SkillTile key={s.skill} skill={s} targetCefr={goal.targetCefr} />
        ))}
      </div>
    </section>
  );
}
