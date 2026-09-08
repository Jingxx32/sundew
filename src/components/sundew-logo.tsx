import Image from "next/image";

import { cn } from "@/lib/utils";

type SundewLogoProps = {
  className?: string;
  priority?: boolean;
};

/** The final horizontal lockup. Keep the logo asset intact rather than recreating it with text. */
export function SundewLogo({ className, priority = false }: SundewLogoProps) {
  return (
    <Image
      src="/assets/sundew-logo-assets/sundew-logo-horizontal.svg"
      alt="Sundew"
      width={345}
      height={125}
      priority={priority}
      className={cn("h-auto w-[160px]", className)}
    />
  );
}
