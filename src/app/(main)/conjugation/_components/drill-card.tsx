"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  recordConjugationAttempt,
  type DrillItem,
  type GradeResult,
} from "@/lib/actions/conjugation";

export function DrillCard({ queue }: { queue: DrillItem[] }) {
  const router = useRouter();
  // The card plays its own deck. A refresh (e.g. a server action revalidating
  // this page) hands down a new random queue; adopt it only for "New round".
  const [deck, setDeck] = useState(queue);
  const [seenQueue, setSeenQueue] = useState(queue);
  const [roundRequested, setRoundRequested] = useState(false);
  if (queue !== seenQueue) {
    setSeenQueue(queue);
    if (roundRequested) {
      setDeck(queue);
      setRoundRequested(false);
    }
  }
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [score, setScore] = useState(0);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const request = useRef<Parameters<typeof recordConjugationAttempt>[0] | null>(null);
  const saving = useRef(false);

  const item = deck[index];
  const finished = index >= deck.length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || result || !input.trim() || saving.current) return;
    // Freeze one logical submission until its saved result is confirmed.
    // A lost response retries the same payload and key, rather than adding history.
    request.current ??= {
      verb: item.verb, tense: item.tense, person: item.person, userInput: input,
      requestKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    };
    saving.current = true;
    setSubmitted(true);
    setSaveError(null);
    startTransition(async () => {
      try {
        const graded = await recordConjugationAttempt(request.current!);
        setResult(graded);
        if (graded.correct) setScore((s) => s + 1);
      } catch {
        setSaveError("Could not confirm that your answer was saved. Retry to confirm it.");
      } finally { saving.current = false; }
    });
  }

  function handleNext() {
    setIndex((i) => i + 1);
    setInput("");
    setResult(null);
    request.current = null;
    setSubmitted(false);
    setSaveError(null);
  }

  function handleNewRound() {
    setIndex(0);
    setScore(0);
    setInput("");
    setResult(null);
    request.current = null;
    setSubmitted(false);
    setSaveError(null);
    // refresh() re-renders the page → fresh random queue + updated stats
    setRoundRequested(true);
    startTransition(() => router.refresh());
  }

  if (deck.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
        <p className="text-xl">No drills available.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The verb list could not be loaded — try reloading the page.
        </p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="rounded-2xl bg-surface shadow-card px-8 py-12 text-center">
        <p className="text-[30px] font-bold tracking-[-0.03em]">
          {score}/{deck.length} correct
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Attempts saved — your mastery list below is up to date.
        </p>
        <Button className="mt-6" onClick={handleNewRound} disabled={pending}>
          <RefreshCw className="h-4 w-4" />
          New round
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface shadow-card px-8 py-8">
      {/* Prompt */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Chip variant="accent">{item.tense}</Chip>
          {item.fromErrors && <Chip variant="warning">from your errors</Chip>}
        </div>
        <span className="text-xs text-muted-foreground">
          {index + 1} / {deck.length}
        </span>
      </div>

      <p className="text-[30px] font-bold tracking-[-0.03em]">
        {item.verb}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Conjugate for{" "}
        <span className="font-medium text-foreground">{item.personLabel}</span>
        {item.pronominal && " — include the reflexive pronoun (me, te, se…)"}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={submitted || result !== null || pending}
          maxLength={200}
          placeholder={item.pronominal ? "me …" : "Type the form…"}
          className="max-w-sm text-base"
          lang="fr"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        {result === null ? (
          <Button type="submit" disabled={pending || !input.trim()}>
            {pending ? "Saving…" : saveError ? "Retry save" : "Check"}
          </Button>
        ) : (
          <Button type="button" onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </form>
      {saveError && <p role="alert" className="mt-3 text-sm text-danger">{saveError}</p>}

      {/* Verdict */}
      {result && (
        <div
          className={cn(
            "mt-5 rounded-xl px-4 py-3 text-sm",
            result.correct
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger",
          )}
        >
          <p className="flex items-center gap-1.5 font-medium">
            {result.correct ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {result.correct ? "Correct." : "Incorrect."}
          </p>
          <p className="mt-1">
            {item.personLabel.split(" ")[0]}{" "}
            <span className="font-semibold">{result.expected}</span>
            {result.accepted.length > 1 && (
              <span className="text-xs">
                {" "}
                (also accepted: {result.accepted.slice(1).join(", ")})
              </span>
            )}
          </p>
          <p className="mt-2 text-xs opacity-80">{result.ruleHint}</p>
        </div>
      )}
    </div>
  );
}
