import * as React from "react";

import { cn } from "@/lib/utils";

type FilterChipProps = React.ComponentPropsWithoutRef<"button"> & {
  active: boolean;
};

/** A consistent, accessible toggle treatment for filters throughout Sundew. */
export function FilterChip({ active, className, type = "button", ...props }: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border/60 bg-surface text-muted-foreground hover:border-accent/30 hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
