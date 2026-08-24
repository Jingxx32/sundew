import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getTcfQuestionById,
  getTcfScheduledDrillQuestions,
  type TcfDrillSessionKind,
  type TcfLevel,
} from "@/lib/actions/tcf";
import { DrillRunner } from "../_components/drill-runner";

const LEVEL_LABELS: Record<TcfLevel, string> = {
  A1: "Débutant",
  A2: "Élémentaire",
  B1: "Intermédiaire",
  B2: "Avancé",
  C1: "Supérieur",
  C2: "Maîtrise",
};

const VALID_LEVELS: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default async function TcfDrillPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string; level?: string; q?: string; round?: string }>;
}) {
  const { skill: skillParam, level: levelParam, q, round: roundParam } = await searchParams;
  let skill = (skillParam === "reading" ? "reading" : "listening") as "listening" | "reading";
  let level = (VALID_LEVELS.includes(levelParam as TcfLevel) ? levelParam : "A2") as TcfLevel;

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
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* Back link + header */}
      <div className="mb-6">
        <Link
          href={`/tcf?skill=${skill}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 w-fit"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          TCF
        </Link>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {title} · {level}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{LEVEL_LABELS[level]} · entraînement par cycles</p>
      </div>

      {!q && (
        <div className="mb-6 flex flex-wrap gap-2" aria-label="Choisir une session">
          {(["10", "20", "review", "all"] as const).map((option) => {
            const label = option === "review" ? "À revoir" : option === "all" ? "Toutes" : `${option} questions`;
            return <Link key={option} href={`/tcf/drill?skill=${skill}&level=${level}&round=${option}`} className={`rounded-lg border px-3 py-2 text-sm ${round === option ? "border-accent bg-accent-soft text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>{label}</Link>;
          })}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">
            Aucune question pour le niveau {level}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez des exercices ou choisissez un autre niveau.
          </p>
        </div>
      ) : (
        <DrillRunner
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
