import { Suspense } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listQuizSets, type QuizSetListItem } from "@/lib/actions/quiz";
import { ImportQuizDialog } from "./_components/import-dialog";
import { QuizFilters } from "./_components/quiz-filters";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; section?: string }>;
}) {
  const { exam, section } = await searchParams;

  const [sets, allSets] = await Promise.all([
    listQuizSets({ exam, section }),
    listQuizSets(),
  ]);

  const exams = [...new Set(allSets.map((s) => s.exam))].sort();
  const totalQuestions = allSets.reduce((sum, s) => sum + s.questionCount, 0);

  return (
    <div className="px-10 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[38px] font-bold tracking-[-0.035em]">
            Quiz
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allSets.length === 0
              ? "Objective practice — exam papers, dictation and drills will live here."
              : `${allSets.length} ${allSets.length === 1 ? "set" : "sets"} · ${totalQuestions} questions`}
          </p>
        </div>
        <ImportQuizDialog />
      </div>

      {/* Filter bar */}
      <Suspense>
        <QuizFilters exams={exams} />
      </Suspense>

      {/* Set list */}
      <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {exam || section
          ? `${sets.length} result${sets.length === 1 ? "" : "s"}`
          : "All sets"}
      </div>
      {sets.length === 0 ? (
        <EmptyState filtered={!!(exam || section)} />
      ) : (
        <div className="space-y-3">
          {sets.map((set) => (
            <QuizSetCard key={set.id} set={set} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuizSetCard({ set }: { set: QuizSetListItem }) {
  return (
    <Link href={`/quiz/${set.id}`} className="block group">
      <Card className="px-6 py-4 transition-colors group-hover:border-accent-soft-strong">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight truncate">
              {set.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {set.questionCount}{" "}
              {set.questionCount === 1 ? "question" : "questions"}
              {set.source ? ` · ${set.source}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Chip variant="accent">
              {set.exam}
              {set.number != null ? ` nº${set.number}` : ""}
            </Chip>
            <Chip>{set.section}</Chip>
            {set.latestAttempt && (
              <Chip
                variant={
                  set.latestAttempt.score / Math.max(set.latestAttempt.total, 1) >=
                  0.7
                    ? "success"
                    : "warning"
                }
              >
                {set.latestAttempt.score}/{set.latestAttempt.total}
              </Chip>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
      <p className="text-xl text-foreground">
        {filtered ? "No sets match this filter." : "No quiz sets yet."}
      </p>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        {filtered
          ? "Try a different exam or section filter."
          : "Click Import to turn a TCF reading PDF into a practice set."}
      </p>
    </div>
  );
}
