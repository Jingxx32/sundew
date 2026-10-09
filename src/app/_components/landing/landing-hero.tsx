import { ArrowDown } from "lucide-react";
import { SundewLogo } from "@/components/sundew-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTE_STEPS } from "./content";
import { GuestCta } from "./guest-cta";

// Desktop: steps float around the symbol. Mobile: they stack beneath it.
const STEP_POSITIONS = ["lg:left-0 lg:top-10", "lg:right-0 lg:top-[170px]", "lg:bottom-8 lg:left-8"];

export function LandingHero() {
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:pb-28 lg:pt-14">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13px] text-muted-foreground ring-1 ring-border">
          <span className="text-focus-star" aria-hidden="true">✱</span>
          TCF Canada · no sign-up needed
        </p>
        <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[0.98] tracking-[-0.025em] sm:text-[56px] lg:text-[60px]">
          Practise the exam.
          <br />
          <span className="text-primary">Fix the weakness</span>
          <br />
          behind it.
        </h1>
        <p className="mt-6 max-w-[470px] text-[17px] leading-relaxed text-muted-foreground">
          Sundew turns each TCF answer into a specific learning signal, then uses it to choose what you practise next.
        </p>
        <div className="mt-8 flex flex-wrap items-start gap-3">
          <GuestCta />
          <Button asChild size="lg" variant="outline" className="h-[52px] px-7">
            <a href="#try-demo">
              Try one question
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-8 lg:block lg:h-[420px]">
        <SundewLogo
          wordmark={false}
          priority
          className="-rotate-6 text-[96px] drop-shadow-[var(--drop-brand)] lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:text-[162px]"
        />
        <ol className="grid w-full max-w-sm gap-3 lg:absolute lg:inset-0 lg:block lg:max-w-none" aria-label="How Sundew works">
          {ROUTE_STEPS.map((step, index) => (
            <li
              key={step.number}
              className={cn(
                "flex items-center gap-3 rounded-2xl bg-surface/85 p-2.5 pr-4 shadow-[var(--shadow-float)] backdrop-blur lg:absolute",
                STEP_POSITIONS[index],
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-[10px] text-xs font-bold",
                  index === ROUTE_STEPS.length - 1 ? "bg-focus-star-soft text-focus-star" : "bg-accent-soft text-primary",
                )}
              >
                {step.number}
              </span>
              <span>
                <span className="block text-sm font-semibold">{step.label}</span>
                <span className="block text-xs text-muted-foreground">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
