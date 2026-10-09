import Link from "next/link";
import { ArrowRight, BookOpenText, Headphones, Mic, PenLine, Repeat2, Rows3 } from "lucide-react";
import { PreviewBadge } from "@/components/preview-badge";
import { canUse } from "@/lib/access/features";
import { requirePageUser } from "@/lib/auth/session";

const SKILLS = [
  {
    title: "Listening",
    detail: "Practice comprehension with TCF listening questions and saved review history.",
    href: "/tcf?skill=listening",
    action: "Open TCF listening",
    icon: Headphones,
    note: "Exam practice",
    feature: "tcf",
  },
  {
    title: "Speaking",
    detail: "Practice a Task 2 conversation or rehearse a personal script with pronunciation feedback.",
    href: "/speaking",
    action: "Open speaking lab",
    icon: Mic,
    note: "Conversation and script practice",
    feature: "speaking",
  },
  {
    title: "Reading",
    detail: "Read your own French material or work through TCF reading questions.",
    href: "/library",
    action: "Choose reading material",
    secondaryHref: "/tcf?skill=reading",
    secondaryAction: "TCF reading",
    icon: BookOpenText,
    note: "Personal material or exam practice",
  },
  {
    title: "Writing",
    detail: "Write from your reading or start a short general French task with structured feedback.",
    href: "/practice",
    action: "Start writing",
    icon: PenLine,
    note: "General French writing",
  },
] as const;


export default async function TrainingPage() {
  const user = await requirePageUser();
  const quizLocked = canUse(user.access, "quiz") !== true;
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Practice by skill</p>
        <h1 className="text-[38px] font-bold tracking-[-0.025em]">Training</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">Choose the kind of French you want to use today. Each entry opens the existing practice flow and keeps one shared history.</p>
      </header>

      <section className="mt-9 grid gap-4 sm:grid-cols-2" aria-label="Four language skills">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          const locked = "feature" in skill && canUse(user.access, skill.feature) !== true;
          return (
            <article id={skill.title.toLowerCase()} key={skill.title} className="flex min-h-60 scroll-mt-8 flex-col rounded-2xl border border-border/80 bg-surface p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-blue text-accent"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="text-right text-[11px] font-medium text-muted-foreground">{locked ? <PreviewBadge /> : skill.note}</span>
              </div>
              <h2 className="mt-7 text-xl font-bold tracking-[-0.02em]">{skill.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{skill.detail}</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href={skill.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{skill.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                {"secondaryHref" in skill && !locked && <Link href={skill.secondaryHref} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{skill.secondaryAction}</Link>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-10 border-t border-border pt-7" aria-labelledby="supporting-practice">
        <h2 id="supporting-practice" className="text-sm font-semibold">Supporting practice</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/conjugation" className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-4 py-4 text-sm font-medium transition-colors hover:border-accent/30"><Repeat2 className="h-4 w-4 text-accent" />Conjugation drills<ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link>
          <Link href="/quiz" className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-4 py-4 text-sm font-medium transition-colors hover:border-accent/30"><Rows3 className="h-4 w-4 text-accent" />Quiz and cloze sets{quizLocked && <span className="text-[11px] font-normal text-muted-foreground"><PreviewBadge /></span>}<ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link>
        </div>
      </section>
    </div>
  );
}
