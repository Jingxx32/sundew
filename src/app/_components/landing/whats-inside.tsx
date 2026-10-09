import { BookOpenCheck, Mic2, PenLine, TrendingUp } from "lucide-react";
import { guestAccessEnabled } from "@/lib/auth/guest";
import { cn } from "@/lib/utils";
import { FEATURE_CARDS, featureTag, type FeatureCard } from "./content";

const ICONS: Record<FeatureCard["key"], typeof PenLine> = {
  writing: PenLine,
  progress: TrendingUp,
  tcf: BookOpenCheck,
  speaking: Mic2,
};

export function WhatsInside() {
  const guestEnabled = guestAccessEnabled();
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24" aria-labelledby="whats-inside-title">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">What&apos;s inside</p>
      <h2 id="whats-inside-title" className="mt-2 font-display text-[30px] font-extrabold tracking-[-0.025em] sm:text-[40px]">
        Everything in the full app
      </h2>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURE_CARDS.map((card) => {
          const Icon = ICONS[card.key];
          const tag = featureTag(card, guestEnabled);
          return (
            <li key={card.key} className="flex flex-col rounded-3xl bg-surface p-6 shadow-card ring-1 ring-border">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    tag === "Invite only" ? "bg-surface-muted text-muted-foreground" : "bg-accent-soft text-primary",
                  )}
                >
                  {tag}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{card.body}</p>
              {card.hint && (
                <a href="#try-demo" className="mt-4 text-sm font-semibold text-primary hover:underline">
                  {card.hint}&nbsp;↑
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
