import type { CSSProperties } from "react";
import type { TcfLevel } from "@/lib/actions/tcf";
import type { TcfQuestionForDrill } from "@/lib/actions/tcf";
import type { TcfLearningStatus } from "@/lib/tcf/learning";

/**
 * CECR level reads as ink depth (A1 palest → C2 darkest), so it never
 * competes with the green/orange/red vocabulary reserved for learning
 * status. Kept in one place — level badges appear on the TCF hub, both
 * drill/exam runners, and the level nav sidebar.
 */
export const LEVEL_ORDER: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const LEVEL_LABELS: Record<TcfLevel, string> = {
  A1: "Débutant",
  A2: "Élémentaire",
  B1: "Intermédiaire",
  B2: "Avancé",
  C1: "Supérieur",
  C2: "Maîtrise",
};

const LEVEL_TOKEN: Record<TcfLevel, string> = {
  A1: "a1",
  A2: "a2",
  B1: "b1",
  B2: "b2",
  C1: "c1",
  C2: "c2",
};

export function levelBadgeStyle(level: TcfLevel): CSSProperties {
  const t = LEVEL_TOKEN[level];
  // `@theme inline` only inlines these into generated Tailwind utilities
  // (bg-level-a1 etc.) — it does not emit them as real custom properties,
  // so an inline style must reference the base --level-* tokens directly.
  return {
    backgroundColor: `var(--level-${t})`,
    color: `var(--level-${t}-ink)`,
  };
}

export const STATUS_LABELS: Record<TcfLearningStatus, string> = {
  unseen: "Non abordée",
  in_progress: "En cours",
  needs_review: "À revoir",
  stable: "Stable",
};

export const STATUS_DOT: Record<TcfLearningStatus, string> = {
  unseen: "bg-surface-muted",
  in_progress: "bg-warning",
  needs_review: "bg-danger",
  stable: "bg-success",
};

export const STATUS_STYLE: Record<TcfLearningStatus, string> = {
  unseen: "bg-surface-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
  needs_review: "bg-danger-soft text-danger hover:bg-danger-soft",
  in_progress: "bg-warning-soft text-warning hover:bg-warning-soft",
  stable: "bg-success-soft text-success hover:bg-success-soft",
};

export const TYPE_LABELS: Record<TcfQuestionForDrill["type"], string> = {
  image: "Image",
  spoken_options: "Écoute",
  dialogue: "Dialogue",
  reading_mcq: "Lecture",
};
