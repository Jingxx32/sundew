export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Headphones,
  LockKeyhole,
  Mic,
  PenLine,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTodayPlan, selectTodayActivity, startTodayActivity } from "@/lib/actions/today";
import type { TodayActivity } from "@/lib/actions/today";

const SKILL_ICONS = { listening: Headphones, speaking: Mic, reading: BookOpenText, writing: PenLine } as const;

function ActivityAction({ activity }: { activity: TodayActivity }) {
  return (
    <form action={startTodayActivity.bind(null, activity.key)}>
      <Button type="submit" size="lg">
        {activity.done ? "Open activity" : activity.cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

export default async function TodayPage() {
  const plan = await getTodayPlan();
  const formattedDate = new Intl.DateTimeFormat("en-CA", { timeZone: plan.timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const weekFrom = new Intl.DateTimeFormat("en-CA", { timeZone: plan.timeZone, month: "short", day: "numeric" }).format(plan.week.from);
  const goalCopy = plan.goal.learningMode === "tcf"
    ? ["TCF preparation", plan.goal.targetClb ? `CLB ${plan.goal.targetClb}` : null, plan.goal.examState === "today" ? "exam today" : plan.goal.examState === "past" ? "exam date passed" : plan.goal.daysLeft !== null ? `${plan.goal.daysLeft} days to exam` : null].filter(Boolean).join(" · ")
    : "General French";

  return (
    <div className="mx-auto max-w-[980px] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{formattedDate}</p>
            <h1 className="text-[38px] font-bold tracking-[-0.025em]">Today</h1>
            <p className="mt-1 text-sm text-muted-foreground">{goalCopy} · practice level {plan.cefr}</p>
          </div>
          <Link href="/settings" className="rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">Edit goal</Link>
        </div>
      </header>

      <section aria-labelledby="today-focus" className="relative overflow-hidden rounded-2xl bg-surface-blue px-6 py-6 sm:px-8 sm:py-8">
        <div className="sundew-organic-shape pointer-events-none absolute -right-20 -top-32 h-72 w-72 bg-accent-soft-strong/65" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Today&apos;s focus</p>
            {plan.activity.done && <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success"><CheckCircle2 className="h-3 w-3" />Complete</span>}
          </div>
          <h2 id="today-focus" className="mt-4 text-2xl font-bold tracking-[-0.025em] sm:text-[28px]">{plan.activity.title}</h2>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{plan.activity.detail}</p>
          {plan.activity.progress && (
            <div className="mt-5 max-w-sm" aria-label={`${plan.activity.progress.done} of ${plan.activity.progress.target} complete`}>
              <div className="mb-1.5 flex justify-between font-mono text-[11px] text-muted-foreground"><span>Progress today</span><span>{plan.activity.progress.done}/{plan.activity.progress.target}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface/80"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (plan.activity.progress.done / plan.activity.progress.target) * 100)}%` }} /></div>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ActivityAction activity={plan.activity} />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />About {plan.activity.estimatedMinutes} min</span>
          </div>
        </div>
      </section>

      {plan.alternatives.length > 0 && (
        <details className="group mt-3 rounded-xl border border-border/70 bg-surface px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground">Choose another activity<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
          <div className="mt-3 divide-y divide-border border-t border-border">
            {plan.alternatives.map((activity) => (
              <div key={activity.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold text-foreground">{activity.title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{activity.detail}</p></div>
                <form action={selectTodayActivity.bind(null, activity.key)}><Button type="submit" variant="outline" size="sm">Choose</Button></form>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="mt-11" aria-labelledby="skills-heading">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Keep every skill in reach</p><h2 id="skills-heading" className="mt-1 text-xl font-bold tracking-[-0.02em]">Four skills</h2></div><Link href="/training" className="text-sm font-medium text-accent hover:underline">All training</Link></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {plan.skills.map((skill) => {
            const Icon = SKILL_ICONS[skill.key];
            return <Link key={skill.key} href={skill.href} className="group rounded-xl border border-border/80 bg-surface p-4 transition-colors hover:border-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><Icon className="h-4.5 w-4.5 text-accent" /><h3 className="mt-5 text-sm font-semibold group-hover:text-accent">{skill.title}</h3><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{skill.detail}</p>{skill.locked && <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><LockKeyhole className="h-3 w-3" aria-hidden="true" />Invite only</span>}</Link>;
          })}
        </div>
      </section>

      <div className="mt-11 grid gap-10 border-t border-border pt-8 lg:grid-cols-[1.35fr_1fr]">
        <section aria-labelledby="focus-areas-heading">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-focus-star" /><h2 id="focus-areas-heading" className="text-sm font-semibold">Recent focus areas</h2></div>
          {plan.focusAreas.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Complete a writing task to build evidence-backed focus areas. One error will be shown as an observation, not a recurring weakness.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {plan.focusAreas.map((area) => (
                <Link key={`${area.category}:${area.label}`} href={area.href} className="flex items-center justify-between gap-4 py-3.5 group">
                  <div><p className="text-sm font-medium group-hover:text-accent">{area.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{area.submissionCount >= 2 ? `Observed in ${area.submissionCount} different submissions` : "Observed in one submission"}</p></div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="week-heading">
          <div className="flex items-center justify-between"><h2 id="week-heading" className="text-sm font-semibold">This week</h2><Link href="/progress" className="text-xs font-medium text-accent hover:underline">View progress</Link></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Since {weekFrom} · {plan.timeZone}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {[{ label: "TCF answers", value: plan.week.tcfAnswers }, { label: "Writing pieces", value: plan.week.writingSubmissions }, { label: "Conjugations", value: plan.week.conjugationAnswers }].map((item) => <div key={item.label} className="rounded-xl bg-surface px-3 py-4 text-center"><dd className="font-mono text-xl font-semibold text-foreground">{item.value}</dd><dt className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.label}</dt></div>)}
          </dl>
        </section>
      </div>
    </div>
  );
}
