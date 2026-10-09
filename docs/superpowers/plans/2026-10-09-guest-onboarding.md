# Guest Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest knows where they are, sees the best demos first, and meets explained previews instead of locks.

**Architecture:** Presentation-only changes keyed on `user.access === "guest"`. Shared copy lives in `FEATURES.memberReason`; the landing page learns about guests through a `viewer` prop from `src/app/page.tsx`.

**Tech Stack:** Next.js 16 App Router, server components, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-09-guest-onboarding-design.md`

## Global Constraints

- Guest permissions (`FEATURES[*].guest`, `canUse`, `pageGate`) must not change.
- Full members/admins: no visible change; `/` still redirects them to `/today`.
- Local dev uses the production DB: no guest account without the user's consent.
- Commits without `Co-Authored-By` / "Generated with" trailers.
- Each task: `npm run typecheck && npm run lint && npm test`.

---

### Task 1: Shared copy and helpers (TDD)

**Files:** `src/lib/access/features.ts`, `src/lib/access/access.test.ts`, `src/lib/site.ts` (new), `src/app/_components/landing/content.ts`, `src/app/_components/landing/content.test.ts`

- [ ] Test (access.test.ts): every `FEATURES[key].memberReason` is a non-empty string ending in ".".
- [ ] Test (content.test.ts): `landingCta("guest", true|false) === "continue"`, `landingCta("visitor", true) === "guest-start"`, `landingCta("visitor", false) === "sign-in"`.
- [ ] Run: both fail.
- [ ] Add `memberReason` to each `FEATURES` entry (spec §3) and widen the `satisfies` type to `{ guest: GuestRule; label: string; memberReason: string }`.
- [ ] `src/lib/site.ts`: `export const SOURCE_URL = "https://github.com/Jingxx32/sundew";` — `content.ts` re-exports it instead of defining it.
- [ ] `content.ts`: `export type LandingViewer = "visitor" | "guest";` and `landingCta(viewer, guestEnabled): "continue" | "guest-start" | "sign-in"`.
- [ ] Run: pass. Commit `feat(guest): member-only reasons and landing CTA choice`.

### Task 2: Routing and landing for guests (#1, #6)

**Files:** `src/app/page.tsx`, `src/app/_components/landing/{landing-page,landing-hero,guest-cta}.tsx`

- [ ] `page.tsx`: read the user (errors → signed out); `access !== "guest"` → `redirect("/today")`; render `<LandingPage viewer={user ? "guest" : "visitor"} />`.
- [ ] `GuestCta({ variant, viewer })` switches on `landingCta(viewer, guestAccessEnabled())`: `continue` → `<Button asChild><Link href="/today">Continue the demo</Link></Button>` (no caption).
- [ ] `LandingPage({ viewer })` passes `viewer` to `LandingHero` and the closing CTA; header for guests: "Sign in" as a text link plus a `Continue the demo` button.
- [ ] Verify signed-in owner: `/` → 307 `/today`. Commit `feat(guest): show the landing page to guests`.

### Task 3: Guest bar and Start here card (#2, #6)

**Files:** `src/components/guest-bar.tsx` (new), `src/app/(main)/layout.tsx`, `src/app/(main)/today/_components/guest-start-here.tsx` (new), `src/app/(main)/today/page.tsx`

- [ ] `GuestBar({ expiresAt })`: `role="status"`, `bg-accent-soft text-sm`, copy from spec D3; "Homepage" → `/`, "Source ↗" → `SOURCE_URL` (`target="_blank" rel="noreferrer"`); on `< sm` only "Sample workspace · Homepage · Source ↗".
- [ ] Layout renders it above `children` when `user.access === "guest" && user.guestExpiresAt`.
- [ ] `GuestStartHere()` (async server): first id from `listRecentSubmissions(1)`; three numbered links (spec §3); falls back to `/practice` without a submission.
- [ ] Today page: `const user = await requirePageUser()`; render the card above "Today's focus" for guests.
- [ ] Verify owner Today unchanged. Commit `feat(guest): guest bar and Start here card`.

### Task 4: Practice for guests (#3)

**Files:** `src/app/(main)/practice/page.tsx`

- [ ] Guest branch: "Sample feedback" heading + cards (prompt, `submittedAt` date, "View feedback →") first; then "Write your own" with `QuickWriteButton` (its note now carries the reason). Member branch unchanged.
- [ ] Commit `feat(guest): lead Practice with sample feedback`.

### Task 5: Previews and notes (#4, #5)

**Files:** `src/components/feature-locked.tsx` → `src/components/feature-preview.tsx`, `src/lib/access/page-gate.tsx`, `src/components/invite-only-note.tsx` → `src/components/members-only-note.tsx`, the nine note call sites, `src/app/login/_components/invite-disclosure.tsx` → `src/components/invite-disclosure.tsx` (+ `next` prop), `src/components/sidebar.tsx`, `src/app/(main)/training/page.tsx`, `src/app/(main)/today/page.tsx`

- [ ] `FeaturePreview({ feature })`: "Preview" eyebrow, label, description, "What it does" bullets and "Try instead" link for tcf/speaking/quiz (spec §3), "Why it's not in the guest tour" = `memberReason`, `<InviteDisclosure next="/login?callbackURL=%2Ftoday" />` at the bottom. Speaking's try-instead uses the first sample submission (server lookup).
- [ ] `MembersOnlyNote({ feature, className })`: "Members only — {memberReason}" with a small "Have a code?" link to `/account#invite`; update all nine call sites with their feature key.
- [ ] Sidebar (desktop + mobile "More"), Training, Today skill cards: lock icon / "Invite only" → a `Preview` badge (`rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground`).
- [ ] `rg -n "InviteOnlyNote|FeatureLocked|Invite only" src` → no hits outside the landing page copy.
- [ ] Commit `feat(guest): preview pages and members-only notes`.

### Task 6: Verify and hand off

- [ ] Owner sweep (view-only): `/` (redirect), `/today`, `/practice`, `/training`, `/tcf`, `/vocabulary` — no guest UI, no console errors, no new overflow at 375/1280.
- [ ] Ask the user before creating a guest account; with consent, walk the six problems as a guest and screenshot each fix; sign the guest out afterwards.
- [ ] Push `feat/guest-onboarding`; PR link with base `feat/sitewide-glow-theme` until that branch merges.
