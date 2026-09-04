"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasTranscriptSection } from "@/lib/tcf/parse-explanation";
import { ExplanationPanel } from "./explanation-panel";
import { VerdictBar } from "./verdict-bar";
import { LevelNav } from "./level-nav";
import { LevelBadge } from "./level-badge";
import { QuestionMedia } from "./question-media";
import { OptionList } from "./option-list";
import { MarkGapFloater } from "./mark-gap-floater";
import type { AudioPlayerHandle } from "./audio-player";
import { useQuestionKeyboardNav } from "@/hooks/use-question-keyboard-nav";
import { submitDrillAttempt } from "@/lib/tcf/pending-sync";
import { writeFromTcfPassage } from "@/lib/actions/tasks";
import type { TcfDrillSessionKind, TcfQuestionForDrill, TcfQuestionLearning, TcfLevel } from "@/lib/actions/tcf";
import type { TcfLearningStatus } from "@/lib/tcf/learning";

type RoundResult = { chosen: number; correct: boolean; uncertain: boolean };

function WritePassageButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      try {
        router.push(`/practice?taskId=${await writeFromTcfPassage(questionId)}`);
      } catch {
        setFailed(true);
      }
    });
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-accent disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Génération…
          </>
        ) : (
          <>
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Écrire sur ce texte
          </>
        )}
      </button>
      {failed && <span className="text-xs text-danger">Échec — réessayez.</span>}
    </div>
  );
}

function RoundNav({
  className,
  onPrev,
  onNext,
  atStart,
  atEnd,
  done,
  total,
}: {
  className?: string;
  onPrev: () => void;
  onNext: () => void;
  atStart: boolean;
  atEnd: boolean;
  done: number;
  total: number;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Button variant="outline" size="sm" onClick={onPrev} disabled={atStart}>
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        Précédent
      </Button>
      <span className="font-mono text-xs text-muted-foreground">
        {done} / {total} parcourues
      </span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={atEnd}>
        Suivant
        <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface DrillRunnerProps {
  questions: TcfQuestionForDrill[];
  learning: TcfQuestionLearning[];
  skill: "listening" | "reading";
  level: TcfLevel;
  kind: TcfDrillSessionKind;
  initialIndex?: number;
  /** The review centre keeps its history panel visible after a response. */
  showSummaryOnComplete?: boolean;
  /** Off inside the review centre, which already owns `?q=` at the page level for its single-question view. */
  syncUrl?: boolean;
}

export function DrillRunner({
  questions: sessionInput,
  learning,
  skill,
  level,
  kind,
  initialIndex = 0,
  showSummaryOnComplete = true,
  syncUrl = true,
}: DrillRunnerProps) {
  // A round is a fixed set of questions, but answering one revalidates the TCF
  // paths, which re-runs the scheduler on the server: `getTcfScheduledDrillQuestions`
  // ranks by learning status, so the just-answered question can be reordered or
  // sliced out of a "10"/"20" round entirely. `currentIndex` is a position, so
  // that would swap the question under the learner's finger the instant they
  // answer. Snapshot on mount instead; the page keys this component by
  // skill/level/round, so picking another session still gives a fresh list.
  const [questions] = useState(sessionInput);
  const storageKey = `tcf-drill:${skill}:${level}:${kind}:${questions.map((q) => q.id).join(",")}`;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showAnswer, setShowAnswer] = useState(false);
  const [chosen, setChosen] = useState<number>();
  const [uncertain, setUncertain] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, RoundResult>>({});
  const [statusByQuestion, setStatusByQuestion] = useState<Record<string, TcfLearningStatus>>(() =>
    Object.fromEntries(learning.map((item) => [item.questionId, item.status])),
  );
  const [streakByQuestion, setStreakByQuestion] = useState<Record<string, number>>(() =>
    Object.fromEntries(learning.map((item) => [item.questionId, item.consecutiveConfidentCorrect])),
  );
  const audioRef = useRef<AudioPlayerHandle>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const index = saved ? Number.parseInt(saved, 10) : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
    const frame = window.requestAnimationFrame(() => setCurrentIndex(index));
    return () => window.cancelAnimationFrame(frame);
  }, [questions.length, storageKey]);
  useEffect(() => {
    window.localStorage.setItem(storageKey, String(currentIndex));
  }, [currentIndex, storageKey]);

  const q = questions.length > 0 ? questions[currentIndex] : undefined;

  // Keep `?q=` pointed at the question on screen so the URL is shareable and
  // a reload lands back where you were — via the History API directly (not
  // next/navigation's router) so stepping through questions never triggers a
  // server round-trip.
  useEffect(() => {
    if (!syncUrl || !q) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("q") === q.id) return;
    url.searchParams.set("q", q.id);
    window.history.replaceState(null, "", url);
  }, [syncUrl, q]);
  const allComplete = completedIds.size === questions.length;
  const answers = Object.values(results);

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    const result = results[questions[index].id];
    setCurrentIndex(index);
    setShowAnswer(Boolean(result || completedIds.has(questions[index].id)));
    setChosen(result?.chosen);
    setUncertain(result?.uncertain ?? false);
  }
  function completeCurrent(id: string) {
    setCompletedIds((previous) => new Set(previous).add(id));
  }
  function revealAnswer() {
    if (!q || showAnswer) return;
    setShowAnswer(true);
    completeCurrent(q.id);
  }
  function choose(optionIndex: number) {
    if (!q || showAnswer) return;
    const correct = optionIndex === q.answer;
    setChosen(optionIndex);
    setShowAnswer(true);
    completeCurrent(q.id);
    setResults((previous) => ({ ...previous, [q.id]: { chosen: optionIndex, correct, uncertain } }));
    const nextStreak = correct && !uncertain ? (streakByQuestion[q.id] ?? 0) + 1 : 0;
    setStreakByQuestion((previous) => ({ ...previous, [q.id]: nextStreak }));
    setStatusByQuestion((previous) => ({
      ...previous,
      [q.id]: !correct || uncertain ? "needs_review" : nextStreak >= 3 ? "stable" : "in_progress",
    }));
    submitDrillAttempt({
      questionId: q.id,
      chosen: optionIndex,
      uncertain,
      mode: kind === "review" ? "review" : "drill",
    });
  }

  useQuestionKeyboardNav({
    optionCount: q?.options.length ?? 0,
    onChoose: choose,
    onPrev: () => goTo(currentIndex - 1),
    onNext: () => goTo(currentIndex + 1),
    onPlayPause: () => audioRef.current?.togglePlay(),
    onRewind: () => audioRef.current?.rewind(),
    choiceLocked: showAnswer,
  });

  if (!q) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
        Aucune question à revoir pour le moment.
      </div>
    );
  }

  if (allComplete && showSummaryOnComplete) {
    const correct = answers.filter((answer) => answer.correct).length;
    const uncertainCorrect = answers.filter((answer) => answer.correct && answer.uncertain).length;
    const incorrect = answers.filter((answer) => !answer.correct).length;
    const needsReview = answers.filter((answer) => !answer.correct || answer.uncertain).length;
    return (
      <section className="mx-auto max-w-xl rounded-2xl bg-surface shadow-card px-8 py-10 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Session terminée</p>
        <h2 className="mt-2 text-[30px] font-bold tracking-[-0.03em]">{questions.length} questions parcourues</h2>
        <p className="mt-5 text-sm text-muted-foreground">
          {correct} correctes · {uncertainCorrect} correctes mais incertaines · {incorrect} incorrectes
        </p>
        <p className="mt-2 text-sm text-danger">
          {needsReview} question{needsReview !== 1 ? "s" : ""} à revoir
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link href={`/tcf/review?skill=${skill}&level=${level}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            Revoir maintenant
          </Link>
          <Link href={`/tcf?skill=${skill}`} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
            Retour au niveau
          </Link>
        </div>
      </section>
    );
  }

  const audioOnly = q.type === "image" || q.type === "spoken_options";
  const why = showAnswer ? q.explanationMeta?.options : undefined;
  const rewrittenTranscript = q.explanation !== null && hasTranscriptSection(q.explanation);

  return (
    <div className="flex flex-col gap-4 min-h-0 md:flex-row md:gap-6">
      <LevelNav
        questions={questions}
        currentIndex={currentIndex}
        onSelect={goTo}
        statusByQuestion={statusByQuestion}
        completedIds={completedIds}
      />

      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 md:mb-4">
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <span className="text-lg font-semibold">
              Question {currentIndex + 1} de {questions.length}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              Test {q.testNumber} · {q.orderIndex}
            </span>
            <LevelBadge level={q.level} />
          </div>
          {!showAnswer && (
            <button
              type="button"
              onClick={revealAnswer}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground touch-manipulation"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Afficher réponse
            </button>
          )}
        </div>

        <div className="space-y-3 rounded-xl bg-surface shadow-card px-4 py-4 md:space-y-4 md:px-6 md:py-5">
          <p className="text-lg leading-snug text-foreground">{q.questionText}</p>

          <MarkGapFloater skill={skill} questionId={q.id}>
            <QuestionMedia question={q} ref={audioRef} />
          </MarkGapFloater>

          {!showAnswer && (
            <label className="flex items-center gap-2 rounded-lg bg-warning-soft/50 px-3 py-2 text-sm">
              <input type="checkbox" checked={uncertain} onChange={(event) => setUncertain(event.target.checked)} />
              Je ne suis pas sûr·e / Je devine
            </label>
          )}

          <OptionList
            options={q.options}
            chosen={chosen}
            answer={q.answer}
            revealed={showAnswer}
            audioOnly={audioOnly}
            onChoose={choose}
            why={why}
          />

          {q.type === "reading_mcq" && q.passage && <WritePassageButton questionId={q.id} />}

          {showAnswer && q.explanationMeta && <VerdictBar meta={q.explanationMeta} chosen={chosen} answer={q.answer} />}
          {showAnswer && chosen === undefined && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
              Réponse consultée : aucune tentative n’a été enregistrée et les choix sont verrouillés.
            </p>
          )}
        </div>

        <RoundNav
          className="mt-4 hidden md:flex"
          onPrev={() => goTo(currentIndex - 1)}
          onNext={() => goTo(currentIndex + 1)}
          atStart={currentIndex === 0}
          atEnd={currentIndex === questions.length - 1}
          done={completedIds.size}
          total={questions.length}
        />

        <p className="mt-2 hidden text-center font-mono text-[10px] text-muted-foreground md:block">
          A–D pour répondre · ← → pour naviguer{q.type !== "reading_mcq" ? " · Espace lecture · R recule" : ""}
        </p>

        {/* Suppressed when the explanation rewrites the recording itself: the stored
            column is OCR run-on text, so showing both prints the same dialogue
            twice, unreadable version first. */}
        {showAnswer && q.transcript && !rewrittenTranscript && (
          <MarkGapFloater skill={skill} questionId={q.id}>
            <div className="mt-4 rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Transcription</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{q.transcript}</p>
            </div>
          </MarkGapFloater>
        )}
        {showAnswer && q.explanation && (
          <div className="mt-4">
            <ExplanationPanel markdown={q.explanation} />
          </div>
        )}

        <RoundNav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur md:hidden"
          onPrev={() => goTo(currentIndex - 1)}
          onNext={() => goTo(currentIndex + 1)}
          atStart={currentIndex === 0}
          atEnd={currentIndex === questions.length - 1}
          done={completedIds.size}
          total={questions.length}
        />
      </div>
    </div>
  );
}
