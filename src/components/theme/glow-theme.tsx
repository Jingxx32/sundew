import { Geist, Plus_Jakarta_Sans } from "next/font/google";

import { cn } from "@/lib/utils";

// Loaded here, not in the root layout, so only pages using the theme fetch them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: "800", variable: "--font-jakarta" });

/** Wraps a page in the soft-glow theme (see `.theme-glow` in globals.css). */
export function GlowTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(geist.variable, jakarta.variable, "theme-glow relative min-h-screen overflow-hidden", className)}>
      {children}
    </div>
  );
}
