# Guest Access and Invite Codes — Design Spec

> Sub-project 2 of the account system: what a signed-in person who is not the
> owner sees. A recruiter clicks once and gets a guest account with a sample
> workspace and no paid AI. A friend redeems an invite code and gets every
> feature. The owner stays administrator.
>
> Designed in a brainstorming session on 2026-10-06/07. Executable cold, without
> that conversation. Facts were verified on 2026-10-07.
>
> **Supersedes** "2 — Tiers, invite codes, feature toggles" in
> `2026-10-03-auth-foundation-design.md` §10. Sub-projects 3–5 there still
> stand, adjusted as described in §13.

---

## 1. Summary

### 1.1 Three kinds of account

| Access | How you get it | What you get |
|---|---|---|
| **Guest** | "Try without signing up" on `/demo` or `/login` — no email, no Google | A 7-day account pre-filled with a sample workspace; every feature that costs no AI and uses no copyrighted content |
| **Full** | Sign up with an invite code (Google or email OTP) | Every feature, starting from an empty account |
| **Admin** | The owner's account | Everything, plus `/admin/invites` |

Audience, in priority order: (1) recruiters following the résumé link, who will
not ask for a code and should see the core loop within minutes; (2) classmates
and friends, who get a code.

### 1.2 Who sees what

| Area | Guest | Full | Admin |
|---|---|---|---|
| Today, Review, Progress, Settings | ✓ (sample data) | ✓ | ✓ |
| Conjugation drills | ✓ | ✓ | ✓ |
| Library — read texts | ✓ (sample texts) | ✓ | ✓ |
| Library — add your own texts | ✗ | ✓ | ✓ |
| Word look-up | Sample texts only | ✓ | ✓ |
| Detailed word entries | ✗ (sample words arrive pre-enriched) | ✓ | ✓ |
| Writing — read tasks and feedback | ✓ | ✓ | ✓ |
| Writing — new tasks and feedback | ✗ | ✓ | ✓ |
| Targeted micro-drills | ✗ | ✓ | ✓ |
| Quiz and cloze sets | ✗ | ✓ | ✓ |
| TCF Canada bank | ✗ (points to the original `/demo` question) | ✓ | ✓ |
| Speaking lab | ✗ | ✓ | ✓ |
| `/account` | Guest view + invite form | ✓ | ✓ |
| `/admin/invites`, TCF explanation API, API-key test | — | — | ✓ |

Locked areas stay visible in navigation with a lock and lead to a page that
explains the feature and offers the invite form.

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Free tier with limited AI | **Postponed** | No quota system yet (sub-project 3); product shape undecided |
| How recruiters get in | **One-click guest** (Better Auth `anonymous` plugin) | No email, no Google, no code |
| What guests see | **Sample workspace** copied into their account; non-AI features open; paid AI locked | Empty pages and a wall of locks would hide the product |
| Self-registration | **Invite code required** | Without free AI, a "registered" tier offers nothing a guest lacks |
| Tiers | **No tier column**; access derived from `role` and `is_anonymous` | Every non-anonymous member was created with a code |
| Feature availability | **Code registry**, not database toggles | Only one question ("can a guest use it?"); toggles wait for the admin console |
| Admin UI | **Minimal `/admin/invites`** | Creating codes on a phone is the only admin need today |
| Guest → full | **Start empty**; delete the guest | Guest data is mostly simulated and would pollute the learner profile |
| Sample workspace | **Reviewed JSON fixtures in the repo**, produced with the real app | Reviewable, provenance recordable, testable, no AI cost per guest |
| Guest word look-up | **Sample texts only**, from pre-generated entries | The look-up popover is the most visible reading feature |
| Guest document upload | **Locked** | PDF parsing costs function time; anonymous uploads invite abuse |

---

## 3. Current state (verified 2026-10-07)

**Auth**
- Better Auth 1.7.7 with Google, email OTP and the admin plugin (`src/lib/auth/auth.ts`).
- Sign-up is gated by `AUTH_SIGNUP_ENABLED` (closed in production) via
  `disableSignUp` on both providers plus a `databaseHooks.user.create.before` backstop.
- `AuthenticatedUser` is `{ id, email, name, role, impersonatedBy }`; `role` is `admin` / `member`.

**Authorization**
- Only two places check more than "signed in": `requireAdmin()` in
  `src/app/api/tcf/explanations/route.ts` and `testApiKey()` in `src/lib/actions/settings.ts`.
- **Every other feature is open to any signed-in user.** Production is safe
  today only because sign-up is closed. A new member would see an empty
  Library and Quiz, the full TCF bank, and unlimited AI (the speaking-pilot
  budget in `src/lib/speaking/operations.ts` is the only cap).

**Data**
- ~34 tables carry `user_id`. Shared content: `tcf_sets`/`tcf_questions` and
  `speaking_prompts` (copyrighted TCF material), `rules`, `grammar_points`,
  `vocabulary_lookups`/`vocabulary_aliases`.
- Word look-up is cache-first **per user** (`user_vocabulary`, `resolveLookup()`
  in `src/lib/actions/vocabulary.ts`), so a new account calls the AI on every
  first look-up.
- The production database is fully migrated (0000–0037, applied 2026-10-06);
  new migrations go through `npm run db:init`. Local development uses the same database.

**AI chokepoints**
- Every OpenAI call gets its client from `getOpenAI()` in `src/lib/ai/client.ts` (15 call sites).
- Azure Speech is reached through `src/lib/speech/azure.ts` and `src/lib/speaking/operations.ts`.

**Hosting**: Vercel Hobby (`yul1`); every push to `main` deploys to production.

**Better Auth behavior relied on** (read from `node_modules/better-auth`)
- `anonymous` plugin: endpoint `/sign-in/anonymous`; adds `users.is_anonymous`;
  generates a placeholder email. When an anonymous session signs in by another
  method (`/sign-in*`, `/callback*`, `/email-otp/verify-email`), it calls
  `onLinkAccount` and then `internalAdapter.deleteUser(anonymousId)`; a failed
  delete is logged and does not fail the sign-in.
- `databaseHooks.user.create.before/after` and `user.delete.before` receive
  `(user, context: GenericEndpointContext | null)`; `context` exposes request
  headers and cookies when an endpoint creates the user.

---

## 4. Scope

**In scope**: derived access levels; a feature registry with three-layer
enforcement and locked UI; user-data deletion; invite codes with
`/admin/invites`; one-click guests with caps, a sample workspace, sample-only
look-ups, a 7-day lifetime and a daily cleanup job.

**Out of scope**: a free tier and AI quotas (3); user management, database
toggles, quota settings (4); account-deletion UI, privacy notice, publishing
the Google consent screen, deleting R2 objects on user deletion (5);
shareable invite links (`/invite/CODE`).

---

## 5. Data model — migration 0038

New tables follow the project convention: `uuid` PK `defaultRandom()`,
`timestamp(..., { withTimezone: true })`.

**`users`** — add `is_anonymous boolean not null default false` (Drizzle
property `isAnonymous`, as the plugin expects).

**`invite_codes`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text unique not null | normalized `XXXX-XXXX` (§8.1) |
| `max_uses` | integer not null | ≥ 1 |
| `used_count` | integer not null default 0 | check `used_count <= max_uses` |
| `expires_at` | timestamptz null | |
| `note` | text not null default '' | |
| `revoked_at` | timestamptz null | |
| `created_by` | uuid not null → `users.id` | always an administrator |
| `created_at` | timestamptz not null default now() | |

**`invite_redemptions`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invite_id` | uuid not null → `invite_codes.id` | |
| `user_id` | uuid not null unique → `users.id` | |
| `redeemed_at` | timestamptz not null default now() | |

---

## 6. Access and feature gating

### 6.1 Access levels

```ts
type Access = "guest" | "full" | "admin";
// admin ⇐ role === "admin";  guest ⇐ isAnonymous;  full ⇐ otherwise
```

- `AuthenticatedUser` gains `access` and `guestExpiresAt` (`createdAt + 7 days`
  for guests, otherwise `null`); `toAuthenticatedUser()` derives both.
- No `tier` column. A future free tier adds one; the registry shape stays.
- Administrators pass every check. An administrator impersonating a guest gets
  guest access, because impersonation swaps the session user.

### 6.2 Feature registry (`src/lib/access/features.ts`)

Pure data, importable from client components. Anything not listed is open to
every signed-in user.

```ts
type GuestRule = boolean | "sample";
export const FEATURES = {
  tcf:        { guest: false,    label: "TCF Canada practice" },
  speaking:   { guest: false,    label: "Speaking lab" },
  quiz:       { guest: false,    label: "Quiz and cloze sets" },
  writing:    { guest: false,    label: "Writing feedback" },
  microDrill: { guest: false,    label: "Targeted drills" },
  upload:     { guest: false,    label: "Adding your own texts" },
  lookup:     { guest: "sample", label: "Word look-up" },
  enrich:     { guest: false,    label: "Detailed word entries" },
} as const satisfies Record<string, { guest: GuestRule; label: string }>;
export type FeatureKey = keyof typeof FEATURES;
export function canUse(access: Access, key: FeatureKey): GuestRule; // full/admin → true
```

| Key | Gated entry points |
|---|---|
| `tcf` | `/tcf`, `/tcf/drill`, `/tcf/exam`, `/tcf/review`; every export of `src/lib/actions/tcf.ts`; `writeFromTcfPassage`; TCF media in `/api/media-url` |
| `speaking` | every page under `/speaking`; every export of `speaking.ts` and `speaking-simulation.ts`; `/api/speaking/{assess,follow-ups,recordings,sessions}` |
| `quiz` | `/quiz`, `/quiz/[setId]`; every export of `quiz.ts` and `cloze.ts`; quiz audio in `/api/media-url` |
| `writing` | `generateWritingTask`, `quickWrite`, `practiceFromPattern`, `createSubmission`, `regenerateFeedback` (reading tasks and feedback stays open) |
| `microDrill` | `createMicroDrill`, `retryMicroDrillFeedback` |
| `upload` | `createDocument` |
| `lookup` | `resolveLookup` (sample-only for guests, §9.4); `reexplainInContext` locked for guests |
| `enrich` | `enrichEntry` |

Before implementation, re-list the exports of each named file and every route
under the gated prefixes; this table must stay exhaustive.

### 6.3 Enforcement (three layers)

**Layer 1 — actions and route handlers** (`src/lib/access/guard.ts`, server-only)
- `requireFeature(key)` returns the user or throws
  `AuthenticationError("FEATURE_LOCKED")` (new code); route handlers map it to 403.
- Gated actions call it **instead of** `requireUser()`. Read-only exports of
  `tcf.ts`, `speaking*.ts`, `quiz.ts` and `cloze.ts` are gated too, because any
  `"use server"` export can be called by a direct POST.
- Exception: summary reads used by `/today` and `/progress` (TCF progress
  overview, readiness, week counts) return empty values for guests instead of
  throwing. List them during implementation.
- Production hides thrown messages, so an action a guest reaches in normal use
  returns `{ status: "locked", feature }` instead of throwing — concretely
  `resolveLookup` on a miss. Other locked actions are behind disabled buttons
  (§6.4); their throws are a backstop.

**Layer 2 — pages**
- `pageGate(key)` returns `null` or `<FeatureLocked feature={key} />`. Each gated
  page (~11) starts with `const locked = await pageGate("tcf"); if (locked) return locked;`.
- Pages gate themselves rather than layouts: whether a layout that ignores
  `children` still runs the child page's server component is unverified.

**Layer 3 — AI and speech backstop**
- `getOpenAI()` becomes `async` and throws `FEATURE_LOCKED` for a guest. Outside
  a request scope (scripts) `headers()` throws; that is caught and the call
  proceeds. All 15 call sites become `await getOpenAI()`.
- The same check guards the Azure Speech entry points.
- A missed call site therefore fails closed instead of spending money.

### 6.4 Locked UI

- **Navigation** (`src/lib/navigation.ts`, `src/components/sidebar.tsx`):
  `NavigationItem` gains `feature?: FeatureKey`; for guests, locked items show a
  lock icon. `Sidebar` takes `{ label, access, guestExpiresAt }` instead of
  `email`/`role` and shows "Guest · expires Oct 14", the member's email, or
  "Administrator". Admins also get an "Invites" item.
- **Training hub and Today skill cards**: Listening (→ TCF) and Speaking carry an
  "Invite only" badge for guests; their links lead to the locked page.
- **`<FeatureLocked>`** (`src/components/feature-locked.tsx`): the feature label,
  one or two sentences on what it does, the invite form (§8.2), and for `tcf` a
  "Try an original sample question" link to `/demo`. Built from
  `src/components/ui/` primitives, matching existing page spacing.
- **Disabled controls** for guests, each with an inline "Invite only" note:
  Library "add text", writing start/submit, micro-drill start, Vocabulary
  "detailed entry".
- **Look-up popover**: a `locked` result reads "Look-ups outside the sample texts
  need an invite code."

---

## 7. Deleting a user's data

Shared by guest seeding failures, guest conversion, the cleanup job, and later
account deletion (sub-project 5).

- **`OWNED_TABLES`** (`src/lib/account/owned-tables.ts`): every table holding user
  data, ordered children before parents, each with how to select one user's
  rows. Includes child tables without `user_id` that hang off owned rows (e.g.
  `quiz_passages` under `quiz_sets`) and `invite_redemptions`. Also used by the
  sample-workspace exporter and seeder (§9).
- **Coverage test**: every table exported by `schema.ts` that has a `user_id`
  column, or a foreign key into a listed table, must be listed or explicitly
  excluded (`sessions`, `accounts` — Better Auth deletes them; `invite_codes` —
  `created_by` is always an administrator, who is never deleted by these paths).
- **`purgeOwnedData(userId, tx)`** deletes owned rows only. It runs in
  `databaseHooks.user.delete.before`, so Better Auth's own deletes (the
  anonymous plugin after conversion; the admin plugin's `removeUser` later)
  succeed despite `RESTRICT` foreign keys.
- **`deleteUserData(userId)`**: one transaction — `purgeOwnedData`, then the
  user's `sessions`, `accounts` and `users` row. Returns per-table counts.
- R2 objects are not deleted; guests cannot create any.

---

## 8. Invite codes

### 8.1 Code format

8 characters of Crockford base32 (no `I L O U`), shown as `XXXX-XXXX`, ≈40 bits.
Input normalization: uppercase, drop spaces and dashes, map `O→0` and `I/L→1`,
re-insert the dash. Generated with `crypto.getRandomValues`; regenerate on a
unique-constraint collision. Stored in **plaintext** so the admin page can show
codes again; codes are low-value and revocable.

### 8.2 Signing up with a code

1. `/login` offers **"Have an invite code?"** → server action `checkInviteCode(code)`:
   - rate-limited to 10 attempts per IP per 10 minutes (custom key in `rate_limits`);
   - returns `{ status: "ok" | "invalid" | "expired" | "used_up" | "revoked" | "rate_limited" }`;
   - on `ok`, sets cookie `sundew_invite` = normalized code (HttpOnly,
     `SameSite=Lax`, `Secure` in production, path `/`, max-age 600 s).
2. The page switches to **"Create your account"** with Google and email OTP.
3. `user.create.before`, non-anonymous user:
   - reject when `AUTH_SIGNUP_ENABLED === "false"`;
   - read `sundew_invite` from `context`; reject when absent;
   - reserve one use atomically:
     `UPDATE invite_codes SET used_count = used_count + 1 WHERE code = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) AND used_count < max_uses RETURNING id`;
     no row → reject.
4. `user.create.after`: read `sundew_invite` again, select the invite id by code,
   insert `invite_redemptions`, expire the cookie.
5. Signing in to an existing account creates no user and needs no code.
6. The providers' `disableSignUp` options are removed; the hook is the single
   gate, and `/login` maps its messages (Google errors arrive as the callback
   `error` param).

If user creation fails after the reservation, one use is lost — accepted (rare,
visible on the admin page).

### 8.3 Guest → full

1. A guest enters a code on a locked page or `/account` → `checkInviteCode` →
   Google or email OTP.
2. Better Auth creates the full user (§8.2 hooks run); the plugin then deletes
   the anonymous user, and `user.delete.before` purges its data (§7).
3. No `onLinkAccount` handler is registered; the new account starts empty.
4. If the plugin's delete fails, it only logs; the cleanup job removes the guest (§9.5).

### 8.4 `/admin/invites`

- `src/app/(main)/admin/invites/page.tsx`; non-admins get `notFound()`.
- **Create**: max uses (default 1), expiry (none / 7 days / 30 days / a date),
  note → shows the code with a copy button.
- **List**: code, note, used / max, expiry, status (active / expired / used up /
  revoked), created; expandable redemptions (email, date). Revoke with confirmation.
- Actions in `src/lib/actions/invites.ts`: `createInviteCode`, `listInviteCodes`,
  `revokeInviteCode` (`requireAdmin()`), and the public `checkInviteCode`.

---

## 9. Guest accounts

### 9.1 Entry

1. `/demo` ("Try the full app") and `/login` ("Try without signing up") call
   `authClient.signIn.anonymous()`. The button is hidden when guest access is disabled.
2. `user.create.before`, anonymous user: reject when
   `GUEST_ACCESS_ENABLED === "false"` or when ≥ 200 anonymous users were created
   since 00:00 UTC.
3. `user.create.after`, anonymous user: `seedSampleWorkspace(user.id, now)` (§9.3).
   On failure, `deleteUserData(user.id)` and rethrow.
4. The client redirects to `/today`.
5. Rate limit: `rateLimit.customRules["/sign-in/anonymous"] = { window: 3600, max: 3 }` (per IP).
6. Plugin options: `anonymous({ generateName: () => "Guest" })`. The placeholder
   email is kept and never shown.
7. `/account` for guests: "Guest · expires <date>", the invite form, and "End demo" (sign out).

### 9.2 Sample workspace — authoring (one-time, estimated < US$0.20)

```
data/sample-workspace/
  source/          # reviewed Markdown: 3 texts, 2 writing prompts, 2 learner essays
  workspace.json   # exported rows: symbolic ids, relative timestamps
  lookups.json     # ~450 pre-generated look-up entries keyed by normalized surface
```

All content is original (the repository `origin` is public) and is recorded in
`docs/demo-content-sources.md`.

1. **Draft** — `npm run sample:draft`: gpt-4o drafts three A2–B1 texts (everyday
   life in Montréal), two writing prompts and two learner essays with natural
   errors into `source/`; the owner edits them. ≈ US$0.05.
2. **Produce with the real app**, locally: create an invite; sign up a "sample
   author" by email OTP (codes print to the console in development); paste the
   texts into Library, read them, save ~15 words; complete both prompts with the
   learner essays and get real feedback; do a few conjugation and review
   sessions so Today and Progress show a week of history. ≈ US$0.10. The author
   account lives in the production database and **stays** there for free
   re-exports.
3. **Export** — `npm run sample:export -- --email <author>` writes `workspace.json`:
   - **Step 0, before writing the exporter**: list every id-like column without
     a declared foreign key and every jsonb field, with real rows from the
     author account, and show the list to the owner (CLAUDE.md rule 1). Known
     so far: the polymorphic `review_evidence.attempt_id` and
     `practice_run_items.attempt_id` (by `attempt_type`).
   - walk `OWNED_TABLES`; replace each primary key with a symbolic ref
     (`documents#1`); rewrite owned foreign keys and the polymorphic references
     to refs; keep references to shared tables (`rules`, `grammar_points`);
     drop `user_id`; store timestamps as offsets from export time;
   - **abort** if the author owns any row in `tcf_*`, `speaking_*` or `quiz_*`
     tables, or any exported string contains an email address.
4. **Look-ups** — `npm run sample:lookups`: `lookupWord(surface, sentence)` for
   every unique token of the three texts → `lookups.json`; prints processed /
   succeeded / failed. ≈ US$0.05.
5. **Review and commit**: the owner reviews the diff; provenance is recorded
   (AI-assisted, author, date, reviewer).

### 9.3 Sample workspace — seeding (`src/lib/sample-workspace/seed.ts`)

- `seedSampleWorkspace(userId, now)`: one transaction, inserts in `OWNED_TABLES`
  order; each ref gets a fresh id (`uuid` for uuid PKs, `randomUUID()` text for
  older text PKs); each timestamp becomes `now − offset`; `user_id = userId`.
- Remapping is a pure, unit-tested function; the insert loop is thin.
- Both JSON files are imported statically (a few hundred KB in the server bundle).
- `request_key` columns are unique per user, so copying them is safe.
- **Drift check** — `npm run sample:check` seeds a temporary user in a
  rolled-back transaction and prints per-table counts. Run after every
  migration and before every deploy; on failure, re-export (no AI cost).

### 9.4 Sample-only look-ups

`resolveLookup` for a guest:
1. the guest's own `user_vocabulary` (unchanged cache-hit path);
2. `lookups.json` by normalized surface → write the entry, alias and occurrence
   exactly as the AI-miss path does, without calling the AI;
3. otherwise return `{ status: "locked", feature: "lookup" }`.

### 9.5 Lifetime and cleanup

- A guest is deleted 7 days after **creation**, regardless of activity.
- `vercel.json`: `"crons": [{ "path": "/api/cron/cleanup-guests", "schedule": "0 9 * * *" }]`
  (≈ 05:00 Montréal; Hobby runs crons once a day, within the hour).
- `src/app/api/cron/cleanup-guests/route.ts`: requires
  `Authorization: Bearer ${CRON_SECRET}` (401 otherwise); deletes up to 100
  anonymous users with `created_at < now() − 7 days` via `deleteUserData`; logs
  per-table totals.
- `src/proxy.ts`: add `/api/cron` to the public prefixes (the secret is the gate).

---

## 10. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_SIGNUP_ENABLED` | `true` (changed) | Emergency switch: `false` stops all invite sign-ups |
| `GUEST_ACCESS_ENABLED` | `true` | `false` hides the guest button and rejects guest creation |
| `CRON_SECRET` | — (required in production) | Bearer token Vercel sends to cron routes |

`signupEnabled()` (`src/lib/auth/signup.ts`) changes its default; update its tests.

---

## 11. Error handling

| Situation | Behavior |
|---|---|
| Guest access disabled | Button hidden; direct call rejected |
| 4th guest from one IP within an hour | 429 → "Too many demo sessions from this network. Try again later." |
| Daily guest cap reached | "The demo is at capacity today." + link to `/demo` |
| Seeding fails | Guest deleted; "Couldn't start the demo" |
| Code wrong / expired / used up / revoked | Specific message from `checkInviteCode` |
| Code valid at check, used up before creation | "This invite code is no longer valid." |
| New identity without a code | "An invite code is required to create an account." |
| `AUTH_SIGNUP_ENABLED=false` | "Sign-up is currently closed. Existing accounts can sign in." |
| Guest opens a locked page | `<FeatureLocked>` |
| Guest calls a locked action directly | `FEATURE_LOCKED` (403 for route handlers) |
| Guest clicks a word outside the sample | Popover: invite-only message |
| A missed AI call site runs for a guest | `getOpenAI()` throws; no spend |
| Plugin fails to delete a converted guest | Logged; the cleanup job removes it |
| Cron called without the secret | 401 |
| Schema drift breaks seeding | `sample:check` fails before deploy; re-export |

---

## 12. Testing and verification

**Verify first** — before building on them, confirm three runtime assumptions:
1. `user.create.before` reads `sundew_invite` on a Google callback and on an OTP
   verify. If not, stop and revisit §8.2.
2. A converted guest is deleted through `user.delete.before` → `purgeOwnedData`.
3. The rate limiter sees the client IP on Vercel (`x-forwarded-for`).

**Unit tests** (`npm test`, node:test)
- `canUse`: every access × feature; admin always allowed.
- Invite codes: normalization (case, missing dash, spaces, confusable characters)
  and status evaluation (revoked / expired / used up / ok).
- `signupEnabled()` new default.
- `OWNED_TABLES` coverage.
- Seed remapping: refs → ids, owned and polymorphic references, offsets → timestamps.
- Guard coverage: a source scan asserting every exported async function in
  `tcf.ts`, `speaking.ts`, `speaking-simulation.ts`, `quiz.ts`, `cloze.ts` calls
  `requireFeature`.
- Sample look-up: normalized-surface hit and miss.

**Real runs** (paste the output or counts for each)
1. `npm run sample:check`: per-table counts, rolled back.
2. One-click guest locally → `/today` shows sample data; per-table counts match `workspace.json`.
3. As a guest: every gated page shows `<FeatureLocked>`; TCF media → 403; a direct
   POST to a gated action → rejected; a sample word → result with no OpenAI
   request in the log; another word → locked message.
4. Guest rate limit (enable rate limiting in development): the 4th guest from
   one IP within an hour is rejected.
5. Invite: a 1-use code → a new email signs up by OTP → full access; a second use
   → "no longer valid"; revoked and expired codes rejected.
6. Guest → full: the guest's owned rows are gone (counts 0); the new account is full and empty.
7. Cleanup: a guest with `created_at` moved back 8 days → the cron route with the
   secret deletes it with per-table counts; without the secret → 401.
8. An admin impersonating a guest sees the guest view; the AI backstop blocks.
9. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (without
   disturbing the owner's running dev server).
10. Production, after deploy: the guest flow on sundew.jingxuanxu.com; the real
    client IP reaches the rate limiter; the first cron run appears in Vercel logs.

---

## 13. Effect on later sub-projects

- **3 — AI quotas**: apply to `full` users only; guests have no AI. A future free
  tier adds a `tier` column and registry rules.
- **4 — Admin console**: user management, database feature toggles and quota
  settings remain; `user.delete.before` already purges data for `removeUser`.
- **5 — Public launch**: account deletion reuses `deleteUserData` (plus R2
  cleanup). Recruiters no longer need a published Google consent screen; friends
  need it only for Google sign-in while it stays in *Testing* (≤ 100 manually
  added test users) — email OTP avoids that once Resend is configured.

---

## 14. Delivery

Develop on **`feat/guest-access`**; merge to `main` only when complete, because
every push to `main` deploys to production.

Conventional commits **without** `Co-Authored-By` trailers (owner preference).
Inspect each staged diff: no exam content, emails or secrets.

| # | Commit | Contents |
|---|---|---|
| 1 | `feat(db): add anonymous users and invite codes` | schema, migration 0038 (§5) |
| 2 | `feat(account): delete a user's owned data` | `OWNED_TABLES`, purge/delete, coverage test (§7) |
| 3 | `feat(access): gate features by access level` | registry, three layers, locked UI (§6) |
| 4 | `feat(auth): require an invite code to sign up` | invite actions and hooks, `/login` step, `/admin/invites` (§8) |
| 5 | `feat(auth): add one-click guest access` | anonymous plugin, entry buttons, caps, guest `/account`, conversion (§9.1, §8.3) |
| 6 | `feat(sample): seed the sample workspace and guest look-ups` | seeding, look-up fallback, `sample:check`, authoring scripts — no data yet (§9.2–9.4) |
| 7 | `feat(sample): add the reviewed sample workspace data` | fixtures and provenance, after the owner's review |
| 8 | `feat(ops): delete expired guests daily` | cron route, `vercel.json`, proxy (§9.5) |
| 9 | `docs: …` | `CLAUDE.md` env vars, `.env.example`, operations notes |

**Owner actions before merge**
- Vercel: set `CRON_SECRET`; set `AUTH_SIGNUP_ENABLED=true` (codes still
  required); optionally `GUEST_ACCESS_ENABLED`.
- Confirm whether Resend is configured in production and whether the Google
  consent screen is still in *Testing* (affects friends' first sign-in only).
- Review the sample workspace content (commit 7).
