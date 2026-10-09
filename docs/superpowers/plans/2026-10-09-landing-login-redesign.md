# Landing Page and Login Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-out visitors land on a product page at `/`; `/login` becomes a compact sign-in card; both use a scoped "soft glow" theme while the app stays unchanged.

**Architecture:** A `.theme-glow` class overrides existing CSS tokens inside a `GlowTheme` wrapper that also loads Geist and Plus Jakarta Sans, so shared primitives (`Button`, `Input`) restyle themselves without forking. Routing: `/` renders the landing page for signed-out visitors (exact-match public path in the proxy), `/demo` 308-redirects to `/` via `next.config.ts`. Auth logic is untouched; only layout and copy around it change.

**Tech Stack:** Next.js 16.2.4 (App Router, `proxy.ts`), React 19, Tailwind CSS v4 (`@theme inline`), `next/font/google`, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-09-landing-login-redesign-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` for any Next API you are unsure of (AGENTS.md: this Next has breaking changes).
- Colours only through tokens; no raw colour values in `className` (CLAUDE.md UI conventions). New raw values live in `globals.css`.
- App pages outside `/` and `/login` must render identically: Manrope, current radii, current colours.
- Headline font: Plus Jakarta Sans **800**, tracking `-0.025em`. Body: Geist.
- Guest CTA copy: **Try the full app** + caption "No sign-up · sample data · deleted after 7 days". When `guestAccessEnabled()` is false it becomes **Sign in** and the caption is not rendered.
- GitHub link: `https://github.com/Jingxx32/sundew`. No name or personal links anywhere.
- Commits: plain conventional messages, **no `Co-Authored-By` or "Generated with" trailers** (CLAUDE.md).
- Verification per task: `npm run typecheck && npm run lint && npm test`, plus the browser checks listed in the task. Never click **Try the full app** without asking the user first — it creates a real guest account in whatever DB `DATABASE_URL` points to.

## File structure

| File | Responsibility |
|---|---|
| `src/app/globals.css` | Token defaults on `:root`, `.theme-glow` overrides, `font-display` utility, `.glow-backdrop` |
| `src/components/theme/glow-theme.tsx` | Loads the two fonts; wraps a page in `.theme-glow` |
| `src/components/theme/glow-backdrop.tsx` | Decorative blue/pink glow |
| `src/components/ui/button.tsx` | Radius from `--radius-button`; new `strong` variant |
| `src/components/ui/input.tsx` | Radius from `--radius-field` (Input + Textarea) |
| `src/lib/auth/public-paths.ts` (+ test) | Which paths skip the proxy's sign-in gate |
| `src/proxy.ts` | Uses `isPublicPath` |
| `next.config.ts` | `/demo` → `/` redirect |
| `src/app/page.tsx` | Signed-in → `/today`, else landing |
| `src/app/_components/demo-question.tsx` | Moved unchanged from `src/app/demo/_components/` |
| `src/app/_components/landing/content.ts` (+ test) | Copy and data: steps, feature cards, tags, stack |
| `src/app/_components/landing/guest-cta.tsx` | Guest button or Sign-in fallback |
| `src/app/_components/landing/landing-hero.tsx` | Hero + 3D stage |
| `src/app/_components/landing/whats-inside.tsx` | Four feature cards |
| `src/app/_components/landing/landing-page.tsx` | Page composition: header, sections, about, footer |
| `src/app/login/page.tsx` | New card layout and states |
| `src/app/login/_components/login-form.tsx` | Restyled buttons and divider; drops the invite hint line |
| `src/app/login/_components/invite-disclosure.tsx` | "Have an invite code? Create an account" toggle |
| `src/components/feature-locked.tsx` | Link → `/#try-demo` |

Deviation from spec §7 row 3, decided while planning: `DemoQuestion` already renders its own cards, so it is **not** wrapped in another card.

---

### Task 1: Theme foundation (no visible change to the app)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/button.tsx:10` and variants
- Modify: `src/components/ui/input.tsx:12,31`
- Create: `src/components/theme/glow-theme.tsx`
- Create: `src/components/theme/glow-backdrop.tsx`

**Interfaces:**
- Produces: `GlowTheme({ className?, children })`, `GlowBackdrop({ placement?: "hero" | "centered" })`, Tailwind utilities `font-display`, `rounded-[var(--radius-button)]`, `shadow-[var(--shadow-float)]`, `drop-shadow-[var(--drop-brand)]`, `Button variant="strong"`.

- [ ] **Step 1: Record today's computed styles** (the "before" for the no-change check)

With the dev server running, open `http://localhost:3000/login` and run in the browser console:

```js
const b = document.querySelector("main button"), i = document.querySelector("main input");
({ btnRadius: getComputedStyle(b).borderRadius, inputRadius: getComputedStyle(i).borderRadius, font: getComputedStyle(document.body).fontFamily })
```
Expected: `btnRadius: "10px"`, `inputRadius: "10px"`, font starting with `__Manrope` / `Manrope`.

- [ ] **Step 2: Add token defaults to `:root`** — append inside the `:root` block, after `--font-reading`:

```css
  /* Shape and display tokens. These defaults keep the app exactly as it was;
     .theme-glow overrides them on the landing and login pages. */
  --radius-button: var(--radius-lg);
  --radius-field: var(--radius-lg);
  --display-font: var(--font-sans);
```

- [ ] **Step 3: Expose `font-display`** — inside `@theme inline`, after the `--font-mono` line:

```css
  --font-display: var(--display-font);
```

- [ ] **Step 4: Add `.theme-glow` and `.glow-backdrop`** — after the `.sundew-organic-shape` rule:

```css
/* Soft-glow theme (landing + login). Scoped so the app keeps its tokens until
   we roll it out: move these overrides into :root to apply it everywhere. */
.theme-glow {
  --background: #f6f8fd;
  --surface-muted: #f1f4fa;
  --border: #e7eaf2;
  --muted-foreground: #55617a;
  --font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --display-font: var(--font-jakarta), var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --radius-button: 9999px;
  --radius-field: 9999px;
  --shadow-float: 0 1px 2px rgb(15 39 71 / 5%), 0 30px 60px -20px rgb(15 39 71 / 22%);
  --drop-brand: 0 24px 32px rgb(31 78 216 / 28%);
  --glow-blue: rgb(122 156 255 / 45%);
  --glow-pink: rgb(255 168 176 / 22%);

  /* body resolved these from its own variables; re-resolve them here. */
  font-family: var(--font-sans);
  background: var(--background);
  color: var(--foreground);
}

.glow-backdrop {
  background: radial-gradient(circle, var(--glow-blue) 0%, var(--glow-pink) 38%, transparent 68%);
}
```

- [ ] **Step 5: Button radius + `strong` variant** — in `src/components/ui/button.tsx`, in the base class string replace `rounded-lg` with `rounded-[var(--radius-button)]`, and add to `variant`:

```ts
        strong:
          "bg-foreground text-white hover:bg-foreground/90",
```

- [ ] **Step 6: Input/Textarea radius** — in `src/components/ui/input.tsx`, replace `rounded-lg` with `rounded-[var(--radius-field)]` in both class strings (lines 12 and 31).

- [ ] **Step 7: Create `src/components/theme/glow-theme.tsx`**

```tsx
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
```

- [ ] **Step 8: Create `src/components/theme/glow-backdrop.tsx`**

```tsx
import { cn } from "@/lib/utils";

const PLACEMENT = {
  hero: "-right-[120px] -top-[160px]",
  centered: "left-1/2 -top-[260px] -translate-x-1/2",
} as const;

/** Decorative blue/pink glow; place inside a `relative` parent. */
export function GlowBackdrop({ placement = "hero" }: { placement?: keyof typeof PLACEMENT }) {
  return (
    <div
      aria-hidden="true"
      className={cn("glow-backdrop pointer-events-none absolute size-[720px] rounded-full blur-[10px]", PLACEMENT[placement])}
    />
  );
}
```

- [ ] **Step 9: Verify nothing changed in the app**

Run: `npm run typecheck && npm run lint && npm test` — expected: all pass.
Reload `/login` and re-run the Step 1 snippet — expected: identical values (`10px`, `10px`, Manrope).

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css src/components/ui/button.tsx src/components/ui/input.tsx src/components/theme
git commit -m "feat(theme): scoped soft-glow theme tokens and components"
```

---

### Task 2: Routing — landing at `/`, `/demo` redirects

**Files:**
- Create: `src/lib/auth/public-paths.ts`, `src/lib/auth/public-paths.test.ts`
- Modify: `src/proxy.ts`, `next.config.ts`, `src/app/page.tsx`, `src/components/feature-locked.tsx:28`
- Move: `src/app/demo/page.tsx` → `src/app/_components/landing/landing-page.tsx`; `src/app/demo/_components/demo-question.tsx` → `src/app/_components/demo-question.tsx`

**Interfaces:**
- Produces: `isPublicPath(pathname: string): boolean`; `LandingPage()` (no props) exported from `src/app/_components/landing/landing-page.tsx` — Task 3 rewrites its body, keeping the name.

- [ ] **Step 1: Write the failing test** — `src/lib/auth/public-paths.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./public-paths";

test("the landing page is public, but only as an exact path", () => {
  assert.equal(isPublicPath("/"), true);
  for (const path of ["/today", "/tcf", "//", "/x/"]) assert.equal(isPublicPath(path), false, path);
});

test("public prefixes cover the prefix and its children only", () => {
  for (const path of ["/login", "/login/x", "/assets/a.png", "/api/auth/session", "/api/cron/guests"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/loginx", "/assetsx", "/api/other", "/media/a.mp3"]) assert.equal(isPublicPath(path), false, path);
});

test("/demo is no longer public: next.config redirects it before the proxy runs", () => {
  assert.equal(isPublicPath("/demo"), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test src/lib/auth/public-paths.test.ts`
Expected: FAIL — cannot find module `./public-paths`.

- [ ] **Step 3: Implement `src/lib/auth/public-paths.ts`**

```ts
// /assets holds brand images only. public/media (private exam audio) stays behind the gate.
// /api/cron is guarded by CRON_SECRET in the route itself.
const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/assets", "/login"];
// Exact matches only: as a prefix, "/" would open every path.
const PUBLIC_PAGES = ["/"];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PAGES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}
```

- [ ] **Step 4: Run the test** — `npx tsx --test src/lib/auth/public-paths.test.ts` → PASS.

- [ ] **Step 5: Use it in `src/proxy.ts`** — delete the two comment lines, `PUBLIC_PREFIXES`, and the local `isPublicPath` function; add `import { isPublicPath } from "@/lib/auth/public-paths";` after the `better-auth/cookies` import. The rest of the file is unchanged.

- [ ] **Step 6: Redirect `/demo`** — in `next.config.ts`, add after `allowedDevOrigins`:

```ts
  // The public demo became the landing page at / (2026-10).
  async redirects() {
    return [{ source: "/demo", destination: "/", permanent: true }];
  },
```

- [ ] **Step 7: Move the demo files**

```bash
mkdir -p src/app/_components/landing
git mv src/app/demo/_components/demo-question.tsx src/app/_components/demo-question.tsx
git mv src/app/demo/page.tsx src/app/_components/landing/landing-page.tsx
```

In `landing-page.tsx`: delete the `metadata` export and the `Metadata` import; rename `export default function DemoPage()` to `export function LandingPage()`; change `import { DemoQuestion } from "./_components/demo-question";` to `import { DemoQuestion } from "../demo-question";`; change `href="/demo"` to `href="/"` and `aria-label="Sundew demo home"` to `aria-label="Sundew home"`.

- [ ] **Step 8: Rewrite `src/app/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LandingPage } from "./_components/landing/landing-page";

export const metadata: Metadata = {
  title: "Sundew — TCF Canada practice that trains your weak spots",
  description:
    "Try one original TCF-style question and see how Sundew turns the result into a focused follow-up drill.",
};

export default async function Home() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getCurrentUser());
  } catch {
    // The landing page must not depend on the database being up.
  }
  if (signedIn) redirect("/today");
  return <LandingPage />;
}
```

- [ ] **Step 9: Fix the locked-feature link** — `src/components/feature-locked.tsx:28`: `href="/demo#try-demo"` → `href="/#try-demo"`.

- [ ] **Step 10: Verify**

Run: `npm run typecheck && npm run lint && npm test` → all pass.
Then:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:3000/demo
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:3000/today
```
Expected: `308 http://localhost:3000/`, `200`, `307 http://localhost:3000/login?callbackURL=%2Ftoday`.
Browser (signed out): `/` shows the old demo content; the sample question works.

- [ ] **Step 11: Commit**

```bash
git add -A src/app src/lib/auth/public-paths.ts src/lib/auth/public-paths.test.ts src/proxy.ts next.config.ts src/components/feature-locked.tsx
git commit -m "feat(routing): serve the public demo as the landing page at /"
```

---

### Task 3: Landing page in the soft-glow style

**Files:**
- Create: `src/app/_components/landing/content.ts`, `content.test.ts`, `guest-cta.tsx`, `landing-hero.tsx`, `whats-inside.tsx`
- Rewrite: `src/app/_components/landing/landing-page.tsx`

**Interfaces:**
- Consumes: `GlowTheme`, `GlowBackdrop`, `font-display`, `--shadow-float`, `--drop-brand` (Task 1); `LandingPage` name (Task 2); `SundewLogo({ className, priority, wordmark })`; `GuestStartButton(ButtonProps)`; `guestAccessEnabled(env?)`; `ERROR_TAXONOMY`.
- Produces: `ROUTE_STEPS`, `FEATURE_CARDS`, `featureTag()`, `STACK`, `SOURCE_URL`, `GuestCta`.

- [ ] **Step 1: Write the failing test** — `src/app/_components/landing/content.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import { FEATURE_CARDS, featureTag } from "./content";

test("cards a guest can open say so, unless guest access is off", () => {
  assert.equal(featureTag({ inGuestTour: true }, true), "In the guest tour");
  assert.equal(featureTag({ inGuestTour: true }, false), "For members");
  assert.equal(featureTag({ inGuestTour: false }, true), "Invite only");
  assert.equal(featureTag({ inGuestTour: false }, false), "Invite only");
});

test("guest-visible cards come first", () => {
  const firstLocked = FEATURE_CARDS.findIndex((card) => !card.inGuestTour);
  assert.ok(FEATURE_CARDS.slice(firstLocked).every((card) => !card.inGuestTour));
});

test("the writing card's taxonomy numbers come from the taxonomy itself", () => {
  const categories = Object.values(ERROR_TAXONOMY);
  const types = categories.reduce((n, c) => n + Object.keys(c.subcategories).length, 0);
  const writing = FEATURE_CARDS.find((card) => card.key === "writing");
  assert.ok(writing?.body.includes(`${categories.length}-category`));
  assert.ok(writing?.body.includes(`${types} error types`));
});
```

- [ ] **Step 2: Run it** — `npx tsx --test src/app/_components/landing/content.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `content.ts`**

```ts
import { ERROR_TAXONOMY } from "@/lib/taxonomy";

export const ROUTE_STEPS = [
  { number: "01", label: "Attempt", detail: "One original TCF-style question" },
  { number: "02", label: "Understand", detail: "The reasoning, not just the answer" },
  { number: "03", label: "Retrain", detail: "A drill built from the same signal" },
] as const;

const categories = Object.values(ERROR_TAXONOMY);
const errorTypes = categories.reduce((n, c) => n + Object.keys(c.subcategories).length, 0);

export type FeatureCard = {
  key: "writing" | "progress" | "tcf" | "speaking";
  title: string;
  body: string;
  /** What a guest account can open (src/lib/access/features.ts). */
  inGuestTour: boolean;
  /** Points locked features at something the visitor can try now. */
  hint?: string;
};

// Guest-visible cards first: recruiters click "Try the full app" next.
export const FEATURE_CARDS: readonly FeatureCard[] = [
  {
    key: "writing",
    title: "Writing feedback",
    body: `Write in French; AI feedback sorts every error into a ${categories.length}-category taxonomy (${errorTypes} error types).`,
    inGuestTour: true,
  },
  {
    key: "progress",
    title: "Progress and weak spots",
    body: "Every error feeds a learner profile; Progress shows your weak spots and Review brings them back.",
    inGuestTour: true,
  },
  {
    key: "tcf",
    title: "TCF Canada bank",
    body: "3,000+ listening and reading questions with drill and timed-exam modes.",
    inGuestTour: false,
    hint: "Try the sample question above",
  },
  {
    key: "speaking",
    title: "Speaking",
    body: "Read aloud and get pronunciation scores from Azure Speech.",
    inGuestTour: false,
  },
];

export type FeatureTag = "In the guest tour" | "For members" | "Invite only";

export function featureTag(card: Pick<FeatureCard, "inGuestTour">, guestEnabled: boolean): FeatureTag {
  if (!card.inGuestTour) return "Invite only";
  return guestEnabled ? "In the guest tour" : "For members";
}

export const STACK = [
  "Next.js 16", "React 19", "TypeScript", "PostgreSQL + Drizzle", "Better Auth",
  "OpenAI", "Azure Speech", "Cloudflare R2", "Vercel",
] as const;

export const SOURCE_URL = "https://github.com/Jingxx32/sundew";
```

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Create `guest-cta.tsx`**

```tsx
import Link from "next/link";
import { GuestStartButton } from "@/components/guest-start-button";
import { Button, type ButtonProps } from "@/components/ui/button";
import { guestAccessEnabled } from "@/lib/auth/guest";

const SIZE = "h-[52px] px-7";

/** The recruiter path: a 7-day guest account, or sign-in when guests are off. */
export function GuestCta({ variant = "default" }: { variant?: ButtonProps["variant"] }) {
  if (!guestAccessEnabled()) {
    return (
      <Button asChild size="lg" variant={variant} className={SIZE}>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div>
      <GuestStartButton size="lg" variant={variant} className={SIZE}>Try the full app</GuestStartButton>
      <p className="mt-2 text-xs text-muted-foreground">No sign-up · sample data · deleted after 7 days</p>
    </div>
  );
}
```

- [ ] **Step 6: Create `landing-hero.tsx`**

```tsx
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
        <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[0.98] tracking-[-0.025em] sm:text-[56px] lg:text-[68px]">
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
```

- [ ] **Step 7: Create `whats-inside.tsx`**

```tsx
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
                  {card.hint} ↑
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: Rewrite `landing-page.tsx`**

```tsx
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
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint && npm test` → all pass.
Browser, signed out, desktop (≥1280) and 375px:
- Fonts: hero H1 computed `font-family` starts with Plus Jakarta Sans and `font-weight: 800`; body text is Geist.
- Hero stage: symbol ≈300px desktop / ≈178px mobile; step cards float on desktop, stack on mobile; no horizontal scroll at 375px (`document.documentElement.scrollWidth === innerWidth`).
- "Try one question" and the TCF card hint scroll to `#try-demo`; the sample question works end to end.
- Feature tags: two "In the guest tour", two "Invite only".
- GitHub link opens `https://github.com/Jingxx32/sundew`.
- Console: no errors.
Do **not** click "Try the full app" without asking the user.

- [ ] **Step 10: Commit**

```bash
git add -A src/app/_components
git commit -m "feat(landing): soft-glow landing page with feature tour and project note"
```

---

### Task 4: Login page in the soft-glow style

**Files:**
- Rewrite: `src/app/login/page.tsx`
- Modify: `src/app/login/_components/login-form.tsx`
- Create: `src/app/login/_components/invite-disclosure.tsx`

**Interfaces:**
- Consumes: `GlowTheme`, `GlowBackdrop`, `Button variant="strong"`, `--shadow-float`, `--drop-brand` (Task 1).
- Produces: `InviteDisclosure()` (no props).

- [ ] **Step 1: Create `invite-disclosure.tsx`**

```tsx
"use client";

import { useState } from "react";
import { InviteCodeForm } from "@/components/invite-code-form";

/** Keeps the invite form out of the way until someone says they have a code. */
export function InviteDisclosure() {
  const [open, setOpen] = useState(false);
  if (open) return <InviteCodeForm />;
  return (
    <p className="text-center text-sm text-muted-foreground">
      Have an invite code?{" "}
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOpen(true)}>
        Create an account
      </button>
    </p>
  );
}
```

- [ ] **Step 2: Restyle `login-form.tsx`** (logic untouched)

1. Add above `export function LoginForm`:

```tsx
/** Google's "G", in its brand colours, as its sign-in guidelines allow. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
```
(Raw hex here is Google's mandated brand mark, not a theme colour.)

2. Google button → `<Button variant="outline" size="lg" className="w-full" disabled={pending} onClick={continueWithGoogle}><GoogleMark />Continue with Google</Button>`.
3. Divider text "or use an email code" → "or use email".
4. Email `Input` gets `className="h-11"`; code `Input` gets `className="h-11 text-center font-mono tracking-[0.3em]"`.
5. "Send code" button → `<Button type="submit" variant="strong" size="lg" className="w-full" …>Email me a code</Button>` (same `disabled`).
6. Code-step "Sign in" button → `variant="strong" size="lg"`.
7. Delete the `{mode === "sign-in" && signupOpen && (…New here?…)}` block — `InviteDisclosure` replaces it.
8. Wrapper `className="mt-6 space-y-5"` → `"mt-7 space-y-4"`.

- [ ] **Step 3: Rewrite `src/app/login/page.tsx`**

```tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { SundewLogo } from "@/components/sundew-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { GlowBackdrop } from "@/components/theme/glow-backdrop";
import { GlowTheme } from "@/components/theme/glow-theme";
import { Button } from "@/components/ui/button";
import { INVITE_COOKIE } from "@/lib/access/limits";
import { safeCallbackPath } from "@/lib/auth/callback-path";
import { otpEmailConfigured } from "@/lib/auth/email";
import { getCurrentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup";
import { InviteDisclosure } from "./_components/invite-disclosure";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string; error?: string }>;
}) {
  const { callbackURL, error } = await searchParams;
  const callbackPath = safeCallbackPath(callbackURL);
  const user = await getCurrentUser();
  const inviteAccepted = Boolean((await cookies()).get(INVITE_COOKIE)?.value);
  // Guests stay on the form: signing in or creating an account converts them.
  const member = user && user.access !== "guest" ? user : null;
  const creating = inviteAccepted && !member;

  return (
    <GlowTheme className="flex flex-col items-center justify-center px-5 py-20">
      <GlowBackdrop placement="centered" />
      <main className="relative w-full max-w-[400px]">
        <section className="relative rounded-[28px] bg-surface/90 px-7 pb-8 pt-16 shadow-[var(--shadow-float)] backdrop-blur sm:px-9">
          <Link
            href="/"
            aria-label="Sundew home"
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <SundewLogo wordmark={false} priority className="text-[48px] drop-shadow-[var(--drop-brand)]" />
          </Link>
          <div className="text-center">
            <h1 className="font-display text-[32px] font-extrabold tracking-[-0.025em]">
              {member ? "You're signed in" : creating ? "Create your account" : "Welcome back"}
            </h1>
            {!member && (
              <p className="mt-2 text-[15px] text-muted-foreground">
                {creating
                  ? "Your invite code is ready. Continue with Google or an email code."
                  : "Your French practice, right where you left it."}
              </p>
            )}
          </div>
          {member ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="break-all text-sm text-muted-foreground">Signed in as {member.email}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link href={callbackPath}>Continue</Link>
                </Button>
                <SignOutButton />
              </div>
            </div>
          ) : (
            <LoginForm
              mode={inviteAccepted ? "create" : "sign-in"}
              callbackPath={callbackPath}
              otpAvailable={otpEmailConfigured()}
              signupOpen={signupEnabled()}
              initialError={error ?? null}
            />
          )}
          {!member && !inviteAccepted && signupEnabled() && (
            <div className="mt-6 border-t border-border pt-5">
              <InviteDisclosure />
            </div>
          )}
        </section>
        {!member && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to Sundew?{" "}
            <Link href="/" className="font-semibold text-primary hover:underline">
              Take the 3-minute tour →
            </Link>
          </p>
        )}
      </main>
    </GlowTheme>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test` → all pass.
Browser, signed out, at 1280 and 375:
- Default: "Welcome back", Google button with G mark, "or use email", "Email me a code" in navy, invite line at the bottom, tour link under the card. Logo overlaps the card's top edge and links to `/`.
- Click "Create an account" → the invite form appears inside the card; submit a junk code → "That code isn't valid…" error.
- Type an email and **ask the user before** pressing "Email me a code" (in dev it only prints the OTP to the server console, but it still hits the auth API).
- `/login?error=INVALID_OTP` shows the error line.
- Console: no errors.
Ask the user to check the signed-in member view and the create-account view in their own browser.

- [ ] **Step 5: Commit**

```bash
git add src/app/login
git commit -m "feat(login): compact soft-glow sign-in card"
```

---

### Task 5: Whole-flow check and app regression check

- [ ] **Step 1:** Re-run Task 1 Step 1's snippet on a page inside the app the user has open (or ask them to): Manrope, 10px radii — unchanged.
- [ ] **Step 2:** `rg -n "/demo" src` → only the `next.config.ts` redirect comment/entry remains.
- [ ] **Step 3:** `git status` clean except intended files; `public/tmp-*.html` absent; `git log --oneline -5` shows the four task commits without trailers.
- [ ] **Step 4:** Report to the user with screenshots (landing desktop + mobile, login) and the list of checks that need their signed-in browser.
