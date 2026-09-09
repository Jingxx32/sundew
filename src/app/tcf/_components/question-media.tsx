"use client";

import { forwardRef, useEffect, useState } from "react";
import Image from "next/image";
import { ReadingPassage } from "./reading-passage";
import { AudioPlayer, type AudioPlayerHandle } from "./audio-player";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";

/** Renders whichever of image / reading passage / audio the question carries. */
function usePrivateMediaUrl(path: string | null): string | null {
  const [result, setResult] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;

    const controller = new AbortController();
    void fetch(`/api/media-url?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Media URL request failed.");
        return (await response.json()) as { url: string };
      })
      .then(({ url }) => {
        if (!controller.signal.aborted) setResult({ path, url });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Failed to load private media", error);
      });

    return () => controller.abort();
  }, [path]);

  return result?.path === path ? result.url : null;
}

export const QuestionMedia = forwardRef<AudioPlayerHandle, { question: TcfQuestionForDrill }>(
  function QuestionMedia({ question: q }, audioRef) {
    const imageUrl = usePrivateMediaUrl(q.imagePath);
    const audioUrl = usePrivateMediaUrl(q.audioPath);
    // Every listening type gets a player: on an `image` question the picture is
    // only the referent — the four propositions exist solely in the audio, so
    // without this the question is unanswerable (and the "Espace lecture"
    // shortcut the page advertises had nothing to drive).
    const audio =
      q.type === "reading_mcq" ? null : q.audioPath && audioUrl ? (
        <AudioPlayer ref={audioRef} src={audioUrl} />
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
          {q.audioPath ? "Chargement de l’audio…" : "Audio à générer"}
        </p>
      );

    if (q.type === "image" && q.imagePath && imageUrl) {
      return (
        <div className="space-y-3">
          <Image
            src={imageUrl}
            alt={`Question ${q.orderIndex} image`}
            width={600}
            height={400}
            className="max-h-64 w-full rounded-lg border border-border/50 object-contain"
            unoptimized
          />
          {audio}
        </div>
      );
    }

    if (q.type === "reading_mcq" && q.passage) {
      return <ReadingPassage passage={q.passage} />;
    }

    if (q.type === "reading_mcq" && !q.passage && q.imagePath && imageUrl) {
      return (
        <Image
          src={imageUrl}
          alt={`Document question ${q.orderIndex}`}
          width={800}
          height={520}
          className="w-full rounded-lg border border-border/50 object-contain"
          unoptimized
        />
      );
    }

    return audio;
  },
);
