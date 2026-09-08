"use client";

import { useTransition } from "react";
import { CEFR_LEVELS, CEFR_CHIP_CLASSES } from "@/lib/cefr";
import type { CefrLevel } from "@/lib/cefr";
import { setCefrLevel } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";

type Props = {
  currentLevel: CefrLevel | null;
};

export function CefrLevelPicker({ currentLevel }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSelect(level: CefrLevel) {
    startTransition(async () => {
      await setCefrLevel(level);
    });
  }

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Select your CEFR level</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="CEFR level">
        {CEFR_LEVELS.map((level) => {
          const isActive = currentLevel === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isPending}
              onClick={() => handleSelect(level)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium ring-1 transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
                isActive
                  ? CEFR_CHIP_CLASSES[level]
                  : "bg-surface border border-border text-muted-foreground hover:text-foreground ring-transparent",
                isPending && isActive && "opacity-70",
              )}
            >
              {level}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
