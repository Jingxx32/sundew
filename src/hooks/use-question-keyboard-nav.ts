"use client";

import { useEffect } from "react";

interface QuestionKeyboardNavOptions {
  optionCount: number;
  onChoose: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause?: () => void;
  onRewind?: () => void;
  /** Disable option keys once the question is locked (answer shown / exam finished). */
  choiceLocked: boolean;
}

const LETTER_TO_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };

/**
 * A→D / 1→4 choose an option, ←/→ move between questions, Space toggles
 * audio playback, R rewinds it. Ignored while focus is in a form field so it
 * never steals typing (the write-passage flow and future text inputs), and
 * ignored while focus is on the audio player's own seek slider — that
 * element binds ←/→/Home/End itself to scrub the track, and without this
 * guard both handlers fire on the same keypress: the slider seeks, then this
 * hook immediately navigates to the next question, snapping the seek right
 * back to zero on the new track.
 */
export function useQuestionKeyboardNav({
  optionCount,
  onChoose,
  onPrev,
  onNext,
  onPlayPause,
  onRewind,
  choiceLocked,
}: QuestionKeyboardNavOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target && target.getAttribute("role") === "slider") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (!choiceLocked) {
        const letterIndex = LETTER_TO_INDEX[key];
        const numberIndex = /^[1-4]$/.test(key) ? Number(key) - 1 : undefined;
        const index = letterIndex ?? numberIndex;
        if (index !== undefined && index < optionCount) {
          event.preventDefault();
          onChoose(index);
          return;
        }
      }

      if (key === "arrowleft") {
        event.preventDefault();
        onPrev();
      } else if (key === "arrowright") {
        event.preventDefault();
        onNext();
      } else if (key === " " && onPlayPause) {
        event.preventDefault();
        onPlayPause();
      } else if (key === "r" && onRewind) {
        event.preventDefault();
        onRewind();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [optionCount, onChoose, onPrev, onNext, onPlayPause, onRewind, choiceLocked]);
}
