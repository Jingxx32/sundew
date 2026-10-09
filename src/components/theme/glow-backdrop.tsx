import { cn } from "@/lib/utils";

const PLACEMENT = {
  hero: "-right-[120px] -top-[160px]",
  centered: "left-1/2 -top-[260px] -translate-x-1/2",
} as const;

/** Decorative blue/pink glow; place inside a `relative` parent. */
export function GlowBackdrop({ placement = "hero" }: { placement?: keyof typeof PLACEMENT }) {
  return (
    <div
      aria-hidden="true"
      className={cn("glow-backdrop pointer-events-none absolute size-[720px] rounded-full blur-[10px]", PLACEMENT[placement])}
    />
  );
}
