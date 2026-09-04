import { forwardRef } from "react";
import Image from "next/image";
import { ReadingPassage } from "./reading-passage";
import { AudioPlayer, type AudioPlayerHandle } from "./audio-player";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";

/** Renders whichever of image / reading passage / audio the question carries. */
export const QuestionMedia = forwardRef<AudioPlayerHandle, { question: TcfQuestionForDrill }>(
  function QuestionMedia({ question: q }, audioRef) {
    // Every listening type gets a player: on an `image` question the picture is
    // only the referent — the four propositions exist solely in the audio, so
    // without this the question is unanswerable (and the "Espace lecture"
    // shortcut the page advertises had nothing to drive).
    const audio =
      q.type === "reading_mcq" ? null : q.audioPath ? (
        <AudioPlayer ref={audioRef} src={q.audioPath} />
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
          Audio à générer
        </p>
      );

    if (q.type === "image" && q.imagePath) {
      return (
        <div className="space-y-3">
          <Image
            src={q.imagePath}
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

    if (q.type === "reading_mcq" && !q.passage && q.imagePath) {
      return (
        <Image
          src={q.imagePath}
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
