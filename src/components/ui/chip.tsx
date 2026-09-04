import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "accent" | "success" | "warning" | "danger";
}

const variantClasses: Record<NonNullable<ChipProps["variant"]>, string> = {
  neutral: "bg-surface-muted text-muted-foreground",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Chip({
  className,
  variant = "neutral",
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
