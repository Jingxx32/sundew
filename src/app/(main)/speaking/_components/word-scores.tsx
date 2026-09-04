"use client";

import type { TurnAssessment } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Renders the reference sentence with per-word colour from Azure scores.
 * With miscue detection on, Azure's word list covers the full reference
 * text in order, including Omission/Insertion error types, so rendering
 * the word list is rendering the sentence.
 */
export function WordScores({ words }: { words: TurnAssessment["words"] }) {
  return (
    <p className="text-[15px] leading-relaxed">
      {words.map((w, i) => (
        <span key={i}>
          <span
            title={[
              `${Math.round(w.accuracyScore)}${w.errorType !== "None" ? ` · ${w.errorType}` : ""}`,
              ...w.phonemes.map((p) => `/${p.phoneme}/ ${Math.round(p.accuracyScore)}`),
            ].join("\n")}
            className={cn(
              "rounded px-0.5 transition-colors",
              w.errorType === "Omission" && "bg-danger/10 text-danger line-through",
              w.errorType === "Insertion" && "bg-warning/10 text-muted-foreground italic",
              w.errorType === "Mispronunciation" && "text-danger underline decoration-wavy",
              w.errorType === "None" &&
                (w.accuracyScore >= 80
                  ? "text-success"
                  : w.accuracyScore >= 60
                    ? "text-warning"
                    : "text-danger"),
            )}
          >
            {w.word}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}
