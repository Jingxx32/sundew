import Link from "next/link";
import { Headphones, BookOpenText, Mic, RotateCcw } from "lucide-react";
import {
  getTcfLevelSummaries,
  getTcfProgressOverview,
  getTcfReviewCount,
  listTcfSets,
} from "@/lib/actions/tcf";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "./_components/level-badge";
import { LEVEL_LABELS } from "@/lib/tcf/display";

const SKILLS = {
  listening: { label: "Écoute", title: "Compréhension orale", icon: Headphones, levelVerb: "Écoute" },
  reading: { label: "Lecture", title: "Compréhension écrite", icon: BookOpenText, levelVerb: "Lecture" },
} as const;

export default async function TcfPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const { skill: skillParam } = await searchParams;
  const skill = skillParam === "reading" ? "reading" : "listening";
  const meta = SKILLS[skill];
  const Icon = meta.icon;

  const [summaries, sets, reviewCount, progress] = await Promise.all([
    getTcfLevelSummaries(skill),
    listTcfSets(skill),
    getTcfReviewCount(skill),
    getTcfProgressOverview(skill),
  ]);
  const progressByLevel = new Map(progress.byLevel.map((entry) => [entry.level, entry]));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end gap-3 mb-2">
        <Icon className="h-8 w-8 text-accent mb-0.5" strokeWidth={1.6} aria-hidden="true" />
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">TCF Canada</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{meta.title} — par niveau CECR</p>

      <Link href="/speaking/task-2" className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 text-sm font-medium text-accent hover:border-accent/40">
        <Mic className="h-4 w-4" aria-hidden="true" /> Expression orale · Tâche 2 practice
      </Link>

      <Link
        href={`/tcf/review?skill=${skill}`}
        className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface px-5 py-4 transition-colors touch-manipulation hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Centre de révision</p>
            <p className="text-xs text-muted-foreground">Questions marquées incertaines ou ratées, toutes compétences</p>
          </div>
        </div>
        <span
          className={
            reviewCount > 0
              ? "shrink-0 rounded-full bg-danger-soft px-3 py-1 font-mono text-sm font-medium text-danger"
              : "shrink-0 rounded-full bg-surface-muted px-3 py-1 font-mono text-sm text-muted-foreground"
          }
        >
          {reviewCount}
        </span>
      </Link>

      <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">
        {meta.levelVerb} · Choisissez un niveau
      </h2>

      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="text-xl text-foreground">Aucune question disponible.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez les exercices pour commencer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {summaries.map((s) => {
            const stats = progressByLevel.get(s.level);
            const done = stats?.answered ?? 0;
            return (
              <Link
                key={s.level}
                href={`/tcf/drill?skill=${skill}&level=${s.level}`}
                className="group block touch-manipulation rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <Card
                  className={`px-6 py-5 transition-[border-color,box-shadow] group-hover:shadow-card group-hover:border-accent/40 ${
                    s.total === 0 ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <LevelBadge level={s.level} className="px-2 py-0.5 text-sm" />
                    {s.total > 0 && (
                      <span className="text-[11px] text-muted-foreground">{s.total} q.</span>
                    )}
                  </div>
                  <p className="text-base font-semibold text-foreground leading-tight">
                    {LEVEL_LABELS[s.level]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.total === 0
                      ? "Pas encore disponible"
                      : `${s.sets} test${s.sets > 1 ? "s" : ""}`}
                  </p>
                  {s.total > 0 && (
                    <div className="mt-3">
                      <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-accent transition-[width]"
                          style={{ width: `${Math.round((done / s.total) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {done === 0 ? (
                          <span>Pas encore commencé</span>
                        ) : (
                          <>
                            <span className="font-mono">
                              {done}/{s.total}
                            </span>
                            <span>· {stats!.accuracy} % de réussite</span>
                            {stats!.needsReview > 0 && (
                              <span className="text-danger">{stats!.needsReview} à revoir</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {sets.length > 0 && (
        <>
          <h2 className="mt-12 text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">
            Examen blanc · Choisissez un test
          </h2>
          <p className="text-sm text-muted-foreground mb-4 -mt-2">
            Un test complet de 39 questions (A1 → C2), avec score à la fin.
          </p>
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
            {sets.map((s) => {
              const stats = progress.bySet[s.testNumber];
              const answered = stats?.answered ?? 0;
              const exam = stats?.lastExam ?? null;
              const started = answered > 0;
              return (
                <Link
                  key={s.id}
                  href={`/tcf/exam?skill=${skill}&test=${s.testNumber}`}
                  className={`group flex flex-col items-center justify-center gap-1 rounded-xl border bg-surface px-2 py-3 transition-[border-color,box-shadow] touch-manipulation hover:border-accent/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    exam ? "border-accent/30" : started ? "border-warning/30" : "border-border/70"
                  }`}
                >
                  <span className="text-lg font-semibold text-foreground group-hover:text-accent">
                    {s.testNumber}
                  </span>
                  {/* Score of the last whole-exam run outranks the drill count:
                      it is the number this grid exists to show. */}
                  {exam ? (
                    <span className="font-mono text-[10px] font-medium text-accent">
                      {exam.score}/{exam.total}
                    </span>
                  ) : started ? (
                    <span className="font-mono text-[10px] text-warning">
                      {answered}/{s.totalCount}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">{s.totalCount} q.</span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
