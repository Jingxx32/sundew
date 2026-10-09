import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { SundewLogo } from "@/components/sundew-logo";
import { GlowBackdrop } from "@/components/theme/glow-backdrop";
import { GlowTheme } from "@/components/theme/glow-theme";
import { Button } from "@/components/ui/button";
import { guestAccessEnabled } from "@/lib/auth/guest";
import { DemoQuestion } from "../demo-question";
import { SOURCE_URL, STACK } from "./content";
import { GuestCta } from "./guest-cta";
import { LandingHero } from "./landing-hero";
import { WhatsInside } from "./whats-inside";

const stackList = new Intl.ListFormat("en", { type: "conjunction" }).format(STACK);

export function LandingPage() {
  return (
    <GlowTheme>
      <GlowBackdrop placement="hero" />
      <header className="relative mx-auto flex h-[76px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Sundew home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          <SundewLogo className="text-[21px] sm:text-[23px]" priority />
        </Link>
        <nav aria-label="Landing" className="flex items-center gap-5 text-sm text-muted-foreground">
          <a href="#try-demo" className="hidden hover:text-foreground sm:inline">How it works</a>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <main className="relative">
        <LandingHero />

        <section id="try-demo" className="scroll-mt-6 border-y border-border bg-surface-muted/60">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Interactive sample</p>
                <h2 className="mt-2 font-display text-[30px] font-extrabold tracking-[-0.025em] sm:text-[40px]">
                  Try the whole learning loop
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground sm:text-right">
                This question was written for the demo and is not copied from an official exam.
              </p>
            </div>
            <DemoQuestion />
          </div>
        </section>

        <WhatsInside />

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-surface px-6 py-14 text-center shadow-[var(--shadow-float)] sm:px-12">
            <GlowBackdrop placement="centered" />
            <h2 className="relative font-display text-[30px] font-extrabold tracking-[-0.025em] sm:text-[40px]">
              Ready to see the whole app?
            </h2>
            <div className="relative mt-8 flex flex-wrap items-start justify-center gap-3">
              <GuestCta />
              {guestAccessEnabled() && (
                <Button asChild size="lg" variant="outline" className="h-[52px] px-7">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="about-title" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="flex flex-col gap-4 border-t border-border pt-10 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 id="about-title" className="text-sm font-semibold">About this project</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Sundew is a full-stack project built with {stackList}.
              </p>
            </div>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              View the source on GitHub
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
            The sample question runs in your browser — no account, database writes, or paid AI calls.
          </p>
          <p>TCF is a trademark of France Éducation international. Sundew is not affiliated with FEI.</p>
        </div>
      </footer>
    </GlowTheme>
  );
}
