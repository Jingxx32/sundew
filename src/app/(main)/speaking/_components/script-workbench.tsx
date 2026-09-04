"use client";

import { useMemo, useState, useTransition } from "react";
import { Sparkles, Pencil, Check } from "lucide-react";
import type { SpeakingPrompt, SpeakingScript, SessionScores } from "@/lib/db/schema";
import {
  generateScript,
  updateScript,
  startScriptSession,
  finishScriptSession,
} from "@/lib/actions/speaking";
import { splitSentences } from "@/lib/speaking/sentences";
import { Button } from "@/components/ui/button";
import { SentenceRow, type SentenceResult } from "./sentence-row";

type Props = { prompt: SpeakingPrompt; initialScript: SpeakingScript | null };

export function ScriptWorkbench({ prompt, initialScript }: Props) {
  const [script, setScript] = useState(initialScript);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialScript?.content ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, SentenceResult>>({});
  const [finalScores, setFinalScores] = useState<SessionScores | null>(null);
  const [isPending, startTransition] = useTransition();

  const sentences = useMemo(() => (script ? splitSentences(script.content) : []), [script]);

  function handleGenerate() {
    startTransition(async () => {
      const s = await generateScript(prompt.id);
      setScript(s);
      setDraft(s.content);
      setSessionId(null);
      setResults({});
      setFinalScores(null);
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      if (script) {
        await updateScript(script.id, draft);
        setScript({ ...script, content: draft });
      }
      setEditing(false);
      setSessionId(null);
      setResults({});
      setFinalScores(null);
    });
  }

  function handleStart() {
    startTransition(async () => {
      setFinalScores(null);
      setResults({});
      setSessionId(await startScriptSession(prompt.id));
    });
  }

  function handleFinish() {
    startTransition(async () => {
      if (!sessionId) return;
      setFinalScores(await finishScriptSession(sessionId));
      setSessionId(null);
    });
  }

  if (!script) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-sm text-muted-foreground mb-5">
          Generate a reference script from your speaking profile, then practice it line by line.
        </p>
        <Button onClick={handleGenerate} disabled={isPending}>
          <Sparkles className="h-4 w-4 mr-2" />
          {isPending ? "Generating…" : "Generate script"}
        </Button>
      </div>
    );
  }

  const scoredCount = Object.keys(results).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Script panel */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">Reference script</h2>
          <div className="flex items-center gap-2">
            {editing ? (
              <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3" /> Regenerate
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
          />
        ) : (
          <article className="reading-prose text-[15px] whitespace-pre-wrap">
            {script.content}
          </article>
        )}
      </section>

      {/* Practice panel */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">
            Read-aloud practice
            {sessionId && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {scoredCount}/{sentences.length} scored
              </span>
            )}
          </h2>
          {sessionId ? (
            <Button size="sm" onClick={handleFinish} disabled={isPending || scoredCount === 0}>
              Finish
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={isPending || sentences.length === 0}>
              Start practice
            </Button>
          )}
        </div>

        {finalScores && (
          <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 flex gap-6 text-sm">
            {(
              [
                ["Overall", finalScores.overall],
                ["Accuracy", finalScores.accuracy],
                ["Fluency", finalScores.fluency],
                ["Completeness", finalScores.completeness],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <div className="font-mono text-lg text-accent">{v}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        <ol className="space-y-3">
          {sentences.map((sentence, i) => (
            <SentenceRow
              key={`${script.id}-${i}`}
              index={i}
              sentence={sentence}
              sessionId={sessionId}
              result={results[i] ?? null}
              onResult={(r) => setResults((prev) => ({ ...prev, [i]: r }))}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
