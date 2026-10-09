import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getTcfQuestionById,
  getTcfScheduledDrillQuestions,
  type TcfDrillSessionKind,
  type TcfLevel,
} from "@/lib/actions/tcf";
import { DrillRunner } from "../_components/drill-runner";
import { LevelBadge } from "../_components/level-badge";
import { LEVEL_LABELS, LEVEL_ORDER } from "@/lib/tcf/display";
import { pageGate } from "@/lib/access/page-gate";

export default async function TcfDrillPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string; level?: string; q?: string; round?: string }>;
}) {
  const locked = await pageGate("tcf");
  if (locked) return locked;
  const { skill: skillParam, level: levelParam, q, round: roundParam } = await searchParams;
  let skill = (skillParam === "reading" ? "reading" : "listening") as "listening" | "reading";
  let level = (LEVEL_ORDER.includes(levelParam as TcfLevel) ? levelParam : "A2") as TcfLevel;

  // A `?q=<id>` deep link (e.g. from a vocabulary occurrence) may omit skill/level —
  // derive them from the question itself so we open its actual drill group.
  if (q) {
    const target = await getTcfQuestionById(q);
    if (target) {
      skill = target.skill;
      level = target.level;
    }
  }

  const round: TcfDrillSessionKind = roundParam === "20" || roundParam === "review" || roundParam === "all" ? roundParam : "10";
  const session = await getTcfScheduledDrillQuestions(skill, level, q ? "all" : round);
  const questions = session.questions;
  const qIndex = q ? questions.findIndex((x) => x.id === q) : 0;
  const initialIndex = Math.max(0, qIndex);
  const title = skill === "reading" ? "Compréhension écrite" : "Compréhension orale";

  return (
    <div className="mx-auto max-w-5xl">
      {/* Back link + header */}
      <div className="mb-4 md:mb-6">
        <Link
          href={`/tcf?skill=${skill}`}
          className="mb-3 hidden w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:flex"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          TCF
        </Link>
        <div className="flex items-center gap-2">
          {/* On a phone the back arrow rides on the title line instead of
              claiming a row of its own. */}
          <Link
            href={`/tcf?skill=${skill}`}
            aria-label="Retour au TCF"
            className="-ml-1 text-muted-foreground hover:text-foreground md:hidden"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="text-xl font-semibold tracking-[-0.025em] md:text-3xl">{title}</h1>
          <LevelBadge level={level} className="px-2 py-0.5 text-sm" />
        </div>
        <p className="mt-1 hidden text-sm text-muted-foreground md:block">
          {LEVEL_LABELS[level]} · entraînement par cycles
        </p>
      </div>

      {!q && (
        <div className="mb-4 flex flex-wrap gap-1.5 md:mb-6 md:gap-2" aria-label="Choisir une session">
          {(["10", "20", "review", "all"] as const).map((option) => {
            const label = option === "review" ? "À revoir" : option === "all" ? "Toutes" : `${option} questions`;
            return <Link key={option} href={`/tcf/drill?skill=${skill}&level=${level}&round=${option}`} className={`rounded-lg border px-2.5 py-1.5 text-xs touch-manipulation md:px-3 md:py-2 md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${round === option ? "border-accent bg-accent-soft text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>{label}</Link>;
          })}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="text-xl text-foreground">
            Aucune question pour le niveau {level}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez des exercices ou choisissez un autre niveau.
          </p>
        </div>
      ) : (
        <DrillRunner
          // DrillRunner snapshots its question list on mount, so changing the
          // session (level or round) has to remount it rather than re-render.
          key={`${skill}:${level}:${round}`}
          questions={questions}
          learning={session.learning}
          skill={skill}
          level={level}
          kind={round}
          initialIndex={initialIndex}
        />
      )}
    </div>
  );
}
