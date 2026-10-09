import { cn } from "@/lib/utils";

/** Full-height, clipped wrapper for pages that place a GlowBackdrop. */
export function GlowTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("relative min-h-screen overflow-hidden", className)}>{children}</div>;
}
