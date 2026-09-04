"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { BookmarkPlus, ExternalLink, RefreshCw, X } from "lucide-react";
import {
  resolveLookup,
  reexplainInContext,
  saveVocabularyWord,
} from "@/lib/actions/vocabulary";
import type { LookupSource } from "@/lib/vocabulary/types";
import type { LookupResult } from "@/lib/ai/lookup";
import { useTextSelection } from "@/hooks/use-text-selection";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { cn } from "@/lib/utils";

type State =
  | { phase: "hidden" }
  | { phase: "loading"; word: string; x: number; y: number }
  | {
      phase: "ready";
      lemma: string;
      word: string;
      result: LookupResult;
      x: number;
      y: number;
      sentence: string;
    };

export function WordLookupPopover({
  containerRef,
  source,
  savedLemmas,
  onSaved,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  source: LookupSource;
  savedLemmas: string[];
  onSaved: (lemma: string) => void;
}) {
  const [state, setState] = useState<State>({ phase: "hidden" });
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  const onSelect = useCallback(
    (sel: { text: string; sentenceContext: string; rect: DOMRect } | null) => {
      if (!sel) return setState({ phase: "hidden" });
      const x = Math.min(sel.rect.left + sel.rect.width / 2, window.innerWidth - 320);
      const y = sel.rect.bottom + window.scrollY + 8;
      const requested = sel.text;
      setState({ phase: "loading", word: requested, x, y });
      startTransition(async () => {
        try {
          const { lemma, result } = await resolveLookup(requested, sel.sentenceContext, source);
          // Ignore a stale response if the user has since selected another word.
          setState((p) =>
            p.phase !== "hidden" && p.word === requested
              ? {
                  phase: "ready",
                  lemma,
                  word: requested,
                  result,
                  x,
                  y,
                  sentence: sel.sentenceContext,
                }
              : p,
          );
        } catch {
          // Only close if this word is still the one on screen.
          setState((p) =>
            p.phase !== "hidden" && p.word === requested ? { phase: "hidden" } : p,
          );
        }
      });
    },
    [source],
  );

  useTextSelection(containerRef, onSelect, popoverRef);

  if (state.phase === "hidden") return null;

  const { word, x, y } = state;

  return (
    <div
      ref={popoverRef}
      style={{ position: "absolute", left: x, top: y, transform: "translateX(-50%)" }}
      className="z-50 w-80 rounded-2xl border border-border bg-surface shadow-xl"
      onMouseDown={(e) => e.preventDefault()} // prevent selection loss
    >
      {state.phase === "loading" ? (
        <LoadingSkeleton word={word} onClose={() => setState({ phase: "hidden" })} />
      ) : (
        <LookupCard
          lemma={state.lemma}
          word={word}
          result={state.result}
          sentence={state.sentence}
          savedLemmas={savedLemmas}
          onSaved={onSaved}
          onClose={() => setState({ phase: "hidden" })}
        />
      )}
    </div>
  );
}

function LoadingSkeleton({ word, onClose }: { word: string; onClose: () => void }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold">{word}</span>
        <button onClick={onClose} className="text-subtle-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 animate-pulse">
        {[40, 64, 48, 80, 56].map((w, i) => (
          <div key={i} className="h-3 rounded bg-surface-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

function LookupCard({
  lemma,
  word,
  result,
  sentence,
  savedLemmas,
  onSaved,
  onClose,
}: {
  lemma: string;
  word: string;
  result: LookupResult;
  sentence: string;
  savedLemmas: string[];
  onSaved: (lemma: string) => void;
  onClose: () => void;
}) {
  const level = result.level as CefrLevel;
  const isSaved = savedLemmas.includes(lemma);
  const [inContext, setInContext] = useState(result.in_context);
  const [isReexplaining, startReexplain] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleSave() {
    startSave(async () => {
      await saveVocabularyWord(lemma);
      onSaved(lemma);
    });
  }

  function handleReexplain() {
    startReexplain(async () => {
      try {
        const ic = await reexplainInContext(lemma, sentence);
        setInContext(ic);
      } catch {
        // leave existing text on error
      }
    });
  }

  return (
    <div className="p-4 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground">{word}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{result.pos}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Chip className={cn("ring-0 text-[10px] py-0", CEFR_CHIP_CLASSES[level])}>
            {level}
          </Chip>
          <button onClick={onClose} className="text-subtle-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Divider />

      {/* Translation */}
      <Section label="Translation">
        <p className="text-foreground">{result.translation}</p>
      </Section>

      <Divider />

      {/* In this context */}
      <Section label="In this context">
        <p className="text-foreground">{inContext}</p>
        <button
          onClick={handleReexplain}
          disabled={isReexplaining}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", isReexplaining && "animate-spin")} />
          Re-explain in this sentence
        </button>
      </Section>

      <Divider />

      {/* Examples */}
      <Section label="Examples">
        <ul className="space-y-1">
          {result.examples.map((ex, i) => (
            <li key={i} className="text-foreground italic">
              {ex}
            </li>
          ))}
        </ul>
      </Section>

      <Divider />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          variant={isSaved ? "soft" : "outline"}
          className="flex-1"
          onClick={handleSave}
          disabled={isSaved || isSaving}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          {isSaved ? "Saved" : "+ Save to vocabulary"}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a
            href={`https://www.wordreference.com/fren/${encodeURIComponent(word)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dict
          </a>
        </Button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-accent font-medium">{label}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50" />;
}
