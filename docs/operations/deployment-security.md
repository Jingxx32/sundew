# Deployment and Security

Current as of 2026-10-11. This describes what runs today; historical plans live under `docs/superpowers/plans/`.

## Topology

- **App:** Vercel Hobby, functions pinned to `yul1` (Montréal), at `https://sundew.jingxuanxu.com`. Vercel builds and deploys `main`.
- **Database:** one Azure PostgreSQL server (`lumiere-platform-db`, Canada Central), `sslmode=require`. Vercel egress IPs are dynamic, so the firewall allows all IPs; the connection string is the boundary.
- **Private media:** Cloudflare R2 (TCF audio and images, quiz audio, speaking recordings), served through short-lived signed URLs.
- **One environment.** Local development deliberately uses the same database as production (decided 2026-10-02). Consequences:
  - `npm run db:init` from a laptop migrates production directly.
  - Anything created through a local server (guest sessions, test writing) is production data. Guests expire on their own; other test data must be removed by hand.
  - Development-only routes (for example `POST /api/tcf/explanations`) write production rows; they require an admin session and are disabled in production builds.
  - Revisit this before a destructive migration: a second database on the same server is the cheapest split.

## Access

- **Sessions:** Better Auth, stored in Postgres. Sign-in by Google or email one-time code; production email goes through Resend.
- **Sign-up is invite-only.** A new account needs an unexpired invite code (`AUTH_SIGNUP_ENABLED=false` closes sign-up entirely). Admins create and revoke codes at `/admin/invites`.
- **Guests:** one-click anonymous accounts seeded with the sample workspace, capped at 200 per UTC day and 3 per IP per hour, deleted after 7 days by the daily cron (`/api/cron/cleanup-guests`, `CRON_SECRET`). `GUEST_ACCESS_ENABLED=false` turns them off.
- **Levels:** guest / full / admin (`src/lib/auth/user.ts`). Admins may impersonate a user; a banner shows while they do.
- **Enforcement is server-side.** The proxy only checks that a session cookie exists. Every server action and route handler calls `requireUser`, `requireFeature` or `requireAdmin`; gated pages call `pageGate`. `src/lib/access/guard-coverage.test.ts` lists the gated entry points.

## Data isolation

Guests, members and the admin share one database. Isolation is by owner:

- Every owned table has `user_id`, and every owned query filters by the session user, never by a client-supplied id.
- `src/lib/account/owned-tables.ts` discovers owned tables for account and guest deletion; a test fails if a child table without `user_id` is missing from it.
- Private responses send `Cache-Control: private, no-store`.

## Paid AI and speech

- Guests never reach a paid API: `getOpenAI` and the Azure Speech client refuse guest sessions.
- Members have daily limits per 24 hours (`AI_DAILY_LIMITS` in `src/lib/access/limits.ts`: generate 30, lookup 300, transcribe 3); admins are not limited. Rough worst case is about US$1 per member per day.
- The speaking Task 2 pilot has its own budget (`src/lib/speaking/operations.ts`) and is off unless `SPEAKING_SIMULATION_ENABLED=true`.
- Request bodies stay under Vercel's 4.5 MB limit; long AI calls stay well under the 300 s function limit.

## Content

- TCF exam content (questions, audio, explanations) is for members only and is never in the public repository or the sample workspace.
- The landing page's sample question and the sample workspace are original material.

## HTTP hardening

`next.config.ts` sends `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that allows only the microphone (speaking). Vercel adds HSTS. There is no full CSP.

## Open items

- Validate database and R2 backups by restoring once.
- Set a monthly budget on the OpenAI project as a backstop to the in-app limits.
- Confirm the frozen `REVIEW_DATA_ENABLED` / `REVIEW_CENTER_ENABLED` flags are unset in Vercel.
