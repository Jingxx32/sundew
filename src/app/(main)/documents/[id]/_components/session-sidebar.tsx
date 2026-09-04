"use client";

import { useEffect, useState } from "react";
import { Clock, BookOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  savedWords: string[];
  isGenerating: boolean;
  onGenerateFromWords: () => void;
};

export function SessionSidebar({ savedWords, isGenerating, onGenerateFromWords }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr =
    minutes > 0
      ? `${minutes}m ${secs.toString().padStart(2, "0")}s`
      : `${secs}s`;

  return (
    <aside className="hidden xl:flex flex-col border-l border-border/60 bg-surface-muted/40 px-6 py-10">
      <div className="text-[11px] uppercase tracking-wider text-accent font-medium mb-5">
        This Session
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-6">
        <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Reading" value={timeStr} />
        <Stat
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Looked up"
          value={String(savedWords.length)}
        />
      </div>

      {/* Vocabulary list */}
      {savedWords.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Select any word in the text to look it up and save it here.
        </p>
      ) : (
        <div className="space-y-1 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Saved vocabulary
          </div>
          {savedWords.map((word) => (
            <div
              key={word}
              className="text-sm text-foreground bg-surface rounded-lg px-3 py-1.5 border border-border/60"
            >
              {word}
            </div>
          ))}
        </div>
      )}

      {/* Generate from words button — shown once at least one word is saved */}
      {savedWords.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border/60">
          <Button
            variant="soft"
            size="sm"
            disabled={isGenerating}
            onClick={onGenerateFromWords}
            className="w-full"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Task from these {savedWords.length} word{savedWords.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </aside>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
