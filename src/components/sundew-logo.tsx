import Image from "next/image";
import { Nunito } from "next/font/google";

import { cn } from "@/lib/utils";

// Only the wordmark uses Nunito, so it loads with the logo rather than site-wide.
const wordmarkFont = Nunito({ subsets: ["latin"], weight: "800" });

type SundewLogoProps = {
  /** Size the logo with a text-size class; the symbol scales with it. */
  className?: string;
  priority?: boolean;
  /** Set false for the symbol alone. */
  wordmark?: boolean;
};

/** Soft-3D symbol + Nunito wordmark. Too detailed below ~40px; the favicon keeps the flat app icon. */
export function SundewLogo({ className, priority = false, wordmark = true }: SundewLogoProps) {
  const symbol = (
    <Image
      src="/assets/sundew-logo-assets/sundew-symbol-3d-512.png"
      alt={wordmark ? "" : "Sundew"}
      // Twice the login-page display size; the PNG itself is 512px.
      width={112}
      height={112}
      priority={priority}
      className={cn("size-[1.85em]", !wordmark && cn("text-2xl", className))}
    />
  );
  if (!wordmark) return symbol;
  return (
    <span className={cn("flex items-center gap-[0.33em] text-2xl", className)}>
      {symbol}
      <span className={cn(wordmarkFont.className, "leading-none tracking-[-0.02em] text-foreground")}>Sundew</span>
    </span>
  );
}
