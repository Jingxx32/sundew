"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Check, X, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExplanationPanel } from "./explanation-panel";
import { ReadingPassage } from "./reading-passage";
import { recordTcfExamAttempt } from "@/lib/actions/tcf";
import type { TcfQuestionForDrill, TcfLevel, TcfExamAnswer } from "@/lib/actions/tcf";
import type { TcfPerLevel } from "@/lib/db/schema";

const LEVEL_ORDER: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const LEVEL_COLORS: Record<TcfLevel, { bg: string; text: string }> = {
  A1: { bg: "bg-success-soft", text: "text-success" },
  A2: { bg: "bg-success-soft", text: "text-success" },
  B1: { bg: "bg-warning-soft", text: "text-warning" },
  B2: { bg: "bg-warning-soft", text: "text-warning" },
  C1: { bg: "bg-accent-soft", text: "text-accent" },
  C2: { bg: "bg-accent-soft", text: "text-accent" },
};

const TYPE_LABELS: Record<TcfQuestionForDrill["type"], string> = {
  image: "Image",
  spoken_options: "Écoute",
  dialogue: "Dialogue",
  reading_mcq: "Lecture",
};

interface ExamRunnerProps {
  questions: TcfQuestionForDrill[];
  skill: "listening" | "reading";
  testNumber: number;
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

export function ExamRunner({ questions, skill, testNumber }: ExamRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // answers[i] = chosen option index for questions[i]
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const byLevel = useMemo(() => {
    const groups: Partial<Record<TcfLevel, number[]>> = {};
    questions.forEach((q, idx) => {
      (groups[q.level] ??= []).push(idx);
    });
    return groups;
  }, [questions]);

  const answeredCount = Object.keys(answers).length;

  const score = useMemo(
    () => (finished ? computeScore(questions, answers) : null),
    [finished, answers, questions],
  );

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aucune question disponible.
      </div>
    );
  }

  const q = questions[currentIndex];
  const levelColors = LEVEL_COLORS[q.level];
  const chosen = answers[currentIndex];

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
    void recordTcfExamAttempt({
      setId: questions[0]?.setId ?? null,
      skill,
      testNumber,
      score: result.correct,
      total: result.total,
      perLevel: result.perLevel,
      answers: result.perQuestion,
    }).catch(() => {});
  }

  return (
    <div className="flex gap-6 min-h-0">
      {/* Left nav — status map */}
      <nav className="w-[180px] shrink-0 space-y-4">
        {/* Score panel (review mode) */}
        {score && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-3 space-y-2">
            <p className="font-serif text-2xl font-semibold text-foreground">
              {score.correct}<span className="text-base text-muted-foreground"> / {score.total}</span>
            </p>
            <div className="space-y-1">
              {LEVEL_ORDER.filter((l) => score.perLevel[l]).map((l) => (
                <div key={l} className="flex items-center justify-between text-[11px]">
                  <span className={cn("font-mono font-bold", LEVEL_COLORS[l].text)}>{l}</span>
                  <span className="text-muted-foreground">
                    {score.perLevel[l]!.correct}/{score.perLevel[l]!.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {LEVEL_ORDER.filter((l) => byLevel[l]).map((level) => (
          <div key={level}>
            <p className={cn("text-[11px] uppercase tracking-widest font-medium mb-1.5", LEVEL_COLORS[level].text)}>
              {level}
            </p>
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
                    className={cn(
                      "h-7 w-7 rounded text-xs font-medium transition-colors",
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
          <div className="pt-2 space-y-2">
            {confirmFinish && (
              <p className="text-[11px] text-warning leading-snug">
                {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? "s" : ""} sans
                réponse. Terminer quand même ?
              </p>
            )}
            <Button
              variant={confirmFinish ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={handleFinish}
            >
              <Flag className="h-3.5 w-3.5 mr-1.5" />
              {confirmFinish ? "Confirmer" : "Terminer"}
            </Button>
            <p className="text-[11px] text-subtle-foreground text-center">
              {answeredCount} / {questions.length} répondues
            </p>
          </div>
        )}
      </nav>

      {/* Main question area */}
      <div className="flex-1 min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg font-semibold text-foreground">
              Q{q.orderIndex}
            </span>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold font-mono", levelColors.bg, levelColors.text)}>
              {q.level}
            </span>
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
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
                <><Check className="h-3.5 w-3.5" /> Correct</>
              ) : (
                <><X className="h-3.5 w-3.5" /> {chosen === undefined ? "Sans réponse" : "Incorrect"}</>
              )}
            </span>
          )}
        </div>

        {/* Question card */}
        <div className="rounded-xl border border-border/70 bg-surface px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground italic">{q.questionText}</p>

          {q.type === "image" && (
            <div className="rounded-lg overflow-hidden border border-border/50 bg-surface-muted">
              {q.imagePath ? (
                <Image
                  src={q.imagePath}
                  alt={`Question ${q.orderIndex} image`}
                  width={600}
                  height={400}
                  className="w-full object-contain max-h-64"
                  unoptimized
                />
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Image non disponible
                </div>
              )}
            </div>
          )}

          {/* Reading — text passage or document image */}
          {q.type === "reading_mcq" && q.passage && (
            <ReadingPassage passage={q.passage} />
          )}
          {q.type === "reading_mcq" && !q.passage && q.imagePath && (
            <div className="rounded-lg overflow-hidden border border-border/50 bg-surface-muted">
              <Image
                src={q.imagePath}
                alt={`Document question ${q.orderIndex}`}
                width={800}
                height={520}
                className="w-full object-contain"
                unoptimized
              />
            </div>
          )}

          {q.type !== "reading_mcq" &&
            (q.audioPath ? (
              <audio controls src={q.audioPath} className="w-full" />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-surface-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">Audio non disponible</p>
              </div>
            ))}

          {/* Options — selectable in exam mode.
              image / spoken_options stay audio-only until the test is finished. */}
          <div className="space-y-1.5">
            {q.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const audioOnly = q.type === "image" || q.type === "spoken_options";
              const showText = !audioOnly || finished;
              const isChosen = chosen === i;
              const isCorrect = i === q.answer;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  disabled={finished}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                    finished
                      ? isCorrect
                        ? "border-success/40 bg-success-soft text-success"
                        : isChosen
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : "border-border/60 bg-surface text-foreground"
                      : isChosen
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-border/60 bg-surface text-foreground hover:border-accent/30 hover:bg-accent-soft/40 cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                      finished && isCorrect
                        ? "border-success text-success"
                        : finished && isChosen
                          ? "border-danger text-danger"
                          : isChosen
                            ? "border-accent text-accent"
                            : "border-border",
                    )}
                  >
                    {finished && isCorrect ? <Check className="h-3 w-3" /> : letter}
                  </span>
                  {showText ? (
                    <span>{option}</span>
                  ) : (
                    <span className={isChosen ? "" : "text-muted-foreground"}>
                      {q.type === "spoken_options" ? "Réponse" : "Proposition"} {letter}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Transcript (review mode) */}
          {finished && q.transcript && (
            <div className="rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-widest text-subtle-foreground font-medium mb-1.5">
                Transcription
              </p>
              <p className="text-sm font-serif leading-relaxed text-foreground whitespace-pre-wrap">
                {q.transcript}
              </p>
            </div>
          )}

          {/* Explanation (review mode) */}
          {finished && q.explanation && <ExplanationPanel markdown={q.explanation} />}
        </div>

        {/* Prev / Next */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {questions.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === questions.length - 1}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
