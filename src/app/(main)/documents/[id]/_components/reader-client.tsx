"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  createReadingSession,
  updateReadingProgress,
  updateSessionDuration,
} from "@/lib/actions/reading";
import { generateWritingTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/db/schema";
import { WordLookupPopover } from "@/components/word-lookup-popover";
import { SessionSidebar } from "./session-sidebar";

type Props = {
  doc: Document;
  paragraphs: string[];
  initialSavedWords: string[];
};

export function ReaderShell({ doc, paragraphs, initialSavedWords }: Props) {
  const router = useRouter();
  const articleRef = useRef<HTMLElement>(null);
  const [savedWords, setSavedWords] = useState<string[]>(initialSavedWords);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const level = (doc.estimatedLevel ?? "B1") as CefrLevel;

  // Reading-session lifecycle:
  //  - Lazy create after 15s so a quick open (or StrictMode's throwaway mount,
  //    whose cleanup clears the timer before it fires) leaves no noise session.
  //  - Heartbeat every 30s flushes duration, so a hard tab-close still persists
  //    the time already spent — an unmount-only flush wouldn't survive that.
  useEffect(() => {
    const start = Date.now();
    let sessionId: string | null = null;
    let active = true;

    const flush = () => {
      if (sessionId) {
        void updateSessionDuration(
          sessionId,
          Math.round((Date.now() - start) / 1000),
        );
      }
    };

    const createTimer = setTimeout(async () => {
      const id = await createReadingSession(doc.id);
      if (active) sessionId = id;
      // Unmounted while the create was in flight — flush and drop it.
      else void updateSessionDuration(id, Math.round((Date.now() - start) / 1000));
    }, 15_000);

    const heartbeat = setInterval(flush, 30_000);

    return () => {
      active = false;
      clearTimeout(createTimer);
      clearInterval(heartbeat);
      flush();
    };
  }, [doc.id]);

  // Reading progress via IntersectionObserver
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const paras = Array.from(article.querySelectorAll("p"));
    if (paras.length === 0) return;

    let lastReported = 0;
    const seen = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = paras.indexOf(entry.target as HTMLParagraphElement);
            if (idx !== -1) seen.add(idx);
          }
        });
        const progress = Math.round((seen.size / paras.length) * 100);
        if (progress > lastReported) {
          lastReported = progress;
          void updateReadingProgress(doc.id, progress);
        }
      },
      { threshold: 0.5 },
    );

    paras.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [doc.id]);

  async function handleGenerateTask(vocabWords: string[] = []) {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const taskId = await generateWritingTask(doc.id, vocabWords);
      router.push(`/practice?taskId=${taskId}`);
    } catch {
      setGenerateError("Failed to generate task. Check your API key in Settings.");
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] min-h-screen relative">
      {/* Main reading column */}
      <div className="px-10 py-10 max-w-[820px] w-full mx-auto">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-bold tracking-[-0.03em] break-words">
              {doc.title}
            </h1>
            {doc.source && (
              <p className="mt-1 text-sm text-muted-foreground">{doc.source}</p>
            )}
          </div>
          <Button
            variant="default"
            disabled={isGenerating}
            onClick={() => handleGenerateTask()}
            className="self-start shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Writing Task
          </Button>
        </div>

        {generateError && (
          <p className="mb-4 text-sm text-danger bg-danger-soft rounded-lg px-4 py-2">
            {generateError}
          </p>
        )}

        <div className="flex items-center gap-2 mb-10">
          <Chip className={cn("ring-0", CEFR_CHIP_CLASSES[level])}>{level}</Chip>
          <Chip>{doc.wordCount.toLocaleString()} words</Chip>
          {doc.readingProgress > 0 && (
            <Chip>{doc.readingProgress}% read</Chip>
          )}
        </div>

        <article ref={articleRef} className="reading-prose">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </article>
      </div>

      {/* Word lookup popover — absolute within the grid */}
      <WordLookupPopover
        containerRef={articleRef}
        source={{ type: "reading", documentId: doc.id }}
        savedLemmas={savedWords}
        onSaved={(lemma) => setSavedWords((prev) => (prev.includes(lemma) ? prev : [...prev, lemma]))}
      />

      {/* This Session sidebar */}
      <SessionSidebar
        savedWords={savedWords}
        isGenerating={isGenerating}
        onGenerateFromWords={() => handleGenerateTask(savedWords)}
      />
    </div>
  );
}
