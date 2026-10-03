# Auth Foundation (Better Auth) — Design Spec

> Sub-project 1 of the account system. It replaces Azure Easy Auth and the
> uncommitted local-profile work with Better Auth: open-registration-ready
> sign-in by Google or an emailed one-time code, database sessions, admin
> roles, banning and impersonation. It ships to production with sign-up
> **closed**; sub-project 2 opens it behind feature tiers.
>
> Designed in a brainstorming session on 2026-10-03. Executable cold, without
> that conversation. Facts below were verified on 2026-10-03.

---

## 0. Product direction and decomposition

The end state is a complete account system, not a single-user app:

- Anyone can register. A registered account sees a **limited** feature set.
- Redeeming an **invite code** unlocks every feature.
- The owner's main account is an administrator with every feature.
- AI spend is capped per user per day by tier, plus a global daily cap.
- A second "test account" is simply another registered account (or, for
  previewing, admin impersonation). No fake local identities.

Delivered as five sub-projects, each with its own spec → plan → implementation:

| # | Sub-project | Status |
|---|---|---|
| 1 | **Auth foundation** (this spec) | Designed |
| 2 | Tiers, invite codes, feature toggles | Decisions recorded (§10) |
| 3 | AI quotas | Decisions recorded (§10) |
| 4 | Admin console | Decisions recorded (§10) |
| 5 | Public-launch requirements | Decisions recorded (§10) |

---

## 1. Current state (verified 2026-10-03)

**Authentication today**

- Production: Azure Easy Auth (Google provider) in front of App Service.
  `src/lib/auth/identity.ts` parses the `x-ms-client-principal-*` headers and
  enforces an email allowlist (`APP_ALLOWED_EMAILS`, `APP_ADMIN_EMAILS`).
- Development: a synthetic identity `dev:<DEV_AUTH_EMAIL>`.
- `src/lib/auth/session.ts` provisions a `users` row keyed by
  `(auth_issuer, auth_subject)`. The first administrator claims the row
  `LEGACY_OWNER_ID` (`src/lib/db/constants.ts`) that holds all pre-migration data.
- `src/proxy.ts` (Next 16 proxy) rejects unauthenticated requests.
- Public prefixes: `/.auth`, `/demo`, `/login`.

**`users` table contents** (read-only query, emails masked in the session)

| Row | Issuer | Role | Owned data |
|---|---|---|---|
| `LEGACY_OWNER_ID` | `google` (claimed via Easy Auth; `auth_subject` is the Google `sub`) | admin | all real data (114 rows in a 5-table sample) |
| `dev:developer@localhost` | `development` | admin | 0 in sample |
| `dev-test:developer@localhost` | `development` | member | 0 in sample |

No duplicate emails. Consequence: local development currently runs as an
empty account. After this change, signing in locally with the owner's Google
account reaches the real data, because local and production share one database.

**Ownership** — every personal-data table already carries `user_id` → `users.id`
(uuid). TCF question content is shared.

**Versions**

| Package | Installed | Better Auth 1.7.7 requires |
|---|---|---|
| `next` | 16.2.4 | `^14 \|\| ^15 \|\| ^16` ✓ |
| `drizzle-orm` | 0.36.4 | `^0.45.2` ✗ → upgrade (§4.1) |
| `drizzle-kit` | 0.28.1 | `>=0.31.4` ✗ → upgrade (§4.1) |
| `zod` | 3.25.76 | Better Auth depends on its own `zod ^4`; no peer conflict |

The project uses `postgres` (postgres.js) 3.4.9 via `drizzle-orm/postgres-js`.
Migrations live in `drizzle/` (journal format version 7).

**Uncommitted working tree** — an earlier Codex session added local cookie
profiles (`owner` / `test`), relaxed the production allowlist, added `/login`
and `/account` pages, per-account TCF offline queues, a stricter `media-url`
route, and a rollback-only smoke script. §4.9 decides what survives.

---

## 2. Scope

**In scope**

- Upgrade Drizzle to versions Better Auth supports.
- Better Auth on the existing `users` table:
  - Google OAuth and email OTP;
  - database sessions;
  - the admin plugin (roles, ban, impersonation);
  - rate limiting.
- Migrate the owner's existing Google identity so their first sign-in lands
  on `LEGACY_OWNER_ID`.
- `/login` and `/account` pages; an impersonation banner.
- Replace Easy Auth header trust in `proxy.ts` and `session.ts`, keeping the
  `getCurrentUser` / `requireUser` / `requireAdmin` signatures.
- Email delivery: console in development, Resend in production.
- A sign-up gate (`AUTH_SIGNUP_ENABLED`), closed by default in production.
- Salvage selected Codex changes with fixes (§4.9).

**Out of scope** (later sub-projects)

- Tiers, invite codes, feature toggles (2).
- AI quotas (3).
- Admin console UI beyond what impersonation needs (4).
- Account deletion, privacy notice, publishing the Google consent screen (5).
- Playwright E2E and CI: a separate cross-cutting task after sub-project 1.

---

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Auth library | Better Auth 1.7.x | Self-hosted on our Postgres. Real login works locally. Mainstream in the TS/Next ecosystem. Auth.js maintainers joined it. |
| Sign-in methods | Google + email OTP (6 digits) | No passwords. OTP covers users without Google access, such as mainland China. |
| User table | Reuse `users` via `modelName` | ~30 tables reference `users.id` (uuid). No foreign keys move. |
| Roles / disabling | Better Auth admin plugin | Ban revokes sessions immediately. Impersonation previews another user's view. `role` stays `admin` / `member`. |
| Sessions | Database sessions, cookie cache **off** | A ban takes effect immediately. Load is trivial at this scale. |
| Rate-limit storage | `database` | App Service may run several instances. |
| Identity migration | Seed an `accounts` row for the owner's Google `sub` | Deterministic. Does not depend on implicit email linking. |
| Production launch | Sign-up closed until sub-project 2 | Otherwise new users get every feature: copyrighted TCF content and paid AI. |

---

## 4. Design

### 4.1 Step 0 — Drizzle upgrade (own commit)

- Upgrade `drizzle-orm` to `^0.45.2` and `drizzle-kit` to `^0.31.4`.
- Release notes from 0.37 to 0.45 contain no breaking change that affects
  this codebase. Two items need attention:
  - **0.44 wraps driver errors in `DrizzleQueryError`.** The original error is
    on `.cause`. Application code never inspects Postgres error codes;
    `scripts/review-rehearsal/safety.mts` does (`"code" in error`). Make it
    check `error.cause` too.
  - **drizzle-kit 0.30 stopped emitting `IF NOT EXISTS` / `DO $$` guards** in
    generated SQL. This affects future migrations only.
- **Acceptance**:
  - `npx drizzle-kit generate` produces **no** new migration (schema parity);
  - `npx tsc --noEmit`, `npm run lint` and `npm test` pass;
  - the main pages load in the browser.

### 4.2 Data model

**`users` becomes the Better Auth user model** (`user: { modelName: "users" }`).
Changes:

| Column | Change |
|---|---|
| `name` | **add** `text not null default ''` (Better Auth requires it; OTP sign-ups have no name) |
| `email_verified` | **add** `boolean not null default false` |
| `image` | **add** `text` nullable |
| `email` | **add unique constraint** (no duplicates exist; the migration asserts this first) |
| `role` | keep the `user_role` enum (`admin` / `member`); admin plugin `defaultRole: "member"`, `adminRoles: ["admin"]` |
| `banned` | **add** `boolean not null default false` (admin plugin) |
| `ban_reason` | **add** `text` nullable |
| `ban_expires` | **add** `timestamptz` nullable |
| `status` | keep for now; the migration copies `disabled` → `banned = true`; code stops reading it; dropped in a later cleanup migration |
| `auth_issuer`, `auth_subject` | **make nullable**; code stops reading them; dropped in the same cleanup migration |

Better Auth addresses columns by their Drizzle property names (`emailVerified`,
`createdAt`, …). The snake_case database names therefore need no `fields`
mapping, as long as the property names match Better Auth's.

**New tables.** They follow the project convention for new tables: `uuid`
PK `defaultRandom()` and `timestamp(..., { withTimezone: true })`.

- `sessions` — Better Auth session plus the admin plugin's `impersonated_by`.
- `accounts` — one row per linked sign-in method (`provider_id`, `account_id`,
  tokens, `user_id`).
- `verifications` — OTP and other verification values.
- `rate_limits` — `storage: "database"` rate limiting.

Column sets follow the Better Auth 1.7 core and plugin schemas. During
implementation, hand-write them in `src/lib/db/schema.ts`. Diff them against
`npx @better-auth/cli generate` output as a reference only; never let the CLI
overwrite `schema.ts`.

**IDs.** Set `advanced.database.generateId: "uuid"`, so the app generates
uuid strings that fit the `uuid` columns. The column defaults remain for
scripts.

**OAuth tokens.** Only basic scopes (`openid email profile`) are requested.
If Better Auth 1.7 supports encrypting stored OAuth tokens, enable it.
Otherwise, record that the tokens are low-value basic-scope tokens.

### 4.3 Data migration (same migration, after DDL)

1. Assert no duplicate `lower(email)` in `users`; abort otherwise.
2. Set `email_verified = true` and `banned = (status = 'disabled')` for all rows.
3. **Owner identity**: for the row `LEGACY_OWNER_ID` with `auth_issuer = 'google'`,
   insert an `accounts` row with:
   - `provider_id = 'google'`
   - `account_id = <that row's auth_subject>`
   - `user_id = LEGACY_OWNER_ID`

   Better Auth looks up Google sign-ins by `(provider_id, account_id)` = the
   Google `sub`, which is what Easy Auth stored. *Verify during implementation*
   that Easy Auth's principal id equals the Google `sub`: compare with the `sub`
   in a Better Auth Google callback before running the migration for real.
4. Delete rows with `auth_issuer = 'development'`.
   - Both currently own no data.
   - Plain `DELETE` relies on the foreign keys' default `RESTRICT`: any owned
     row aborts the whole migration instead of cascading.

The migration is additive for the old code: Easy Auth code keeps working
after it runs, so it can be applied before the deploy.

### 4.4 Better Auth configuration (`src/lib/auth/auth.ts`)

- **Adapter**: `drizzleAdapter(db, { provider: "pg", schema })` with
  `modelName` mappings for `users`, `sessions`, `accounts`, `verifications`.
- **`socialProviders.google`**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  Reuse the OAuth client Easy Auth already uses.
- **`emailOTP` plugin**:
  - `otpLength: 6`, `expiresIn: 300`, `allowedAttempts: 3`;
  - `storeOTP: "hashed"` (the default is plaintext);
  - `sendVerificationOTP` → §4.7.
- **`admin` plugin**: `defaultRole: "member"`, `adminRoles: ["admin"]`,
  impersonation duration 1 h (the default).
- **Account linking**: enabled (the default).
  - Google reports verified emails, so Google ↔ OTP accounts with the same
    email resolve to one user.
  - Do not set `allowDifferentEmails`.
- **`rateLimit`**: `storage: "database"`.
  - Production defaults: 100 requests per 10 s.
  - `customRules` for the OTP send endpoint: 3 per 60 s per IP.
  - Verify the endpoint path against 1.7.
  - `ipAddressHeaders` / `trustedProxies`: see §8.
- **Sign-up gate**: `databaseHooks.user.create.before` rejects with an
  `APIError` when sign-up is disabled.
  - This single enforcement point covers Google and OTP alike.
  - `AUTH_SIGNUP_ENABLED` is `"true"` / `"false"`. When unset it is `true` in
    development and `false` in production.
- **`trustedOrigins`**: `BETTER_AUTH_URL` (plus `http://localhost:3000` in
  development).
- **`nextCookies()`** is the **last** plugin, so server actions can set cookies.

The client lives in `src/lib/auth/client.ts`: `createAuthClient` with
`emailOTPClient()` and `adminClient()`.

### 4.5 Login flow and pages

**`/login`** — one entry for sign-up and sign-in:

- "Continue with Google" → `signIn.social({ provider: "google", callbackURL })`.
- The email form:
  1. `emailOtp.sendVerificationOtp({ email, type: "sign-in" })`;
  2. a 6-digit code field;
  3. `signIn.emailOtp({ email, otp })`.
- A first successful sign-in creates the account when the gate is open.
- `callbackURL` comes from `?callbackURL=`.
  - Accept only same-origin relative paths: it starts with `/`, does not start
    with `//`, and has no scheme.
  - Default to `/today`.
  - Implement this in a pure, tested `safeCallbackPath()`.
- Error messages:
  - invalid or expired code;
  - too many attempts (request a new code);
  - rate limited (wait a minute);
  - sign-up closed ("Sign-up is currently closed. Existing accounts can sign in.");
  - email unavailable (OTP form hidden when production email is not configured;
    Google still offered);
  - Google error (from the callback `error` param).
- Already signed in → show "Signed in as …", Continue, and Sign out.
- Follow the existing UI primitives and spacing in `src/components/ui/` and
  the current page idiom.

**`/account`** (under `(main)`):

- Shows email, role, and linked sign-in methods (`listAccounts`).
- Sign out (`signOut`, then go to `/login`).
- No deletion yet (sub-project 5).

**Impersonation banner** — in the `(main)` and `tcf` layouts. When the session
has `impersonatedBy`, show "Viewing as <email> — Stop" (`admin.stopImpersonating`).
Starting impersonation comes with the admin console in sub-project 4. Until
then, the smoke checks and manual checks call `admin.impersonateUser` directly.

**Sidebar** — the footer shows the email and role and links to `/account`
(salvaged from Codex).

### 4.6 Request authorization

- **`src/app/api/auth/[...all]/route.ts`**: `toNextJsHandler(auth)`.
- **`src/proxy.ts`**: an optimistic check only.
  - `getSessionCookie(request)`; no cookie → a page request redirects to
    `/login?callbackURL=<path+search>`; an API request gets 401 JSON (current
    behavior).
  - Public prefixes: `/login`, `/demo`, `/api/auth`.
  - Easy Auth handling is removed.
- **`src/lib/auth/session.ts`**: same exports and signatures.
  - `getCurrentUser = cache(...)` → `auth.api.getSession({ headers: await headers() })`.
    It returns null when there is no session or the user is banned.
  - `requireUser()` throws `AuthenticationError("UNAUTHENTICATED")`.
  - `requireAdmin()` throws `FORBIDDEN` for non-admins.
  - `requirePageUser()` redirects to `/login?callbackURL=…` (from Codex).
  - `AuthenticatedUser` becomes `{ id, email, name, role, impersonatedBy }`.
    `subject` / `provider` are dropped; only Codex's account page reads them,
    and it is being replaced.
  - `provisionUser` and the legacy-claim logic are deleted; Better Auth creates
    users.
- **Deleted**:
  - `src/lib/auth/identity.ts` and its test;
  - the env vars `APP_AUTH_MODE`, `APP_AUTH_PROVIDER`, `APP_ALLOWED_EMAILS`,
    `APP_ADMIN_EMAILS`, `DEV_AUTH_EMAIL`.
- **New env vars** (document them in `.env.example` and `CLAUDE.md`):
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `RESEND_API_KEY`
  - `AUTH_EMAIL_FROM`
  - `AUTH_SIGNUP_ENABLED`

### 4.7 Email delivery (`src/lib/auth/email.ts`)

`sendOtpEmail({ to, otp })`:

- **Development**: `console.info` the code with the address. No network call,
  no key needed.
- **Production**: send through Resend (`resend` SDK) from `AUTH_EMAIL_FROM`
  (for example `noreply@mail.<domain>`).
  - Plain text plus minimal HTML in English.
  - Content: the code, "expires in 5 minutes", and "ignore if you didn't request it".
- If `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is missing in production, OTP is
  **unavailable**: `/login` hides the email form and the send endpoint fails
  closed. Google sign-in still works.
- **Cost**: the Resend free tier is 3,000 emails/month and 100/day; one domain
  on the free tier.

The owner has not bought a domain yet (decision: Cloudflare Registrar `.com`,
roughly US$10–11/yr at cost, bought later). This does not block development
or a Google-only production cutover.

### 4.8 Production cutover

1. **Google Cloud Console** (owner): add these redirect URIs to the existing
   OAuth client:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<production host>/api/auth/callback/google`

   The consent screen may stay in *Testing* until sub-project 2.
2. **App Service settings** (owner): set `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `AUTH_SIGNUP_ENABLED=false`. Resend settings come once the domain exists.
3. **Database**:
   - confirm Azure Postgres point-in-time restore is enabled;
   - run the rehearsed migration (§6).
4. **Deploy** the new code and **disable Easy Auth** in the same window. With
   Easy Auth's "require authentication" on, `/login` and `/api/auth/*` would
   be intercepted.
5. Verify (§6, production list).
6. After a verification period, a cleanup migration drops `users.status`,
   `auth_issuer` and `auth_subject`.

### 4.9 Disposition of the uncommitted Codex work

First, commit the entire current working tree **unchanged** to the branch
`archive/codex-account-profiles`. Then reset `main` to `HEAD`. Port the
pieces below into the new implementation.

| Piece | Disposition |
|---|---|
| `src/app/api/media-url/route.ts` exact-path ownership check | Keep as is |
| TCF per-account offline queue (`pending-sync.ts`, `sync-identity.ts` + test, `expectedUserId` in `recordTcf*`, runner/header call sites) | Keep, with the fixes below |
| `src/components/account-session.tsx` (remount per account, cross-tab reload) | Keep; also needed for impersonation |
| Sidebar account footer | Keep, retargeted to `/account` |
| `requirePageUser` | Keep (§4.6) |
| `scripts/account-access-smoke.mts` | Keep and adapt: mock the Better Auth session instead of the local cookie; keep all 11 checks and add one: an admin impersonating a member reads only the member's documents |
| Local cookie profiles, allowlist relaxation, `identity.ts` + tests, `/login`, `/account`, `actions/account.ts`, `proxy.ts` / `.env.example` edits | Drop (replaced) |
| `docs/operations/accounts.md` | Rewrite for this design |
| `docs/operations/account-verification/2026-10-03/*` | Drop (it verifies the replaced design) |

**Offline-queue fixes**

1. **Send first, queue on failure** (the original behavior). This removes the
   "1 non enregistrée" badge flash on every answer.
2. When a flush finishes and items were enqueued meanwhile, flush again
   immediately instead of waiting for the 30 s interval.
3. Restore the deleted explanatory comments (why the queue exists; why
   `crypto.randomUUID` can't be used on plain-HTTP LAN), and place imports
   in the files' existing order.

**Legacy queue** — the unscoped `tcf-pending-sync` key can only predate
multi-user, when production had a single user. When the signed-in user is
`LEGACY_OWNER_ID`, adopt its entries once into that account's queue and
delete the key. Replays are idempotent via `requestKey`. Other accounts never
read it. The in-progress drill state under the old unprefixed key is lost
once; this is accepted.

---

## 5. Error handling

| Situation | Behavior |
|---|---|
| No or invalid session | Pages redirect to `/login?callbackURL=…`; actions throw `UNAUTHENTICATED`; route handlers return 401 |
| Banned user | `getCurrentUser` returns null; sessions were revoked at ban time; sign-in shows the ban message |
| Sign-up closed, unknown identity | `user.create.before` rejects; `/login` shows the closed message; no row is created |
| OTP wrong / expired / attempts exceeded | A specific message; "send a new code" available |
| Rate limited | 429 → "Too many attempts, wait a minute" |
| Email provider failure | Generic "Couldn't send the code"; logged server-side without the code |
| Production email not configured | OTP hidden and fails closed; Google unaffected |
| Missing `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` in production | Fail at startup (no insecure default) |
| Stale tab after an account switch or impersonation | `AccountSession` reloads other tabs; queued TCF answers for another account are rejected with `ACCOUNT_CHANGED` and kept for their owner |

---

## 6. Testing and verification

**Unit tests** (`npm test`, node:test):

- `safeCallbackPath()`: relative paths pass; `//evil`, `https://…`,
  `javascript:` and empty input fall back to `/today`.
- Session mapping: a Better Auth session becomes `AuthenticatedUser`; a banned
  user maps to null; the role is preserved.
- Sign-up gate: a disabled gate rejects creation; an enabled gate allows it;
  defaults are correct per `NODE_ENV`.
- Offline queue: send-first, queue-on-failure; items enqueued during a flush
  are flushed again; the legacy queue is adopted only for `LEGACY_OWNER_ID`.

**Migration rehearsal** against the shared database:

1. Apply the migration SQL inside a transaction.
2. Assert, then roll back:
   - the `users` count before/after (currently 3 → 1; re-counted at run time);
   - the owner `accounts` row exists;
   - owned-row counts for `LEGACY_OWNER_ID` are unchanged (the 5-table sample,
     114 rows on 2026-10-03, re-counted at run time);
   - `email` is unique.
3. Paste the output.
4. Only then apply it for real and re-run the same assertions without the rollback.

**Local end-to-end** (paste actual output or counts for each):

1. Owner Google sign-in lands on `LEGACY_OWNER_ID`; the library document count
   matches the database.
2. A new email signs up via the console OTP → a new `member` with an empty library.
3. An admin impersonates that member → the member view and banner → stop.
4. Ban the member → their open session is rejected on the next request; unban.
5. Sign out → a private page redirects to `/login?callbackURL=…` → sign-in
   returns to that page.
6. `AUTH_SIGNUP_ENABLED=false` → a new email cannot register; existing
   accounts still sign in.
7. The OTP rate limit triggers. Rate limiting is off in development by default,
   so enable it explicitly for this check.
8. TCF: answering shows no pending badge. Offline (devtools) → queued → online
   → flushed, and the attempt row exists.
9. The adapted smoke script: all checks pass and everything rolls back.
10. `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.
    Before building, confirm the build output does not disturb the owner's
    running dev server.

**Production** (at cutover; OTP items once a domain exists):

- Google sign-in on the deployed host reaches the owner's data.
- Easy Auth is off and `/login` is reachable while signed out.
- The rate limiter sees the real client IP (§8).
- OTP email arrives at Gmail and at a mainland-China provider (QQ/163).

---

## 7. Commit sequence

Conventional commits, **without** `Co-Authored-By` trailers (owner preference).

1. Archive the Codex work on `archive/codex-account-profiles`; `main` is clean.
2. `feat(tcf): isolate offline answer queues per account` — the salvaged
   queue, `AccountSession`, `media-url` hardening, with the §4.9 fixes. It
   works under Easy Auth too: layouts take `user.id` from the existing
   `requireUser()`; `requirePageUser` arrives in commit 5 along with `/login`.
3. `chore(deps): upgrade drizzle-orm to 0.45 and drizzle-kit to 0.31`
4. `feat(db): add Better Auth tables and migrate the owner identity`
5. `feat(auth): replace Easy Auth with Better Auth` — config, route, proxy,
   session, pages, email, removal of the old env vars.
6. `docs: account system operations; adapt the access smoke check`

Before each commit, inspect the staged diff. No exam content, emails or
secrets.

---

## 8. Risks and open items

- **Client IP behind App Service.** Azure's `X-Forwarded-For` may carry
  `ip:port`. Confirm how Better Auth parses it. If needed, configure
  `ipAddressHeaders` / `trustedProxies` or normalize the header in `proxy.ts`.
  Verify in deployment.
- **Easy Auth principal id = Google `sub`.** Assumed from the 21-digit stored
  value; verify before the real migration (§4.3).
- **`role` enum vs the admin plugin's string role.** The database enum rejects
  values outside `admin` / `member`. Never call `setRole` with other values.
  Sub-project 4's UI offers only these two.
- **The admin plugin's `banned` vs `users.status`.** Both exist until the
  cleanup migration; only `banned` is read.
- **Better Auth on postgres.js through the Drizzle adapter** is the supported
  path. Run the migration rehearsal and the smoke script before any production step.
- **Domain not yet purchased.** OTP stays unavailable in production until then;
  the Google-only cutover is still possible.
- **Google consent screen** stays in *Testing* (up to 100 test users) until
  sub-project 2 publishes it.

---

## 9. Out-of-scope reminders for this sub-project

No tiers, invite codes, feature toggles, AI quotas, admin console pages,
account deletion, privacy page, Playwright or CI here.

---

## 10. Decisions recorded for later sub-projects

**2 — Tiers, invite codes, feature toggles**

- Tiers:
  - `registered`: the default on sign-up;
  - `full`: granted by an invite code;
  - administrators: everything.
  - Tier is separate from `role`.
- Invite codes are admin-generated. Each has `max_uses` (1 = single person,
  N = a class), an optional `expires_at`, a note, and can be revoked at any time.
  Redemption upgrades the user to `full`.
- Feature keys live in a code registry. Whether a feature is available to the
  `registered` tier is a database toggle set in the admin console, effective
  immediately.
- Enforcement is server-side (actions, route handlers, pages). Navigation shows
  locked features with an invite-code prompt.
- The TCF question bank defaults to `full` only (copyright).
- Opening registration means setting `AUTH_SIGNUP_ENABLED=true` and publishing
  the Google consent screen.

**3 — AI quotas**

- Per-user daily limits per tier, editable by admins; administrators are unlimited.
- A global daily cap acts as a circuit breaker that pauses non-admin AI calls.
- Generalize the reservation/settlement pattern in `src/lib/speaking/operations.ts`
  (advisory lock, per-owner daily and global totals) to the ~10 call sites
  under `src/lib/ai/` plus Azure Speech.

**4 — Admin console**

- Users: tier, role, banned, usage; ban / unban, change tier, impersonate.
- Invite codes: create, list, revoke, usage.
- Feature toggles and quota settings.

**5 — Public-launch requirements**

- Account deletion (Better Auth `deleteUser` with owned-data cleanup).
- A privacy notice.
- Abuse limits on sign-up and OTP, including Resend's 100/day free cap.
- Publishing the Google consent screen (homepage, privacy link, authorized
  domain).
- A custom domain on App Service with a managed certificate.
