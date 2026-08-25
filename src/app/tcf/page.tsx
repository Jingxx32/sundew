import Link from "next/link";
import { Headphones, BookOpenText } from "lucide-react";
import {
  getTcfLevelSummaries,
  getTcfProgressOverview,
  getTcfReviewCount,
  listTcfSets,
  type TcfLevel,
} from "@/lib/actions/tcf";
import { Card } from "@/components/ui/card";

const LEVEL_COLORS: Record<TcfLevel, { bg: string; text: string; border: string }> = {
  A1: { bg: "bg-success-soft", text: "text-success", border: "border-success/30" },
  A2: { bg: "bg-success-soft", text: "text-success", border: "border-success/30" },
  B1: { bg: "bg-warning-soft", text: "text-warning", border: "border-warning/30" },
  B2: { bg: "bg-warning-soft", text: "text-warning", border: "border-warning/30" },
  C1: { bg: "bg-accent-soft", text: "text-accent", border: "border-accent/30" },
  C2: { bg: "bg-accent-soft", text: "text-accent", border: "border-accent/30" },
};

const LEVEL_LABELS: Record<TcfLevel, string> = {
  A1: "Débutant",
  A2: "Élémentaire",
  B1: "Intermédiaire",
  B2: "Avancé",
  C1: "Supérieur",
  C2: "Maîtrise",
};

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
    <>
      <div className="flex items-end gap-3 mb-2">
        <Icon className="h-8 w-8 text-accent mb-0.5" strokeWidth={1.6} />
        <h1 className="font-serif text-4xl font-semibold tracking-tight">TCF Canada</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{meta.title} — par niveau CECR</p>

      <Link href={`/tcf/review?skill=${skill}`} className="mb-6 flex w-fit items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-accent/40">
        <span>Centre de révision</span>
        <span className={reviewCount > 0 ? "text-danger font-medium" : "text-muted-foreground"}>{reviewCount} à revoir</span>
      </Link>

      <h2 className="text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
        {meta.levelVerb} · Choisissez un niveau
      </h2>

      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">Aucune question disponible.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez les exercices pour commencer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {summaries.map((s) => {
            const colors = LEVEL_COLORS[s.level];
            const stats = progressByLevel.get(s.level);
            const done = stats?.answered ?? 0;
            return (
              <Link
                key={s.level}
                href={`/tcf/drill?skill=${skill}&level=${s.level}`}
                className="group block"
              >
                <Card
                  className={`px-6 py-5 transition-all group-hover:shadow-sm group-hover:border-accent/40 ${
                    s.total === 0 ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold font-mono ${colors.bg} ${colors.text}`}
                    >
                      {s.level}
                    </span>
                    {s.total > 0 && (
                      <span className="text-[11px] text-subtle-foreground">{s.total} q.</span>
                    )}
                  </div>
                  <p className="font-serif text-base font-semibold text-foreground leading-tight">
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
          <h2 className="mt-12 text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
            Examen blanc · Choisissez un test
          </h2>
          <p className="text-sm text-muted-foreground mb-4 -mt-2">
            Un test complet de 39 questions (A1 → C2), avec score à la fin.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {sets.map((s) => {
              const stats = progress.bySet[s.testNumber];
              const answered = stats?.answered ?? 0;
              const exam = stats?.lastExam ?? null;
              const started = answered > 0;
              return (
                <Link
                  key={s.id}
                  href={`/tcf/exam?skill=${skill}&test=${s.testNumber}`}
                  className={`group flex flex-col items-center justify-center rounded-xl border bg-surface px-2 py-3 transition-all hover:border-accent/40 hover:shadow-sm ${
                    started ? "border-accent/30" : "border-border/70"
                  }`}
                >
                  <span className="font-serif text-lg font-semibold text-foreground group-hover:text-accent">
                    {s.testNumber}
                  </span>
                  {/* Score of the last whole-exam run outranks the drill count:
                      it is the number this grid exists to show. */}
                  {exam ? (
                    <span className="font-mono text-[10px] font-medium text-accent">
                      {exam.score}/{exam.total}
                    </span>
                  ) : started ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {answered}/{s.totalCount}
                    </span>
                  ) : (
                    <span className="text-[10px] text-subtle-foreground">{s.totalCount} q.</span>
                  )}
                  {/* Only started tests get a bar — an empty one under all 39
                      tiles reads as clutter, not as information. */}
                  {started && (
                    <div className="mt-1.5 h-0.5 w-8 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round((answered / Math.max(s.totalCount, 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
