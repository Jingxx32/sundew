# Landing Page and Login Redesign — Design Spec

> Signed-out visitors land on a product page at `/` instead of the login form.
> `/login` shrinks to signing in. Both pages adopt a new "soft glow" visual
> style, scoped so the rest of the app is unchanged until we choose to roll it
> out site-wide.
>
> Designed in a brainstorming session on 2026-10-09, choosing from rendered
> mockups (direction B, "soft glow"). Executable cold, without that
> conversation. Facts were verified on 2026-10-09.

---

## 1. Summary

| Who | Today | After |
|---|---|---|
| Signed-out visitor opening `sundew.jingxuanxu.com` | `/` → `/today` → `/login` (a form with four sections) | `/` shows the landing page |
| Recruiter | Finds "Try without signing up" at the bottom of the login card | "Try the full app" is a primary button in the landing hero |
| Signed-in user or guest opening `/` | → `/today` | → `/today` (unchanged) |
| Anyone opening `/demo` | Public demo page | Permanent redirect to `/` |

Audience, in priority order: (1) learners — the page reads as a real product;
(2) recruiters — who want the working app within seconds, without registering,
and find stack + source in an "About this project" block.

## 2. Decisions

| # | Decision | Rejected alternatives |
|---|---|---|
| D1 | Landing page lives at `/`; `/demo` redirects there | Keep `/demo` and redirect `/` to it (worse URL for the front door) |
| D2 | Scope: landing + login now, but the style is defined as reusable tokens for a later site-wide rollout | Restyle the whole app now (too large); hard-code styles in the two pages (rollout = rewrite) |
| D3 | Visual direction B "soft glow": cool white, blue/pink glow, the 3D logo as hero, pill buttons | A "crisp white" (generic), C "editorial" (italic serif clashes with the soft 3D mark) |
| D4 | Headings: **Plus Jakarta Sans 800**; body: **Geist** | Bricolage Grotesque (rejected by the user), Manrope (the user dislikes it) |
| D5 | Style is applied through a scoped theme class that overrides existing tokens | See D2 |
| D6 | Guest entry is a primary hero action labelled **Try the full app**, with the caption "No sign-up · sample data · deleted after 7 days" | "Try without signing up" (doesn't say what you get), "Explore the full app" (sounds like a brochure) |
| D7 | The outdated "Two modes, one learner" section becomes a four-card **What's inside** row | Delete it; keep and restyle it |
| D8 | An "About this project" block near the footer: stack + GitHub link only, no name or personal links | Name, LinkedIn, personal site (the user declined) |
| D9 | Login keeps every auth behaviour; only layout and styling change | — |
| D10 | No dark mode, no motion (the app has neither today) | Floating-logo animation (later, if wanted) |

## 3. Current state (verified 2026-10-09)

- `src/app/page.tsx` only calls `redirect("/today")`. `/` is not in
  `PUBLIC_PREFIXES` (`src/proxy.ts`), so signed-out visitors are sent to
  `/login?callbackURL=%2F`.
- `src/app/demo/page.tsx` (183 lines) is the public demo: hero, interactive
  `DemoQuestion` (`src/app/demo/_components/demo-question.tsx`, 304 lines, no
  DB writes or AI calls), the "Two modes" speaking section (describes speaking
  as "Next phase" — out of date), and a footer with the "public sample" note
  and the TCF trademark notice.
- Links to `/demo`: the login page (logo and "Explore the public demo"),
  `src/components/feature-locked.tsx` (`/demo#try-demo`), and `/demo` in
  `PUBLIC_PREFIXES`.
- `src/app/login/page.tsx` shows, in one card: `LoginForm` (Google + email
  OTP), `InviteCodeForm`, and `GuestStartButton`. `LoginForm` has modes
  `sign-in` / `create` and handles `otpAvailable`, `signupOpen`, and errors.
- `SundewLogo` (`src/components/sundew-logo.tsx`): soft-3D symbol + Nunito 800
  wordmark, sized by a text-size class.
- Tokens live in `src/app/globals.css` (`:root` + `@theme inline`); fonts are
  loaded with `next/font/google` in `src/app/layout.tsx` (Manrope, Source
  Serif 4, Source Code Pro). `body` sets `font-family: var(--font-sans)` and
  `background: var(--background)`.
- `Button` (`src/components/ui/button.tsx`) and `Input`
  (`src/components/ui/input.tsx`) hard-code `rounded-lg`.
- `Geist` and `Plus Jakarta Sans` (weight 800) are available in this Next
  version's `next/font/google` (16.2.4).
- Guests (`src/lib/access/features.ts`) can see Today, Review, Progress,
  Settings, conjugation drills, library texts, and the sample writing tasks
  with their feedback — all on sample data. TCF bank, speaking, quizzes,
  micro-drills, and new writing feedback are locked for guests.

## 4. Scope

**In:** routing for `/` and `/demo`; the scoped theme; the landing page;
the login page layout; `Button`/`Input` radius tokens; updating links that
point to `/demo`.

**Out:** restyling any page inside the app; changing auth, invite, or guest
logic; new features; dark mode; animation; copy changes inside
`DemoQuestion`.

## 5. Routing

1. `next.config.ts` gains `redirects()` with `{ source: "/demo", destination: "/", permanent: true }`.
   Next runs config redirects before the proxy, so `/demo` never reaches it.
   Remove `/demo` from `PUBLIC_PREFIXES`.
2. `src/proxy.ts`: treat `/` as public with an **exact** match
   (`pathname === "/"`). Do not add `"/"` to the prefix list — the prefix logic
   is safe today only by accident.
3. `src/app/page.tsx` (server component): `getCurrentUser()`; if a user exists
   (any access level, including guest) → `redirect("/today")`; otherwise render
   the landing page. Move the demo page's `metadata` here.
4. `feature-locked.tsx`: `/demo#try-demo` → `/#try-demo`.
5. Protected pages keep sending signed-out visitors to
   `/login?callbackURL=…`; `safeCallbackPath` is unchanged.

## 6. Visual system — the scoped `theme-glow`

### 6.1 Tokens

`.theme-glow` in `globals.css` overrides existing tokens; everything not
listed keeps its current value (brand blue `#1f4ed8`, focus red `#e63946`,
status colours, level scale).

| Token | `:root` (app, unchanged) | `.theme-glow` |
|---|---|---|
| `--background` | `#faf8f4` | `#f6f8fd` |
| `--surface-muted` | `#f6f7f9` | `#f1f4fa` |
| `--border` | `#eeeae3` | `#e7eaf2` |
| `--foreground` | `#0f2747` | `#0f2747` (brand navy, same as the wordmark) |
| `--muted-foreground` | `#5d6b85` | `#55617a` (≈5.6:1 on `#f6f8fd`) |
| `--font-sans` | Manrope | Geist |
| `--font-display` *(new)* | falls back to `--font-sans` | Plus Jakarta Sans |
| `--radius-button` *(new)* | `var(--radius-lg)` | `9999px` |
| `--radius-field` *(new)* | `var(--radius-lg)` | `9999px` |
| `--shadow-float` *(new)* | — | `0 1px 2px rgb(15 39 71 / 5%), 0 30px 60px -20px rgb(15 39 71 / 22%)` |

Two rules that are easy to get wrong:

- `body` resolves `font-family` and `background` from **its own** custom
  properties; overriding them on a descendant does not change inherited
  values. The `.theme-glow` element must itself set
  `font-family: var(--font-sans); background: var(--background); color: var(--foreground)`.
- `--font-display` is exposed as a Tailwind `font-display` utility via
  `@theme inline` with a fallback: `var(--font-jakarta, var(--font-sans))`.

### 6.2 Components

- `src/components/theme/glow-theme.tsx` — `GlowTheme`: loads Geist and Plus
  Jakarta Sans (800) with `next/font/google` as CSS variables
  (`--font-geist`, `--font-jakarta`) and renders
  `<div className="theme-glow min-h-screen …">`. The fonts load only on pages
  that use it.
- `src/components/theme/glow-backdrop.tsx` — `GlowBackdrop`: absolutely
  positioned radial gradients (blue `rgb(122 156 255 / 45%)` → pink
  `rgb(255 168 176 / 22%)` → transparent), `aria-hidden`, `pointer-events-none`.
  Props for placement (`hero` top-right, `centered` for login).
- `Button` and `Input`/`Textarea`: `rounded-lg` → `rounded-[var(--radius-button)]`
  / `rounded-[var(--radius-field)]`. Defaults equal today's radius, so the app
  renders identically.

### 6.3 Type scale (landing/login)

| Use | Style |
|---|---|
| Hero H1 | `font-display`, 800, 68px desktop / 44px mobile, line-height 0.98, tracking −0.025em |
| Section H2 | `font-display`, 800, 40px / 30px, tracking −0.025em |
| Login title | `font-display`, 800, 32px |
| Body | Geist 400, 17px hero lead, 15px elsewhere |

Plus Jakarta Sans at the tight tracking used for Bricolage (−0.04em) collides
letters; −0.025em was checked in the mockup.

## 7. Landing page (`/`)

Components co-located in `src/app/_components/landing/`. `DemoQuestion` moves
to `src/app/_components/demo-question.tsx` unchanged.

| # | Section | Content |
|---|---|---|
| 1 | Header | `SundewLogo` (left). Right: "How it works" (→ `#try-demo`), **Sign in** (`Button variant="outline"`, → `/login`) |
| 2 | Hero | Pill "✱ TCF Canada · no sign-up needed". H1: **Practise the exam. / Fix the weakness / behind it.** ("Fix the weakness" in brand blue). Lead: "Sundew turns each TCF answer into a specific learning signal, then uses it to choose what you practise next." Buttons: **Try the full app** (`GuestStartButton`, primary — the recruiter path, D6) and **Try one question** (outline, → `#try-demo`); under them the caption "No sign-up · sample data · deleted after 7 days". Right: the 3D symbol (≈300px, slight tilt, soft blue drop shadow) with three floating cards — 01 Attempt / 02 Understand / 03 Retrain (details from today's `ROUTE_STEPS`) |
| 3 | `#try-demo` | Eyebrow "Interactive sample", H2 "Try the whole learning loop", note "This question was written for the demo and is not copied from an official exam." `DemoQuestion` inside a white `rounded-3xl` card |
| 4 | What's inside | H2 "Everything in the full app". Four cards (below) |
| 5 | Closing call to action | "Ready to see the whole app?" + **Try the full app** + **Sign in** |
| 6 | About this project | One line: "Sundew is a full-stack project built with Next.js 16, React 19, TypeScript, PostgreSQL + Drizzle, Better Auth, OpenAI, Azure Speech, Cloudflare R2, and Vercel." + **View the source on GitHub →** (`https://github.com/Jingxx32/sundew`) |
| 7 | Footer | Two lines: "The sample question runs in your browser — no account, database writes, or paid AI calls." (reworded: the guest button on this page does create an account) and "TCF is a trademark of France Éducation international. Sundew is not affiliated with FEI." |

### 7.1 What's inside — cards

Each card says honestly whether a guest can see it, because recruiters will
click **Try the full app** next.

| Card | Copy | Tag |
|---|---|---|
| Writing feedback | Write in French; AI feedback sorts every error into a 9-category taxonomy (37 error types). | **In the guest tour** (sample tasks and feedback) |
| Progress and weak spots | Every error feeds a learner profile; Progress shows your weak spots and Review brings them back. | **In the guest tour** (sample data) |
| TCF Canada bank | 3,000+ listening and reading questions with drill and timed-exam modes. | **Invite only** — "Try the sample question above" |
| Speaking | Read aloud and get pronunciation scores from Azure Speech. | **Invite only** |

Order: guest-visible cards first. Four columns on desktop, two on tablet, one
on mobile.

### 7.2 Guest access off

When `guestAccessEnabled()` is false, every **Try the full app** becomes
**Sign in** (→ `/login`) and its caption is not rendered; card tags read
"For members" instead of "In the guest tour". `GuestStartButton`'s existing
errors (capacity, rate limit) render below the button as today.

### 7.3 Mobile (375px)

Hero stacks: text first, then the 3D symbol at ≈180px with the three step
cards as a vertical list beneath it (no overlap). Header keeps the logo and
**Sign in**; "How it works" is hidden below `sm`.

## 8. Login page (`/login`)

Layout: `GlowTheme` + centred `GlowBackdrop`. One card, 400px wide,
`rounded-[28px]`, white at 90% opacity with backdrop blur and
`--shadow-float`; the 3D symbol (88px) overlaps the card's top edge and links
to `/`. Under the card: "New to Sundew? Take the 3-minute tour →" (→ `/`),
hidden for signed-in members.

| State | Card content |
|---|---|
| Sign in (default) | **Welcome back** / "Your French practice, right where you left it." White Google button with the G mark, "or use email", email field, **Email me a code** (navy). Bottom: "Have an invite code? **Create an account**" |
| Invite disclosure | "Create an account" expands `InviteCodeForm` inside the card; no navigation |
| Invite accepted (`mode="create"`) | **Create your account** / "Your invite code is ready. Continue with Google or an email code." + "Use a different invite code" |
| Code step | "Enter the 6-digit code sent to {email}. It expires in 5 minutes." + code field + **Sign in** + "Use a different email or send a new code" |
| Signed-in member | "Signed in as {email}" + **Continue** + **Sign out** |
| Signed-in guest | The sign-in form (signing in converts the guest), as today |
| Sign-up closed | The invite line becomes "Sign-up is currently closed. Existing accounts can sign in." |
| OTP not configured | Email section hidden |
| Error | `role="alert"` line at the bottom of the card |

The navy button is a new `Button` variant `strong`
(`bg-foreground text-white hover:bg-foreground/90`). The Google "G" is an inline
SVG in Google's four colours, as Google's sign-in branding allows.

`GuestStartButton` and the "Explore the public demo" link are removed from
the login page.

## 9. Files

| File | Change |
|---|---|
| `src/app/page.tsx` | Session check → `/today`, else landing; metadata |
| `src/app/_components/landing/*` | New: header, hero, what's-inside, closing CTA, about, footer |
| `src/app/_components/demo-question.tsx` | Moved from `src/app/demo/_components/` |
| `src/app/demo/` | Deleted (redirect lives in `next.config.ts`) |
| `next.config.ts` | `redirects()` for `/demo` |
| `src/proxy.ts` | Exact-match `/`; drop `/demo` |
| `src/app/login/page.tsx`, `_components/login-form.tsx` | New layout and states (§8); logic unchanged |
| `src/components/theme/glow-theme.tsx`, `glow-backdrop.tsx` | New |
| `src/app/globals.css` | `.theme-glow`, new tokens with `:root` defaults, `font-display` |
| `src/components/ui/button.tsx` | Radius token; `strong` variant |
| `src/components/ui/input.tsx` | Radius token (Input and Textarea) |
| `src/components/feature-locked.tsx` | Link → `/#try-demo` |

## 10. Error handling and edge cases

- `getCurrentUser()` failing on `/` (e.g. DB unreachable) must not hide the
  landing page: treat errors as signed-out and render it.
- A stale session cookie: `/` renders the landing page (no redirect loop),
  because `getCurrentUser()` validates the session server-side.
- `GuestStartButton` on `/` with an existing session goes to `/today` (its
  current behaviour).
- `/demo#try-demo` keeps its hash across the redirect (browsers carry the
  fragment over when `Location` has none), so it lands on `/#try-demo`.

## 11. Testing and verification

1. `npm run typecheck`, `npm run lint`, `npm test`.
2. Browser, signed out: `/` shows the landing page; `/demo` → 308 → `/`;
   `/today` → `/login?callbackURL=%2Ftoday`; "Try one question" scrolls to the
   sample, which still works end to end; "Sign in" → `/login`.
3. Browser, signed in (owner account, in the user's own browser): `/` →
   `/today`; app pages look unchanged — compare the sidebar, a `Button`, and an
   `Input` before and after (same radius, Manrope).
4. Login states from §8: default, invite disclosure, code step, error. The
   create/closed/OTP-off states are checked by reading the rendered branches,
   since they depend on env and cookies.
5. Guest flow: **Try the full app** on a local dev DB only — confirm with the
   user before running it, because it creates a real guest account in
   whichever database `DATABASE_URL` points to.
6. 375px: no horizontal scroll; hero and step cards stack.
7. Contrast spot-check: muted text and tags ≥ 4.5:1.

## 12. Delivery

One branch, small commits in this order: tokens + theme components (app
unchanged) → routing → landing → login. The temporary mockups in
`public/tmp-*.html` are deleted before the first commit and never committed.
