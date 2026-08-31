import { cn } from "@/lib/utils";
import { levelBadgeStyle } from "@/lib/tcf/display";
import type { TcfLevel } from "@/lib/actions/tcf";

/** CECR level as ink depth — see lib/tcf/display.ts for why. */
export function LevelBadge({ level, className }: { level: TcfLevel; className?: string }) {
  return (
    <span
      style={levelBadgeStyle(level)}
      className={cn("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold", className)}
    >
      {level}
    </span>
  );
}
