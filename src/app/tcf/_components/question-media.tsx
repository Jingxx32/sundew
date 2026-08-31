import { forwardRef } from "react";
import Image from "next/image";
import { ReadingPassage } from "./reading-passage";
import { AudioPlayer, type AudioPlayerHandle } from "./audio-player";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";

/** Renders whichever of image / reading passage / audio the question carries. */
export const QuestionMedia = forwardRef<AudioPlayerHandle, { question: TcfQuestionForDrill }>(
  function QuestionMedia({ question: q }, audioRef) {
    if (q.type === "image" && q.imagePath) {
      return (
        <Image
          src={q.imagePath}
          alt={`Question ${q.orderIndex} image`}
          width={600}
          height={400}
          className="max-h-64 w-full rounded-lg border border-border/50 object-contain"
          unoptimized
        />
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

    if (q.type !== "reading_mcq") {
      return q.audioPath ? (
        <AudioPlayer ref={audioRef} src={q.audioPath} />
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
          Audio à générer
        </p>
      );
    }

    return null;
  },
);
