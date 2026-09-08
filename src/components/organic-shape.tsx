import { cn } from "@/lib/utils";

type OrganicShapeProps = {
  className?: string;
};

/** Decorative only. Pages opt in when their information density permits it. */
export function OrganicShape({ className }: OrganicShapeProps) {
  return <div aria-hidden="true" className={cn("sundew-organic-shape pointer-events-none select-none", className)} />;
}
