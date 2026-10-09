import { cn } from "@/lib/utils";

/** Marks a feature a guest can preview but not use. */
export function PreviewBadge({ className }: { className?: string }) {
  return (
    <span className={cn("rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground", className)}>
      Preview
    </span>
  );
}
