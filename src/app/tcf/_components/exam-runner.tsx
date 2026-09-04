"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, X, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExplanationPanel } from "./explanation-panel";
import { VerdictBar } from "./verdict-bar";
import { LevelBadge } from "./level-badge";
import { QuestionMedia } from "./question-media";
import { OptionList } from "./option-list";
import type { AudioPlayerHandle } from "./audio-player";
import { useQuestionKeyboardNav } from "@/hooks/use-question-keyboard-nav";
import { LEVEL_ORDER, TYPE_LABELS, levelBadgeStyle } from "@/lib/tcf/display";
import { submitExamAttempt } from "@/lib/tcf/pending-sync";
import type { TcfQuestionForDrill, TcfLevel, TcfExamAnswer } from "@/lib/actions/tcf";
import type { TcfPerLevel } from "@/lib/db/schema";

interface ExamRunnerProps {
  questions: TcfQuestionForDrill[];
  skill: "listening" | "reading";
  testNumber: number;
  initialIndex?: number;
}

/** Single source of truth for exam scoring — used by both the results render
 *  and the persistence path so the two can never disagree. */
function computeScore(questions: TcfQuestionForDrill[], answers: Record<number, number>) {
  let correct = 0;
  const perLevel: TcfPerLevel = {};
  const perQuestion: TcfExamAnswer[] = [];
  questions.forEach((q, idx) => {
    const entry = (perLevel[q.level] ??= { correct: 0, total: 0 });
    entry.total++;
    const chosen = answers[idx];
    if (chosen === undefined) return; // unanswered — counted in total only
    const isCorrect = chosen === q.answer;
    if (isCorrect) {
      correct++;
      entry.correct++;
    }
    perQuestion.push({ questionId: q.id, chosen, correct: isCorrect });
  });
  return { correct, total: questions.length, perLevel, perQuestion };
}

function ScoreHeader({ testNumber, score }: { testNumber: number; score: ReturnType<typeof computeScore> }) {
  return (
    <div className="mb-6 rounded-2xl border border-border/70 bg-surface px-8 py-6">
      <p className="font-mono text-xs uppercase tracking-widest text-subtle-foreground">Résultat · Test {testNumber}</p>
      <p className="mt-1 text-5xl font-semibold text-foreground">
        {score.correct}
        <span className="text-xl font-normal text-muted-foreground"> / {score.total}</span>
      </p>
      <div className="mt-5 space-y-1.5">
        {LEVEL_ORDER.filter((l) => score.perLevel[l]).map((l) => {
          const entry = score.perLevel[l]!;
          const pct = entry.total > 0 ? (entry.correct / entry.total) * 100 : 0;
          return (
            <div key={l} className="flex items-center gap-3">
              <LevelBadge level={l} className="w-9 justify-center" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${pct}%`, backgroundColor: levelBadgeStyle(l).backgroundColor }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {entry.correct}/{entry.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExamRunner({ questions, skill, testNumber, initialIndex = 0 }: ExamRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // answers[i] = chosen option index for questions[i]
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const audioRef = useRef<AudioPlayerHandle>(null);

  const byLevel = useMemo(() => {
    const groups: Partial<Record<TcfLevel, number[]>> = {};
    questions.forEach((q, idx) => {
      (groups[q.level] ??= []).push(idx);
    });
    return groups;
  }, [questions]);

  const answeredCount = Object.keys(answers).length;

  const score = useMemo(() => (finished ? computeScore(questions, answers) : null), [finished, answers, questions]);

  const q = questions.length > 0 ? questions[currentIndex] : undefined;
  const chosen = q ? answers[currentIndex] : undefined;

  // Keep `?i=` pointed at the question on screen — shareable and reload-safe —
  // via the History API directly so paging through the exam never triggers a
  // server round-trip.
  useEffect(() => {
    if (!q) return;
    const url = new URL(window.location.href);
    const wanted = String(currentIndex + 1);
    if (url.searchParams.get("i") === wanted) return;
    url.searchParams.set("i", wanted);
    window.history.replaceState(null, "", url);
  }, [currentIndex, q]);

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
    setConfirmFinish(false);
  }

  function choose(optionIndex: number) {
    if (finished) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: optionIndex }));
  }

  function handleFinish() {
    if (!confirmFinish && answeredCount < questions.length) {
      setConfirmFinish(true);
      return;
    }
    setFinished(true);
    setConfirmFinish(false);
    setCurrentIndex(0);

    // Persist the run — total + per-level + per-question — so this signal
    // flows into Progress and the error loop (fire-and-forget).
    const result = computeScore(questions, answers);
    submitExamAttempt({
      setId: questions[0]?.setId ?? null,
      skill,
      testNumber,
      score: result.correct,
      total: result.total,
      perLevel: result.perLevel,
      answers: result.perQuestion,
    });
  }

  useQuestionKeyboardNav({
    optionCount: q?.options.length ?? 0,
    onChoose: choose,
    onPrev: () => goTo(currentIndex - 1),
    onNext: () => goTo(currentIndex + 1),
    onPlayPause: () => audioRef.current?.togglePlay(),
    onRewind: () => audioRef.current?.rewind(),
    choiceLocked: finished,
  });

  if (!q) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Aucune question disponible.</div>;
  }

  const audioOnly = q.type === "image" || q.type === "spoken_options";

  return (
    <div>
      {score && <ScoreHeader testNumber={testNumber} score={score} />}

      <div className="flex flex-col gap-6 min-h-0 md:flex-row">
        {/* Left nav — status map */}
        <nav className="w-full shrink-0 space-y-4 md:w-[190px]">
          {LEVEL_ORDER.filter((l) => byLevel[l]).map((level) => (
            <div key={level}>
              <div className="mb-1.5">
                <LevelBadge level={level} />
              </div>
              <div className="flex flex-wrap gap-1">
                {byLevel[level]!.map((idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = answers[idx] !== undefined;
                  const isCorrect = finished && answers[idx] === questions[idx].answer;
                  return (
                    <button
                      key={questions[idx].id}
                      type="button"
                      onClick={() => goTo(idx)}
                      aria-label={`Question ${questions[idx].orderIndex}${finished ? (isCorrect ? ", correcte" : ", incorrecte") : isAnswered ? ", répondue" : ", sans réponse"}`}
                      className={cn(
                        "h-7 w-7 rounded font-mono text-xs font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                        isCurrent
                          ? "bg-accent text-accent-foreground"
                          : finished
                            ? isCorrect
                              ? "bg-success-soft text-success"
                              : "bg-danger-soft text-danger"
                            : isAnswered
                              ? "bg-accent-soft text-accent"
                              : "bg-surface-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
                      )}
                    >
                      {questions[idx].orderIndex}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Finish button (exam mode) */}
          {!finished && (
            <div className="space-y-2 pt-2">
              {confirmFinish && (
                <p className="text-[11px] leading-snug text-warning">
                  {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? "s" : ""} sans
                  réponse. Terminer quand même ?
                </p>
              )}
              <Button variant={confirmFinish ? "default" : "outline"} size="sm" className="w-full" onClick={handleFinish}>
                <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {confirmFinish ? "Confirmer" : "Terminer"}
              </Button>
              <p className="text-center font-mono text-[11px] text-subtle-foreground">
                {answeredCount} / {questions.length} répondues
              </p>
            </div>
          )}
        </nav>

        {/* Main question area */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-foreground">Q{q.orderIndex}</span>
              <LevelBadge level={q.level} />
              <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {TYPE_LABELS[q.type]}
              </span>
            </div>
            {finished && (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  chosen === q.answer ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
              >
                {chosen === q.answer ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Correct
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> {chosen === undefined ? "Sans réponse" : "Incorrect"}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Question card */}
          <div className="space-y-4 rounded-xl border border-border/70 bg-surface px-6 py-5">
            <p className="text-lg leading-snug text-foreground">{q.questionText}</p>

            <QuestionMedia question={q} ref={audioRef} />

            <OptionList
              options={q.options}
              chosen={chosen}
              answer={q.answer}
              revealed={finished}
              audioOnly={audioOnly}
              onChoose={choose}
            />

            {finished && q.explanationMeta && <VerdictBar meta={q.explanationMeta} chosen={chosen} answer={q.answer} />}
          </div>

          {/* Prev / Next */}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Précédent
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              {currentIndex + 1} / {questions.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === questions.length - 1}
            >
              Suivant
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {!finished && (
            <p className="mt-2 text-center font-mono text-[10px] text-subtle-foreground">
              A–D pour répondre · ← → pour naviguer{q.type !== "reading_mcq" ? " · Espace lecture · R recule" : ""}
            </p>
          )}

          {/* Transcript + explanation sit below the nav: a long explanation must not
              push Suivant off-screen. */}
          {finished && q.transcript && (
            <div className="mt-4 rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-subtle-foreground">
                Transcription
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{q.transcript}</p>
            </div>
          )}

          {finished && q.explanation && (
            <div className="mt-4">
              <ExplanationPanel markdown={q.explanation} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
