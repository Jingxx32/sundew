"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { gradeGapReview, setGapStatus, type GapReviewCard } from "@/lib/actions/vocab-gaps";

const norm = (s: string) => s.toLowerCase().normalize("NFC").trim();

const TYPE_LABEL: Record<GapReviewCard["gapType"], string> = {
  recognition: "Inconnu",
  listening: "Mal entendu",
  production: "À réemployer",
};

function noopSubscribe() {
  return () => {};
}
const getTtsSnapshot = () => typeof window !== "undefined" && "speechSynthesis" in window;
const getTtsServerSnapshot = () => false;

/** True once hydrated on a browser that supports SpeechSynthesis; false during SSR. */
function useTtsSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, getTtsSnapshot, getTtsServerSnapshot);
}

/** Replace the first occurrence of the lemma or surface in the sentence with a blank. */
function blankOut(sentence: string, lemma: string, surface: string): string | null {
  for (const word of [surface, lemma]) {
    const idx = sentence.toLowerCase().indexOf(word.toLowerCase());
    if (idx >= 0) {
      return `${sentence.slice(0, idx)}____${sentence.slice(idx + word.length)}`;
    }
  }
  return null;
}

export function GapReviewRunner({ initialCards }: { initialCards: GapReviewCard[] }) {
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [answered, setAnswered] = useState<{ correct: boolean } | null>(null);
  const [pendingCorrect, setPendingCorrect] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [summary, setSummary] = useState({ right: 0, wrong: 0, promoted: 0 });
  const [done, setDone] = useState(index >= cards.length);
  const ttsSupported = useTtsSupported();

  const card = cards[index];

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !card) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(card.lemma);
    u.lang = "fr-FR";
    window.speechSynthesis.speak(u);
  }, [card]);

  useEffect(() => {
    if (card?.gapType === "listening" && ttsSupported && !answered) speak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, ttsSupported]);

  const grade = useCallback(
    async (correct: boolean) => {
      if (!card || saving || answered) return;
      setSaving(true);
      setSaveError(false);
      setPendingCorrect(correct);
      try {
        const result = await gradeGapReview(card.gapId, correct);
        setAnswered({ correct });
        setSummary((s) => ({
          right: s.right + (correct ? 1 : 0),
          wrong: s.wrong + (correct ? 0 : 1),
          promoted: s.promoted + (result.status === "mastered" ? 1 : 0),
        }));
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    },
    [card, saving, answered],
  );

  function choose(i: number) {
    if (answered || saving || !card) return;
    setChosen(i);
    grade(i === card.answerIndex);
  }

  function submitProduction() {
    if (answered || saving || !card || !inputValue.trim()) return;
    const val = norm(inputValue);
    grade(val === norm(card.lemma) || val === norm(card.surface));
  }

  function next() {
    if (index + 1 >= cards.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setChosen(null);
    setInputValue("");
    setAnswered(null);
    setSaveError(false);
    setPendingCorrect(null);
  }

  async function markStatus(status: "mastered" | "dismissed") {
    if (!card) return;
    await setGapStatus(card.gapId, status).catch(() => {});
    next();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (done || !card) return;
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Enter") {
          if (!answered) submitProduction();
          else next();
        }
        return;
      }
      if (!answered && card.choices.length > 0) {
        const letterIndex = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
        if (letterIndex >= 0 && letterIndex < card.choices.length) {
          choose(letterIndex);
          return;
        }
      }
      if (e.key === "Enter" && answered) next();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, answered, saving, inputValue, done]);

  if (cards.length === 0 || done) {
    return cards.length === 0 ? (
      <div className="rounded-xl border border-border/70 bg-surface px-6 py-10 text-center">
        <p className="font-serif text-lg">Rien à réviser aujourd&rsquo;hui</p>
        <p className="mt-1 text-sm text-muted-foreground">Revenez quand des mots arriveront à échéance.</p>
        <Link href="/vocabulary" className="mt-4 inline-block text-sm text-accent hover:underline">
          Retour au vocabulaire
        </Link>
      </div>
    ) : (
      <div className="rounded-xl border border-border/70 bg-surface px-6 py-10 text-center">
        <p className="font-serif text-lg">
          {summary.right} justes · {summary.wrong} fautes · {summary.promoted} promues
        </p>
        <Link href="/vocabulary" className="mt-4 inline-block text-sm text-accent hover:underline">
          Retour au vocabulaire
        </Link>
      </div>
    );
  }

  const showWordText = card.gapType !== "listening" || !ttsSupported || answered !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} / {cards.length} · {TYPE_LABEL[card.gapType]} · boîte {card.box}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => markStatus("mastered")}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-success"
          >
            Acquis
          </button>
          <button
            type="button"
            onClick={() => markStatus("dismissed")}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-danger"
          >
            Retirer
          </button>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border/70 bg-surface px-6 py-5">
        {card.gapType === "production" ? (
          <ProductionCard
            card={card}
            answered={answered}
            inputValue={inputValue}
            onChange={setInputValue}
            onSubmit={submitProduction}
            saving={saving}
          />
        ) : (
          <>
            <div className="text-center">
              {card.gapType === "listening" && !answered && (
                <button
                  type="button"
                  onClick={speak}
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                  aria-label="Écouter"
                >
                  <Volume2 className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {showWordText && (
                <p className="mt-3 font-serif text-2xl">{card.surface}</p>
              )}
            </div>
            <div className="space-y-1.5">
              {card.choices.map((choice, i) => {
                const isCorrect = i === card.answerIndex;
                const isChosen = chosen === i;
                const wrong = answered && isChosen && !isCorrect;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={answered !== null}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors",
                      answered && isCorrect
                        ? "border-success/40 bg-success-soft text-success"
                        : wrong
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : answered
                            ? "border-border/60 bg-surface text-foreground"
                            : isChosen
                              ? "border-accent/50 bg-accent-soft text-accent"
                              : "border-border/60 bg-surface text-foreground hover:border-accent/30 hover:bg-accent-soft/40 cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-medium",
                        answered && isCorrect
                          ? "border-success text-success"
                          : wrong
                            ? "border-danger text-danger"
                            : "border-border",
                      )}
                    >
                      {answered && isCorrect ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      ) : wrong ? (
                        <X className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {answered && (
          <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{card.lemma}</span> — {card.translation}
            {card.examples[0] && <p className="mt-1 font-serif text-xs italic">{card.examples[0]}</p>}
          </div>
        )}

        {saveError && (
          <div className="flex items-center justify-between rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <span>Échec de l&rsquo;enregistrement.</span>
            <button
              type="button"
              onClick={() => pendingCorrect !== null && grade(pendingCorrect)}
              className="font-medium underline"
            >
              Réessayer
            </button>
          </div>
        )}

        {answered && (
          <Button onClick={next} className="w-full">
            Suivant
          </Button>
        )}
      </div>
    </div>
  );
}

function ProductionCard({
  card,
  answered,
  inputValue,
  onChange,
  onSubmit,
  saving,
}: {
  card: GapReviewCard;
  answered: { correct: boolean } | null;
  inputValue: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const blanked = card.sentenceContext ? blankOut(card.sentenceContext, card.lemma, card.surface) : null;
  return (
    <div className="space-y-3 text-center">
      <p className="font-serif text-2xl">{card.translation}</p>
      {blanked && <p className="font-serif text-sm text-muted-foreground">{blanked}</p>}
      {!answered ? (
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Écrivez le mot en français…"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      ) : (
        <p
          className={cn(
            "rounded-lg px-3.5 py-2.5 text-sm font-medium",
            answered.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {answered.correct ? "Correct" : `La bonne réponse : ${card.lemma}`}
        </p>
      )}
      {!answered && (
        <Button onClick={onSubmit} disabled={saving || !inputValue.trim()} className="w-full">
          Valider
        </Button>
      )}
    </div>
  );
}
