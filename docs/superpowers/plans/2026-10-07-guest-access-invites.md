# Guest Access and Invite Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recruiters get a one-click guest account pre-filled with a sample workspace and no
paid AI; invited friends get full accounts; the owner gets an invite-code admin page.

**Architecture:** Access is derived per request from `users.role` and the new
`users.is_anonymous` (guest / full / admin). A pure feature registry says what guests may
use. Enforcement happens in server actions and route handlers (`requireFeature`), at the top
of gated pages (`pageGate`), and in the OpenAI / Azure Speech entry points (backstop).
Better Auth's `anonymous` plugin creates guests; `databaseHooks` enforce guest caps,
invite-gated sign-up and data purge on delete. A reviewed JSON fixture, exported from a real
"sample author" account, is copied into each guest at creation. A daily Vercel cron deletes
guests 7 days after creation.

**Tech Stack:** Next 16.2.4 (App Router, server actions), React 19.2, better-auth 1.7.7
(`anonymous`, `emailOTP`, `admin`), drizzle-orm 0.45 / drizzle-kit 0.31, postgres.js 3.4,
node:test via `tsx --test`, Vercel Hobby cron.

**Spec:** `docs/superpowers/specs/2026-10-07-guest-access-invites-design.md`

## Global Constraints

- Work on branch `feat/guest-access`. **Never push `main` until Task 17** — every push to `main` deploys to production.
- Commits: conventional commits, **no** `Co-Authored-By` / "Generated with" trailers.
- Before every commit: inspect `git diff --cached` — no exam content, real emails, Google ids or secrets. The repo is public.
- Local development uses the **production** database. Applying a migration, or writing data outside a rolled-back transaction, needs the owner's explicit OK in chat after showing what will run. Test users created during verification are deleted at the end of the same task.
- The owner usually runs `npm run dev` on :3000. Check with `lsof -i :3000` before starting a server. Editing `.env.local` or restarting their server needs a heads-up in chat first.
- AI spend happens only in Task 15 (estimated < US$0.20 total). State the estimate and wait for the owner's OK before each paid run.
- Next 16: read the matching guide in `node_modules/next/dist/docs/` before using `cookies()`, `headers()`, `after()` or route handlers. `cookies()` and `headers()` are async.
- Production hides thrown server-action messages: anything a guest reaches in normal use returns a **result object**, never a throw.
- UI: semantic tokens only (`text-muted-foreground`, `bg-surface`, …); primitives from `src/components/ui/`; match the spacing and idiom of neighbouring components.
- New tables: `uuid("id").primaryKey().defaultRandom()` and `timestamp(..., { withTimezone: true })`.
- Throwaway scripts go in `scripts/<name>.tmp.mjs` (gitignored by `*.tmp.mjs`) and run with `node --import tsx scripts/<name>.tmp.mjs`. Never commit them.
- Per-task verification: `npm run typecheck && npm run lint && npm test`, plus the task's real run with its output pasted to the owner.
- Constants (spec §5, §9): guest lifetime 7 days; 3 guest sign-ins per IP per hour; 200 guests per UTC day; invite check 10 per IP per 10 minutes; cookie `sundew_invite`, max-age 600 s; cleanup 100 guests per run; cron `0 9 * * *`.
- Exact user-facing copy (spec §11):
  - "Too many demo sessions from this network. Try again later."
  - "The demo is at capacity today. Try the sample question instead."
  - "Couldn't start the demo. Please try again."
  - "An invite code is required to create an account." / "This invite code is no longer valid."
  - "Sign-up is currently closed. Existing accounts can sign in."
  - "Look-ups outside the sample texts need an invite code."

## Deviations from the spec (decided while planning; the spec is updated in the same commit as this plan)

1. **`data/` is gitignored**, so fixtures live in `src/lib/sample-workspace/fixtures/` and the reviewed drafts in `src/lib/sample-workspace/source/`.
2. **`user_vocabulary.lemma`, `vocabulary_occurrences.lemma` and `vocabulary_gaps.lemma` reference the shared `vocabulary_lookups.lemma`.** Fixtures carry those shared lemma rows; seeding upserts them first, like `upsertEntry()` does.
3. **Writing prompts come from the app's own task generator** during authoring. The draft script produces three texts and two learner essays only.
4. **OTP send guard.** With the providers' `disableSignUp` removed, `sendVerificationOTP` sends nothing for an email that has no account and no invite cookie. This protects Resend's 100/day cap.
5. **`AUTH_RATE_LIMIT_ENABLED=true`** turns Better Auth rate limiting on in development, so the guest limit can be tested.
6. **Guest sign-in (Task 5) and invites (Tasks 6–8) land before feature gating (Tasks 9–12)**, so gating is verified with a real guest and a real invite form. Nothing deploys until the merge.
7. **Owned tables are derived from the schema** (every table with `user_id`, minus explicit exclusions, plus the quiz child tables) instead of a hand-written list; the order is a topological sort of the foreign keys.
8. **The practice page lists a guest's sample submissions** (`listRecentSubmissions`), since "Écrire maintenant" is locked for them.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` | `users.isAnonymous`; `inviteCodes`; `inviteRedemptions` |
| `drizzle/0038_guest_access_invites.sql` (generated) | Migration |
| `src/lib/access/features.ts` (new) | `Access`, `FEATURES`, `canUse`, `deriveAccess` — pure |
| `src/lib/access/limits.ts` (new) | Constants, `guestExpiresAt`, `formatGuestExpiry` — pure |
| `src/lib/access/guard.ts` (new) | `requireFeature` — server |
| `src/lib/access/page-gate.tsx` (new) | `pageGate` — server |
| `src/lib/access/ai-guard.ts` (new) | `assertAiAllowed` — server, loaded only in the Next runtime |
| `src/components/access-context.tsx` (new) | `AccessProvider`, `useAccess`, `useFeatureLocked` — client |
| `src/components/feature-locked.tsx` (new) | Locked page |
| `src/components/invite-only-note.tsx` (new) | Inline "Invite only" note |
| `src/components/invite-code-form.tsx` (new) | Code entry → account creation |
| `src/components/guest-start-button.tsx` (new) | One-click guest |
| `src/lib/auth/user.ts` | `AuthenticatedUser` gains `access`, `guestExpiresAt` |
| `src/lib/auth/session.ts` | `FEATURE_LOCKED` code, `authErrorStatus` |
| `src/lib/auth/auth.ts` | anonymous plugin, hooks, rate-limit rules, OTP guard |
| `src/lib/auth/client.ts` | `anonymousClient()` |
| `src/lib/auth/signup.ts` | Kill-switch default `true` |
| `src/lib/auth/guest.ts` (new) | `guestAccessEnabled`, `rateLimitEnabled` — pure |
| `src/lib/auth/rate-limit.ts` (new) | `consumeRateLimit` on `rate_limits` |
| `src/lib/auth/client-ip.ts` (new) | `clientIp(headers)` — pure |
| `src/lib/invites/code.ts` (new) | Generate / normalize / status / expiry — pure |
| `src/lib/invites/redeem.ts` (new) | `reserveInviteUse`, `recordRedemption`, `mayReceiveSignInCode` |
| `src/lib/actions/invites.ts` (new) | `checkInviteCode`, `clearInviteCode`, `createInviteCode`, `listInviteCodes`, `revokeInviteCode` |
| `src/app/(main)/admin/invites/page.tsx` + `_components/*` (new) | Admin page |
| `src/lib/account/owned-tables.ts` (new) | Owned-table registry, topological order |
| `src/lib/account/delete.ts` (new) | `purgeOwnedData`, `deleteUserData` |
| `src/lib/sample-workspace/format.ts` (new) | Fixture encode/decode — pure |
| `src/lib/sample-workspace/lookups.ts` (new) | `sampleLookupKey`, `tokenizeForLookups` — pure |
| `src/lib/sample-workspace/seed.ts` (new) | `seedSampleWorkspace` |
| `src/lib/sample-workspace/fixtures/{workspace,lookups}.json` (new) | Reviewed fixtures |
| `src/lib/sample-workspace/source/*.md` (new) | Reviewed drafts |
| `scripts/sample-workspace/{draft,export,lookups,check}.mts` (new) | Authoring and drift check |
| `src/app/api/cron/cleanup-guests/route.ts` (new) | Daily cleanup |
| `vercel.json`, `src/proxy.ts` | Cron schedule; `/api/cron` public prefix |
| Gated actions, routes, pages, UI | Tasks 10–11 list each file |

---

### Task 1: Spike — does the invite cookie reach the create hook? (throwaway, no commit)

Spec §12 "Verify first" item 1. If this fails, stop and report; §8.2 needs a different design.

**Files:** temporary edit of `src/lib/auth/auth.ts` only (reverted at the end).

- [ ] **Step 1: Add a temporary log to the existing `user.create.before` hook**

In `src/lib/auth/auth.ts`, change the hook signature and add the log as the first line:

```ts
before: async (user, context) => {
  console.info("[spike] invite cookie:", context?.getCookie("sundew_invite") ?? null, "path:", context?.path ?? null);
  if (!signupOpen) throw new APIError("FORBIDDEN", { message: "Sign-up is currently closed." });
  return { data: user };
},
```

- [ ] **Step 2: Set the cookie in a fresh browser profile on `http://localhost:3000/login`**

In the browser devtools console:

```js
document.cookie = "sundew_invite=TEST-1234; path=/; max-age=600; samesite=lax";
```

- [ ] **Step 3: Email OTP path**

Sign up with a new address (for example `spike-otp@example.com`). In development the code is printed in the dev-server output. Read the output and expect
`[spike] invite cookie: TEST-1234 path: /sign-in/email-otp`.

- [ ] **Step 4: Google path (owner action)**

Ask the owner to repeat Step 2 in a fresh browser profile, then click "Continue with Google" with a Google account that has **no** Sundew account. Expect
`[spike] invite cookie: TEST-1234 path: /callback/:id` (or similar).

- [ ] **Step 5: Record the Google error parameter for a rejected sign-up**

Temporarily make the hook throw after the log:
`throw new APIError("FORBIDDEN", { code: "INVITE_REQUIRED", message: "An invite code is required to create an account." });`.
Have the owner repeat Step 4 with another Google account that has no Sundew account. Record the exact `error=` value in the URL `/login` receives. Task 8 maps it.

- [ ] **Step 6: Revert and clean up**

```bash
git checkout src/lib/auth/auth.ts
```

The test accounts own no data, so deleting their `users` rows cascades to sessions and accounts. Ask the owner for an OK, then run:

```sql
delete from users where email in ('spike-otp@example.com', '<google test email(s)>');
```

Run it through `npm run db:studio` or a throwaway script.

- [ ] **Step 7: Report**

Paste the log lines and the error value. If either path printed `null`, **stop** and raise it with the owner before Task 6.

---

### Task 2: Schema and migration 0038

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0038_guest_access_invites.sql`, `drizzle/meta/0038_snapshot.json` (generated)

**Interfaces:**
- Produces: `users.isAnonymous: boolean`; tables `inviteCodes` (`id, code, maxUses, usedCount, expiresAt, note, revokedAt, createdBy, createdAt`) and `inviteRedemptions` (`id, inviteId, userId, redeemedAt`).

- [ ] **Step 1: Add the column to `users`** (after `banExpires`)

```ts
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    // Better Auth anonymous plugin: one-click guest accounts.
    isAnonymous: boolean("is_anonymous").notNull().default(false),
```

- [ ] **Step 2: Add the invite tables** directly after the `rateLimits` table

```ts
/* ------------------------------------------------------------------ */
/*  invites — admin-issued codes that unlock account creation           */
/* ------------------------------------------------------------------ */

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Normalized XXXX-XXXX (Crockford base32); plaintext so admins can copy it again. */
    code: text("code").notNull(),
    maxUses: integer("max_uses").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invite_codes_code_key").on(t.code),
    check("invite_codes_uses", sql`${t.maxUses} >= 1 and ${t.usedCount} >= 0 and ${t.usedCount} <= ${t.maxUses}`),
  ],
);

export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id").notNull().references(() => inviteCodes.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invite_redemptions_user_key").on(t.userId), index("invite_redemptions_invite_idx").on(t.inviteId)],
);
```

- [ ] **Step 3: Generate the migration**

Run: `npx drizzle-kit generate --name guest_access_invites`
Expected: creates `drizzle/0038_guest_access_invites.sql` containing exactly:
- `ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;`
- `CREATE TABLE "invite_codes"` (with the check and unique constraints)
- `CREATE TABLE "invite_redemptions"` (with the unique constraint)
- three `ADD CONSTRAINT … FOREIGN KEY` statements
- one `CREATE INDEX "invite_redemptions_invite_idx"`

No other statements. If there are others, stop: the snapshot has drifted.

- [ ] **Step 4: Confirm schema parity**

Run: `npx drizzle-kit generate`
Expected: `No schema changes, nothing to migrate`.

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Apply the migration (owner OK required)**

Show the owner the SQL from Step 3. The migration is additive: the running production code ignores the new column and tables. After the OK, run:

```bash
npm run db:init
```

Expected: `✓ Database is up to date.`

- [ ] **Step 7: Verify on the database** with a throwaway `scripts/check-0038.tmp.mjs`

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
console.log(await sql`select column_name, data_type, column_default from information_schema.columns where table_name = 'users' and column_name = 'is_anonymous'`);
console.log(await sql`select table_name from information_schema.tables where table_name in ('invite_codes', 'invite_redemptions') order by 1`);
console.log(await sql`select count(*)::int as ledger from drizzle.__drizzle_migrations`);
await sql.end();
```

Run: `node --import tsx scripts/check-0038.tmp.mjs`
Expected:
- one `is_anonymous` row with type `boolean` and default `false`;
- both tables listed;
- `ledger: 39`.

Paste the output.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0038_guest_access_invites.sql drizzle/meta/0038_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): add anonymous users and invite codes"
```

---

### Task 3: Access model and feature registry (TDD)

**Files:**
- Create: `src/lib/access/features.ts`, `src/lib/access/limits.ts`, `src/lib/access/access.test.ts`
- Modify: `src/lib/auth/user.ts`, `src/lib/auth/auth-helpers.test.ts`

**Interfaces:**
- Produces:
  - `type Access = "guest" | "full" | "admin"`;
  - `FEATURES`, `type FeatureKey`, `canUse(access, key): boolean | "sample"`, `deriveAccess(role, isAnonymous): Access`;
  - `limits.ts` constants (see Global Constraints), `guestExpiresAt(createdAt: Date): Date`, `formatGuestExpiry(date: Date): string` (e.g. `"Oct 14"`, UTC);
  - `AuthenticatedUser.access: Access`, `AuthenticatedUser.guestExpiresAt: Date | null`.

- [ ] **Step 1: Write the failing tests** — `src/lib/access/access.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { FEATURES, canUse, deriveAccess, type Access, type FeatureKey } from "./features";
import { formatGuestExpiry, guestExpiresAt } from "./limits";

test("access derives from role and anonymity", () => {
  assert.equal(deriveAccess("admin", false), "admin");
  assert.equal(deriveAccess("admin", true), "admin");
  assert.equal(deriveAccess("member", true), "guest");
  assert.equal(deriveAccess("member", false), "full");
  assert.equal(deriveAccess(null, null), "full");
});

test("full and admin use everything; guests follow the registry", () => {
  const keys = Object.keys(FEATURES) as FeatureKey[];
  for (const access of ["full", "admin"] as Access[]) {
    for (const key of keys) assert.equal(canUse(access, key), true, `${access} ${key}`);
  }
  assert.deepEqual(Object.fromEntries(keys.map((key) => [key, canUse("guest", key)])), {
    tcf: false, speaking: false, quiz: false, writing: false,
    microDrill: false, upload: false, lookup: "sample", enrich: false,
  });
});

test("guests expire seven days after creation", () => {
  const expires = guestExpiresAt(new Date("2026-10-07T12:00:00Z"));
  assert.equal(expires.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(formatGuestExpiry(expires), "Oct 14");
});
```

Append to `src/lib/auth/auth-helpers.test.ts`, and update the existing deep-equal:

```ts
// in "sessions map to the app user; banned users have none":
  assert.deepEqual(toAuthenticatedUser(session), {
    id: "u1", email: "a@example.com", name: "", role: "admin",
    access: "admin", guestExpiresAt: null, impersonatedBy: null,
  });

test("anonymous users are guests with an expiry", () => {
  const guest = toAuthenticatedUser({
    user: { id: "g1", email: "temp@anonymous.invalid", name: "Guest", role: "member", isAnonymous: true, createdAt: "2026-10-07T12:00:00Z" },
    session: {},
  });
  assert.equal(guest?.access, "guest");
  assert.equal(guest?.role, "member");
  assert.equal(guest?.guestExpiresAt?.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(toAuthenticatedUser({ user: { id: "m1", email: "m@example.com", name: "", role: "member" }, session: {} })?.access, "full");
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test`
Expected: FAIL. `./features` and `./limits` cannot be resolved, and the deep-equal reports missing `access`.

- [ ] **Step 3: Implement** — `src/lib/access/features.ts`

```ts
/** Who may use what. Pure data: imported by server guards and client UI alike. */
export type Access = "guest" | "full" | "admin";
export type GuestRule = boolean | "sample";

export const FEATURES = {
  tcf: { guest: false, label: "TCF Canada practice" },
  speaking: { guest: false, label: "Speaking lab" },
  quiz: { guest: false, label: "Quiz and cloze sets" },
  writing: { guest: false, label: "Writing feedback" },
  microDrill: { guest: false, label: "Targeted drills" },
  upload: { guest: false, label: "Adding your own texts" },
  lookup: { guest: "sample", label: "Word look-up" },
  enrich: { guest: false, label: "Detailed word entries" },
} as const satisfies Record<string, { guest: GuestRule; label: string }>;

export type FeatureKey = keyof typeof FEATURES;

/** `true` = full use; `"sample"` = only inside the sample workspace; `false` = locked. */
export function canUse(access: Access, key: FeatureKey): GuestRule {
  return access === "guest" ? FEATURES[key].guest : true;
}

export function deriveAccess(role: string | null | undefined, isAnonymous: boolean | null | undefined): Access {
  if (role === "admin") return "admin";
  return isAnonymous ? "guest" : "full";
}
```

`src/lib/access/limits.ts`:

```ts
/** Guest and invite limits from the guest-access spec (§5, §9). */
export const GUEST_LIFETIME_DAYS = 7;
export const GUEST_SIGNINS_PER_IP_PER_HOUR = 3;
export const GUEST_DAILY_CAP = 200;
export const GUEST_CLEANUP_BATCH = 100;
export const INVITE_COOKIE = "sundew_invite";
export const INVITE_COOKIE_MAX_AGE_S = 600;
export const INVITE_CHECKS_PER_WINDOW = 10;
export const INVITE_CHECK_WINDOW_S = 600;

const DAY_MS = 86_400_000;

export function guestExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + GUEST_LIFETIME_DAYS * DAY_MS);
}

/** "Oct 14" — UTC, so server and client render the same day. */
export function formatGuestExpiry(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
```

Replace `src/lib/auth/user.ts`:

```ts
import { deriveAccess, type Access } from "@/lib/access/features";
import { guestExpiresAt } from "@/lib/access/limits";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  /** What this user may use — derived from role and is_anonymous. */
  access: Access;
  /** Guests only: when the daily cleanup deletes this account. */
  guestExpiresAt: Date | null;
  /** Set while an administrator is viewing the app as this user. */
  impersonatedBy: string | null;
};

type SessionLike = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
    banned?: boolean | null;
    isAnonymous?: boolean | null;
    createdAt?: Date | string | null;
  };
  session: { impersonatedBy?: string | null };
};

export function toAuthenticatedUser(session: SessionLike | null): AuthenticatedUser | null {
  if (!session || session.user.banned) return null;
  const access = deriveAccess(session.user.role, session.user.isAnonymous);
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "admin" ? "admin" : "member",
    access,
    guestExpiresAt: access === "guest" ? guestExpiresAt(new Date(session.user.createdAt ?? Date.now())) : null,
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: pass. `getSession()`'s user type does not include `isAnonymous` until Task 5 registers the plugin; `SessionLike` makes it optional, so this compiles now.

- [ ] **Step 6: Commit**

```bash
git add src/lib/access src/lib/auth/user.ts src/lib/auth/auth-helpers.test.ts
git commit -m "feat(access): derive guest, full and admin access"
```

---

### Task 4: Owned-data registry and user deletion

**Files:**
- Create: `src/lib/account/owned-tables.ts`, `src/lib/account/owned-tables.test.ts`, `src/lib/account/delete.ts`

**Interfaces:**
- Produces:
  - `type OwnedTable = { name: string; table: PgTable; scope: (userId: string) => SQL }`;
  - `OWNED_TABLES: OwnedTable[]` (parents first) and `OWNED_DELETE_ORDER` (children first);
  - `EXCLUDED_TABLES: Record<string, string>`;
  - `ownedEdges(tables): Array<[child: string, parent: string]>`;
  - `parentsFirst(names, edges): string[]`;
  - `type Dbx`;
  - `purgeOwnedData(userId, dbx?): Promise<Record<string, number>>`;
  - `deleteUserData(userId, dbx?): Promise<Record<string, number>>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/account/owned-tables.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { EXCLUDED_TABLES, OWNED_DELETE_ORDER, OWNED_TABLES, ownedEdges, parentsFirst } from "./owned-tables";

const owned = new Set(OWNED_TABLES.map((t) => t.name));
const allTables = Object.values(schema).filter((value): value is PgTable => is(value, PgTable));

test("every table that references an owned table is owned or excluded", () => {
  for (const table of allTables) {
    const { name, foreignKeys } = getTableConfig(table);
    if (owned.has(name) || name in EXCLUDED_TABLES) continue;
    for (const fk of foreignKeys) {
      const parent = getTableConfig(fk.reference().foreignTable).name;
      assert.ok(!owned.has(parent), `${name} references owned table ${parent}: add it to the registry or EXCLUDED_TABLES`);
    }
  }
});

test("every table with user_id is owned or excluded", () => {
  for (const table of allTables) {
    const { name, columns } = getTableConfig(table);
    if (columns.some((c) => c.name === "user_id")) assert.ok(owned.has(name) || name in EXCLUDED_TABLES, name);
  }
});

test("the registry covers personal data and quiz children, not shared or auth tables", () => {
  for (const name of ["documents", "submissions", "errors", "user_vocabulary", "quiz_sets", "quiz_passages", "quiz_questions", "invite_redemptions", "tcf_question_attempts", "speaking_turns"]) {
    assert.ok(owned.has(name), name);
  }
  for (const name of ["users", "sessions", "accounts", "invite_codes", "tcf_questions", "vocabulary_lookups", "rules"]) {
    assert.ok(!owned.has(name), name);
  }
});

test("delete order removes children before parents", () => {
  const position = new Map(OWNED_DELETE_ORDER.map((t, i) => [t.name, i]));
  for (const [child, parent] of ownedEdges(OWNED_TABLES)) {
    assert.ok(position.get(child)! < position.get(parent)!, `${child} must be deleted before ${parent}`);
  }
});

test("parentsFirst rejects a cycle", () => {
  assert.throws(() => parentsFirst(["a", "b"], [["a", "b"], ["b", "a"]]), /cycle/);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test`
Expected: FAIL — `./owned-tables` cannot be resolved.

- [ ] **Step 3: Implement** — `src/lib/account/owned-tables.ts`

```ts
/**
 * Every table that holds one user's data, derived from the schema so a new
 * table cannot be forgotten. Shared by account deletion, the sample-workspace
 * exporter and the sample seeder. Pure: no database access.
 */
import { is, sql, type SQL } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

export type OwnedTable = { name: string; table: PgTable; scope: (userId: string) => SQL };

/** Tables with a user_id that this registry must not purge, and why. */
export const EXCLUDED_TABLES: Record<string, string> = {
  sessions: "Better Auth; cascades when the users row is deleted",
  accounts: "Better Auth; cascades when the users row is deleted",
};

/** Owned tables without user_id, scoped through their parent rows. */
const CHILD_SCOPES: Record<string, (userId: string) => SQL> = {
  quiz_passages: (userId) =>
    sql`${schema.quizPassages.setId} in (select ${schema.quizSets.id} from ${schema.quizSets} where ${schema.quizSets.userId} = ${userId})`,
  quiz_questions: (userId) =>
    sql`${schema.quizQuestions.passageId} in (select ${schema.quizPassages.id} from ${schema.quizPassages} join ${schema.quizSets} on ${schema.quizSets.id} = ${schema.quizPassages.setId} where ${schema.quizSets.userId} = ${userId})`,
};

const allTables = Object.values(schema).filter((value): value is PgTable => is(value, PgTable));

function collectOwned(): OwnedTable[] {
  const owned: OwnedTable[] = [];
  for (const table of allTables) {
    const { name, columns } = getTableConfig(table);
    if (name in EXCLUDED_TABLES) continue;
    const userColumn = columns.find((column) => column.name === "user_id");
    if (userColumn) owned.push({ name, table, scope: (userId) => sql`${userColumn} = ${userId}` });
    else if (CHILD_SCOPES[name]) owned.push({ name, table, scope: CHILD_SCOPES[name] });
  }
  return owned;
}

/** Foreign-key edges [child, parent] between owned tables. */
export function ownedEdges(tables: OwnedTable[]): Array<[string, string]> {
  const names = new Set(tables.map((t) => t.name));
  const edges: Array<[string, string]> = [];
  for (const { name, table } of tables) {
    for (const fk of getTableConfig(table).foreignKeys) {
      const parent = getTableConfig(fk.reference().foreignTable).name;
      if (parent !== name && names.has(parent)) edges.push([name, parent]);
    }
  }
  return edges;
}

/** Kahn's algorithm: parents before children, ties alphabetical. Throws on a cycle. */
export function parentsFirst(names: string[], edges: Array<[string, string]>): string[] {
  const pending = new Map(names.map((n) => [n, new Set<string>()]));
  for (const [child, parent] of edges) pending.get(child)?.add(parent);
  const order: string[] = [];
  while (pending.size) {
    const ready = [...pending].filter(([, parents]) => parents.size === 0).map(([n]) => n).sort();
    if (!ready.length) throw new Error(`Foreign-key cycle among: ${[...pending.keys()].join(", ")}`);
    for (const name of ready) {
      order.push(name);
      pending.delete(name);
      for (const parents of pending.values()) parents.delete(name);
    }
  }
  return order;
}

const collected = collectOwned();
const byName = new Map(collected.map((t) => [t.name, t]));

/** Parents first — the insert order. */
export const OWNED_TABLES: OwnedTable[] = parentsFirst([...byName.keys()], ownedEdges(collected)).map((n) => byName.get(n)!);
/** Children first — the delete order. */
export const OWNED_DELETE_ORDER: OwnedTable[] = [...OWNED_TABLES].reverse();
```

`src/lib/account/delete.ts`:

```ts
/**
 * Deletes one user's data. Not "use server": called from Better Auth hooks,
 * the guest cleanup route and scripts.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { OWNED_DELETE_ORDER } from "./owned-tables";

export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Deletes every row the user owns, children first. Leaves the users row. */
export async function purgeOwnedData(userId: string, dbx: Dbx = db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { name, table, scope } of OWNED_DELETE_ORDER) {
    const deleted = await dbx.delete(table).where(scope(userId)).returning({ one: sql<number>`1` });
    if (deleted.length) counts[name] = deleted.length;
  }
  return counts;
}

/** Purges owned data, then the users row (sessions and accounts cascade) — in one transaction. */
export async function deleteUserData(userId: string, dbx: Dbx = db): Promise<Record<string, number>> {
  const run = async (tx: Dbx) => {
    const counts = await purgeOwnedData(userId, tx);
    await tx.delete(users).where(eq(users.id, userId));
    return counts;
  };
  return dbx === db ? db.transaction(run) : run(dbx);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. If "every table that references an owned table…" fails, read the table it names. If it is user data, add a `CHILD_SCOPES` entry; if not, add it to `EXCLUDED_TABLES` with the reason. Report what you changed.

- [ ] **Step 5: Prove the SQL runs against the real schema (rolled back)** — `scripts/delete-check.tmp.mjs`

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { randomUUID } = await import("node:crypto");
const { sql } = await import("drizzle-orm");
const { db } = await import("../src/lib/db/index.ts");
const { users, userSettings, documents } = await import("../src/lib/db/schema.ts");
const { deleteUserData } = await import("../src/lib/account/delete.ts");
const rollback = new Error("ROLLBACK");
try {
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: `delete-check-${randomUUID()}@example.com` }).returning();
    await tx.insert(userSettings).values({ userId: user.id, key: "cefr_level", value: "A2" });
    await tx.insert(documents).values({ id: randomUUID(), userId: user.id, title: "Check", content: "Bonjour.", wordCount: 1 });
    console.log("deleted:", await deleteUserData(user.id, tx));
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from users where id = ${user.id}`);
    console.log("users left:", n);
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("ROLLED BACK");
}
process.exit(0);
```

Run: `node --import tsx scripts/delete-check.tmp.mjs`
Expected:
```
deleted: { user_settings: 1, documents: 1 }
users left: 0
ROLLED BACK
```
(Key order may differ.) Every per-table `DELETE` executed without a foreign-key error. Paste the output.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/lib/account
git commit -m "feat(account): delete a user's owned data"
```

---

### Task 5: One-click guest sign-in

At this point a guest still has **full** access; gating arrives in Tasks 9–12. Nothing deploys until Task 17.

**Files:**
- Create: `src/lib/auth/guest.ts`, `src/lib/auth/guest.test.ts`, `src/components/guest-start-button.tsx`
- Modify: `src/lib/auth/auth.ts`, `src/lib/auth/client.ts`, `src/app/login/page.tsx`, `src/app/demo/page.tsx`, `src/app/(main)/layout.tsx`, `src/components/sidebar.tsx`, `src/app/(main)/account/page.tsx`, `src/components/sign-out-button.tsx`

**Interfaces:**
- Consumes:
  - `GUEST_DAILY_CAP`, `GUEST_SIGNINS_PER_IP_PER_HOUR`, `formatGuestExpiry` (Task 3);
  - `purgeOwnedData` (Task 4).
- Produces:
  - `guestAccessEnabled(env?)` and `rateLimitEnabled(env?)` → `boolean`;
  - `<GuestStartButton {...ButtonProps}>`;
  - `Sidebar` prop `account: { primary: string; secondary: string }`;
  - `SignOutButton` prop `label?: string`;
  - APIError codes `GUEST_DISABLED` and `GUEST_CAPACITY`.

- [ ] **Step 1: Failing test** — `src/lib/auth/guest.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { guestAccessEnabled, rateLimitEnabled } from "./guest";

test("guest access is on unless explicitly disabled", () => {
  assert.equal(guestAccessEnabled({}), true);
  assert.equal(guestAccessEnabled({ GUEST_ACCESS_ENABLED: "true" }), true);
  assert.equal(guestAccessEnabled({ GUEST_ACCESS_ENABLED: "false" }), false);
});

test("rate limiting runs in production, and in development only on request", () => {
  assert.equal(rateLimitEnabled({ NODE_ENV: "production" }), true);
  assert.equal(rateLimitEnabled({ NODE_ENV: "development" }), false);
  assert.equal(rateLimitEnabled({ NODE_ENV: "development", AUTH_RATE_LIMIT_ENABLED: "true" }), true);
});
```

Run: `npm test` → FAIL (module missing).

- [ ] **Step 2: Implement** — `src/lib/auth/guest.ts`

```ts
type Env = { NODE_ENV?: string; GUEST_ACCESS_ENABLED?: string; AUTH_RATE_LIMIT_ENABLED?: string };

/** One-click guests are on unless GUEST_ACCESS_ENABLED is "false". */
export function guestAccessEnabled(env: Env = process.env): boolean {
  return env.GUEST_ACCESS_ENABLED !== "false";
}

/** Better Auth rate limiting: always in production; in development only when testing it. */
export function rateLimitEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" || env.AUTH_RATE_LIMIT_ENABLED === "true";
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: Better Auth server** — edit `src/lib/auth/auth.ts`

Imports:

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import { admin, anonymous, emailOTP } from "better-auth/plugins";
import { purgeOwnedData } from "@/lib/account/delete";
import { GUEST_DAILY_CAP, GUEST_SIGNINS_PER_IP_PER_HOUR } from "@/lib/access/limits";
import { guestAccessEnabled, rateLimitEnabled } from "./guest";
```

Add above `export const auth`:

```ts
/** Guests are capped per UTC day; GUEST_ACCESS_ENABLED=false turns them off. */
async function assertGuestCreationAllowed() {
  if (!guestAccessEnabled()) {
    throw new APIError("FORBIDDEN", { code: "GUEST_DISABLED", message: "The demo is currently unavailable." });
  }
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isAnonymous, true), gte(users.createdAt, since)));
  if (n >= GUEST_DAILY_CAP) {
    throw new APIError("FORBIDDEN", { code: "GUEST_CAPACITY", message: "The demo is at capacity today." });
  }
}
```

Replace the `rateLimit` line:

```ts
  rateLimit: {
    enabled: rateLimitEnabled(),
    storage: "database",
    modelName: "rateLimits",
    customRules: { "/sign-in/anonymous": { window: 3600, max: GUEST_SIGNINS_PER_IP_PER_HOUR } },
  },
```

Replace `databaseHooks`:

```ts
  databaseHooks: {
    user: {
      create: {
        // Backstop for every sign-up path; the provider options above give the friendly errors.
        before: async (user) => {
          if (user.isAnonymous === true) {
            await assertGuestCreationAllowed();
            return { data: user };
          }
          if (!signupOpen) throw new APIError("FORBIDDEN", { message: "Sign-up is currently closed." });
          return { data: user };
        },
      },
      delete: {
        // Owned rows use RESTRICT foreign keys; clear them before Better Auth deletes the user
        // (the anonymous plugin after a guest converts, the admin plugin's removeUser).
        before: async (user) => {
          await purgeOwnedData(user.id);
        },
      },
    },
  },
```

Add the plugin before `nextCookies()`:

```ts
    admin({ roles: { admin: adminAc, member: userAc }, adminRoles: ["admin"], defaultRole: "member" }),
    anonymous({ generateName: () => "Guest" }),
    nextCookies(), // must stay last
```

- [ ] **Step 4: Client** — `src/lib/auth/client.ts`

```ts
import { adminClient, anonymousClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [emailOTPClient(), adminClient(), anonymousClient()] });
```

- [ ] **Step 5: `src/components/guest-start-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

const GUEST_ERRORS: Record<string, string> = {
  GUEST_DISABLED: "The demo is currently unavailable.",
  GUEST_CAPACITY: "The demo is at capacity today. Try the sample question instead.",
};

/** Opens a 7-day guest account with sample data. A signed-in visitor just continues. */
export function GuestStartButton({ children = "Try without signing up", ...props }: ButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const { data: session } = await authClient.getSession();
    // Never replace a real session with a guest one.
    if (session) return window.location.assign("/today");
    const { error } = await authClient.signIn.anonymous();
    if (error) {
      setPending(false);
      return setError(
        error.status === 429
          ? "Too many demo sessions from this network. Try again later."
          : (error.code && GUEST_ERRORS[error.code]) || "Couldn't start the demo. Please try again.",
      );
    }
    // A full load resets account-bound client state.
    window.location.assign("/today");
  }

  return (
    <div className="space-y-2">
      <Button {...props} disabled={pending || props.disabled} onClick={start}>
        {pending ? "Starting the demo…" : children}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Entry points**

In `src/app/login/page.tsx`, import `GuestStartButton` and `guestAccessEnabled`. Inside the `<section>`, after the `user ? … : <LoginForm …/>` block, add:

```tsx
        {!user && guestAccessEnabled() && (
          <div className="mt-6 border-t border-border pt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Just looking around? Open a demo account with sample data — no sign-up, deleted after 7 days.
            </p>
            <GuestStartButton variant="outline" className="w-full" />
          </div>
        )}
```

In `src/app/demo/page.tsx`, in the hero's button row (`<div className="mt-8 flex flex-wrap items-center gap-3">`), add after the "Try one question" button:

```tsx
              {guestAccessEnabled() && (
                <GuestStartButton size="lg" variant="outline" className="h-12 px-6">
                  Try the full app
                </GuestStartButton>
              )}
```

- [ ] **Step 7: Account label in the sidebar**

In `src/app/(main)/layout.tsx`, import `formatGuestExpiry` and pass a precomputed label:

```tsx
  const user = await requirePageUser();
  const account =
    user.access === "guest" && user.guestExpiresAt
      ? { primary: "Guest", secondary: `Expires ${formatGuestExpiry(user.guestExpiresAt)}` }
      : { primary: user.email, secondary: user.access === "admin" ? "Administrator" : "Member" };
  …
        <Sidebar account={account} />
```

In `src/components/sidebar.tsx`, change the signature and the footer:

```tsx
export function Sidebar({ account }: { account: { primary: string; secondary: string } }) {
  …
          <p className="truncate text-xs font-medium" title={account.primary}>{account.primary}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {account.secondary}
          </p>
```

- [ ] **Step 8: Guest view of `/account`**

`src/components/sign-out-button.tsx`: add `label = "Sign out"` to the props (`{ className, label = "Sign out" }: { className?: string; label?: string }`) and render `{label}`.

In `src/app/(main)/account/page.tsx`, right after `const user = await requirePageUser();` and before `listUserAccounts`, add the guest branch. Import `formatGuestExpiry`. Task 8 adds the invite form here.

```tsx
  if (user.access === "guest") {
    return (
      <div className="mx-auto max-w-2xl px-10 py-10">
        <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Account</h1>
        <p className="mb-10 text-sm text-muted-foreground">You're exploring Sundew with a demo account.</p>
        <section className="space-y-5 rounded-2xl bg-surface p-6 shadow-card">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Guest</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This demo account and its sample data are deleted on {formatGuestExpiry(user.guestExpiresAt!)}.
              </p>
            </div>
          </div>
          <SignOutButton label="End demo" />
        </section>
      </div>
    );
  }
```

- [ ] **Step 9: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: pass. If `user.isAnonymous` is untyped in the hook, compare with `=== true` (as written); do not cast.

- [ ] **Step 10: Real run — guest creation**

Use a private window on `http://localhost:3000/login`:
1. Click "Try without signing up". Expect: `/today` loads, and the sidebar footer reads "Guest" / "Expires <date>" (7 days out).
2. Open `/account`. Expect the guest view with "End demo".
3. Check the database with throwaway `scripts/latest-guests.tmp.mjs`:

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
console.log(await sql`select id, name, is_anonymous, role, created_at from users where is_anonymous order by created_at desc limit 5`);
await sql.end();
```

Expect the new row with `name: 'Guest'`, `is_anonymous: true`, `role: 'member'`.

- [ ] **Step 11: Real run — kill switch and rate limit** (heads-up to the owner: `.env.local` edits and dev-server restarts)

1. Set `GUEST_ACCESS_ENABLED=false` and restart. Expect: the button is gone from `/login`. In the browser console:
   ```js
   await fetch("/api/auth/sign-in/anonymous", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(async (r) => [r.status, await r.text()])
   ```
   Expect status 403 with `GUEST_DISABLED` in the body. Remove the variable.
2. Set `AUTH_RATE_LIMIT_ENABLED=true` and restart. In a private window, start a guest and click "End demo"; repeat. Expect the 4th start within the hour to show "Too many demo sessions from this network. Try again later." Remove the variable and restart.

Paste the observed messages.

- [ ] **Step 12: Delete the test guests** — `scripts/delete-test-guests.tmp.mjs`

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { and, eq, gte } = await import("drizzle-orm");
const { db } = await import("../src/lib/db/index.ts");
const { users } = await import("../src/lib/db/schema.ts");
const { deleteUserData } = await import("../src/lib/account/delete.ts");
const since = new Date(Date.now() - 6 * 3600_000);
const guests = await db.select({ id: users.id }).from(users).where(and(eq(users.isAnonymous, true), gte(users.createdAt, since)));
for (const { id } of guests) console.log(id, await deleteUserData(id));
console.log("deleted", guests.length);
process.exit(0);
```

Run it with the owner's OK. Expect one line per test guest. Their tables are empty, so each line shows `{}`.

- [ ] **Step 13: Commit**

```bash
git add src/lib/auth src/components/guest-start-button.tsx src/components/sidebar.tsx src/components/sign-out-button.tsx src/app/login/page.tsx src/app/demo/page.tsx "src/app/(main)/layout.tsx" "src/app/(main)/account/page.tsx"
git commit -m "feat(auth): add one-click guest access"
```

---
### Task 6: Invite codes — core library, actions and sign-up hooks

**Files:**
- Create: `src/lib/invites/code.ts`, `src/lib/invites/code.test.ts`, `src/lib/invites/redeem.ts`, `src/lib/auth/rate-limit.ts`, `src/lib/auth/client-ip.ts`, `src/lib/actions/invites.ts`
- Modify: `src/lib/auth/auth.ts`, `src/lib/auth/signup.ts`, `src/lib/auth/auth-helpers.test.ts`

**Interfaces:**
- Consumes: `INVITE_*` constants (Task 3); `inviteCodes`, `inviteRedemptions` (Task 2).
- Produces:
  - `generateInviteCode(randomBytes: (n: number) => Uint8Array): string`
  - `normalizeInviteCode(input: string): string | null`
  - `type InviteStatus = "active" | "expired" | "used_up" | "revoked"`; `inviteStatus(invite, now): InviteStatus`
  - `type ExpiryChoice = "none" | "7d" | "30d" | { date: string }`; `expiresAtFrom(choice, now): Date | null` (throws on an invalid or past date)
  - `reserveInviteUse(code, dbx?): Promise<string | null>`; `recordRedemption(code, userId, dbx?): Promise<void>`; `mayReceiveSignInCode(email, inviteCookie): Promise<boolean>`
  - `consumeRateLimit(key, windowSeconds, max, now?): Promise<boolean>`; `clientIp(headers: Headers): string`
  - Actions: `checkInviteCode(input): Promise<InviteCheckResult>`, `clearInviteCode(): Promise<void>`, `createInviteCode(input): Promise<CreateInviteResult>`, `listInviteCodes(): Promise<InviteRow[]>`, `revokeInviteCode(id): Promise<void>`
  - APIError codes `SIGNUP_CLOSED`, `INVITE_REQUIRED`, `INVITE_INVALID`

- [ ] **Step 1: Failing tests** — `src/lib/invites/code.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { INVITE_ALPHABET, expiresAtFrom, generateInviteCode, inviteStatus, normalizeInviteCode } from "./code";
import { clientIp } from "../auth/client-ip";

test("generated codes are XXXX-XXXX from the Crockford alphabet", () => {
  const code = generateInviteCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(INVITE_ALPHABET.length, 32);
  assert.ok(!/[ILOU]/.test(INVITE_ALPHABET));
});

test("normalization accepts what people type", () => {
  assert.equal(normalizeInviteCode("ab3d-7k9q"), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode(" ab3d 7k9q "), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode("AB3D7K9Q"), "AB3D-7K9Q");
  assert.equal(normalizeInviteCode("OB1L-I0O0"), "0B11-1000");
  for (const bad of ["", "AB3D-7K9", "AB3D-7K9QX", "AB3D-7K9U", "AB3D_7K9Q"]) assert.equal(normalizeInviteCode(bad), null, bad);
});

test("status: revoked beats expired beats used up", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const base = { maxUses: 2, usedCount: 0, expiresAt: null, revokedAt: null };
  assert.equal(inviteStatus(base, now), "active");
  assert.equal(inviteStatus({ ...base, usedCount: 2 }, now), "used_up");
  assert.equal(inviteStatus({ ...base, usedCount: 2, expiresAt: new Date("2026-10-07T11:00:00Z") }, now), "expired");
  assert.equal(inviteStatus({ ...base, expiresAt: new Date("2026-10-07T11:00:00Z"), revokedAt: now }, now), "revoked");
});

test("expiry choices", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(expiresAtFrom("none", now), null);
  assert.equal(expiresAtFrom("7d", now)?.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(expiresAtFrom("30d", now)?.toISOString(), "2026-11-06T12:00:00.000Z");
  assert.equal(expiresAtFrom({ date: "2026-10-20" }, now)?.toISOString(), "2026-10-20T23:59:59.999Z");
  assert.throws(() => expiresAtFrom({ date: "2026-10-01" }, now), /past/);
  assert.throws(() => expiresAtFrom({ date: "20-10-2026" }, now), /date/);
});

test("client IP comes from the first forwarded hop", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.8" })), "203.0.113.8");
  assert.equal(clientIp(new Headers()), "unknown");
});
```

In `src/lib/auth/auth-helpers.test.ts`, replace the sign-up test:

```ts
test("invite sign-up is on unless the kill switch is set", () => {
  assert.equal(signupEnabled({ NODE_ENV: "production" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "production", AUTH_SIGNUP_ENABLED: "false" }), false);
  assert.equal(signupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development", AUTH_SIGNUP_ENABLED: "false" }), false);
});
```

Run: `npm test` → FAIL (modules missing; production default is still `false`).

- [ ] **Step 2: Pure modules**

`src/lib/invites/code.ts`:

```ts
/** Invite codes: Crockford base32 without I, L, O, U, shown as XXXX-XXXX (~40 bits). Pure. */
export const INVITE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateInviteCode(randomBytes: (n: number) => Uint8Array): string {
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  const chars = Array.from(randomBytes(8), (byte) => INVITE_ALPHABET[byte % 32]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Accepts any case, spaces, a missing dash and O/I/L confusables; null when it cannot be a code. */
export function normalizeInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (raw.length !== 8 || [...raw].some((c) => !INVITE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export type InviteStatus = "active" | "expired" | "used_up" | "revoked";

export function inviteStatus(
  invite: { maxUses: number; usedCount: number; expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt <= now) return "expired";
  if (invite.usedCount >= invite.maxUses) return "used_up";
  return "active";
}

export type ExpiryChoice = "none" | "7d" | "30d" | { date: string };

/** A date choice expires at the end of that UTC day. */
export function expiresAtFrom(choice: ExpiryChoice, now: Date): Date | null {
  if (choice === "none") return null;
  if (choice === "7d" || choice === "30d") return new Date(now.getTime() + (choice === "7d" ? 7 : 30) * 86_400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.date)) throw new Error("Expiry must be a date (YYYY-MM-DD).");
  const end = new Date(`${choice.date}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime())) throw new Error("Expiry must be a date (YYYY-MM-DD).");
  if (end <= now) throw new Error("Expiry is in the past.");
  return end;
}
```

`src/lib/auth/client-ip.ts`:

```ts
/** The caller's IP as Vercel reports it (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
```

`src/lib/auth/signup.ts`:

```ts
/** Emergency switch for invite sign-ups: on unless AUTH_SIGNUP_ENABLED is "false". Codes are still required. */
export function signupEnabled(env: { AUTH_SIGNUP_ENABLED?: string } = process.env): boolean {
  return env.AUTH_SIGNUP_ENABLED !== "false";
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: Server helpers**

`src/lib/auth/rate-limit.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Fixed-window counter for app endpoints Better Auth does not cover, stored in
 * its rate_limits table under an "app:" key. Returns true when allowed.
 */
export async function consumeRateLimit(key: string, windowSeconds: number, max: number, now = Date.now()): Promise<boolean> {
  const windowStart = now - windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `app:${key}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.lastRequest} < ${windowStart} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${rateLimits.lastRequest} < ${windowStart} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= max;
}
```

`src/lib/invites/redeem.ts`:

```ts
/** Invite redemption for Better Auth hooks. Not "use server". */
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCodes, inviteRedemptions, users } from "@/lib/db/schema";
import type { Dbx } from "@/lib/account/delete";
import { inviteStatus, normalizeInviteCode } from "./code";

/** Atomically takes one use of a valid code; returns the invite id, or null. */
export async function reserveInviteUse(input: string, dbx: Dbx = db): Promise<string | null> {
  const code = normalizeInviteCode(input);
  if (!code) return null;
  const [row] = await dbx
    .update(inviteCodes)
    .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
    .where(and(
      eq(inviteCodes.code, code),
      isNull(inviteCodes.revokedAt),
      or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, sql`now()`)),
      lt(inviteCodes.usedCount, inviteCodes.maxUses),
    ))
    .returning({ id: inviteCodes.id });
  return row?.id ?? null;
}

export async function recordRedemption(input: string, userId: string, dbx: Dbx = db): Promise<void> {
  const code = normalizeInviteCode(input);
  if (!code) return;
  const [invite] = await dbx.select({ id: inviteCodes.id }).from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (invite) await dbx.insert(inviteRedemptions).values({ inviteId: invite.id, userId }).onConflictDoNothing();
}

/** Sign-in codes go only to existing accounts, or to a new address holding a valid invite. */
export async function mayReceiveSignInCode(email: string, inviteCookie: string | null): Promise<boolean> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1);
  if (existing) return true;
  const code = inviteCookie ? normalizeInviteCode(inviteCookie) : null;
  if (!code) return false;
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  return Boolean(invite) && inviteStatus(invite, new Date()) === "active";
}
```

- [ ] **Step 4: Server actions** — `src/lib/actions/invites.ts`

```ts
"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCodes, inviteRedemptions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/client-ip";
import { expiresAtFrom, generateInviteCode, inviteStatus, normalizeInviteCode, type ExpiryChoice, type InviteStatus } from "@/lib/invites/code";
import { INVITE_CHECKS_PER_WINDOW, INVITE_CHECK_WINDOW_S, INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S } from "@/lib/access/limits";

export type InviteCheckResult = { status: "ok" } | { status: "invalid" | "rate_limited" | Exclude<InviteStatus, "active"> };

/** Public: validates a code and, when it is usable, remembers it for the sign-up hook. */
export async function checkInviteCode(input: string): Promise<InviteCheckResult> {
  const ip = clientIp(await headers());
  if (!(await consumeRateLimit(`invite-check:${ip}`, INVITE_CHECK_WINDOW_S, INVITE_CHECKS_PER_WINDOW))) {
    return { status: "rate_limited" };
  }
  const code = normalizeInviteCode(input);
  if (!code) return { status: "invalid" };
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  if (!invite) return { status: "invalid" };
  const status = inviteStatus(invite, new Date());
  if (status !== "active") return { status };
  (await cookies()).set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE_S,
  });
  return { status: "ok" };
}

export async function clearInviteCode(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}

export type InviteRow = {
  id: string;
  code: string;
  note: string;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  status: InviteStatus;
  redemptions: Array<{ email: string; redeemedAt: Date }>;
};

export async function listInviteCodes(): Promise<InviteRow[]> {
  await requireAdmin();
  const invites = await db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt));
  const redemptions = invites.length
    ? await db
        .select({ inviteId: inviteRedemptions.inviteId, email: users.email, redeemedAt: inviteRedemptions.redeemedAt })
        .from(inviteRedemptions)
        .innerJoin(users, eq(users.id, inviteRedemptions.userId))
        .where(inArray(inviteRedemptions.inviteId, invites.map((i) => i.id)))
        .orderBy(desc(inviteRedemptions.redeemedAt))
    : [];
  const now = new Date();
  return invites.map((invite) => ({
    id: invite.id,
    code: invite.code,
    note: invite.note,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    status: inviteStatus(invite, now),
    redemptions: redemptions.filter((r) => r.inviteId === invite.id).map(({ email, redeemedAt }) => ({ email, redeemedAt })),
  }));
}

export type CreateInviteResult = { ok: true; code: string } | { ok: false; error: string };

export async function createInviteCode(input: { maxUses: number; expiry: ExpiryChoice; note: string }): Promise<CreateInviteResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 500) {
    return { ok: false, error: "Uses must be a whole number from 1 to 500." };
  }
  const note = input.note.trim();
  if (note.length > 200) return { ok: false, error: "Keep the note under 200 characters." };
  let expiresAt: Date | null;
  try {
    expiresAt = expiresAtFrom(input.expiry, new Date());
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid expiry." };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode((n) => randomBytes(n));
    const inserted = await db
      .insert(inviteCodes)
      .values({ code, maxUses: input.maxUses, expiresAt, note, createdBy: admin.id })
      .onConflictDoNothing({ target: inviteCodes.code })
      .returning({ code: inviteCodes.code });
    if (inserted.length) {
      revalidatePath("/admin/invites");
      return { ok: true, code };
    }
  }
  return { ok: false, error: "Couldn't create a unique code. Try again." };
}

export async function revokeInviteCode(id: string): Promise<void> {
  await requireAdmin();
  await db.update(inviteCodes).set({ revokedAt: new Date() }).where(and(eq(inviteCodes.id, id), isNull(inviteCodes.revokedAt)));
  revalidatePath("/admin/invites");
}
```

- [ ] **Step 5: Better Auth hooks** — edit `src/lib/auth/auth.ts`

Imports:

```ts
import { INVITE_COOKIE } from "@/lib/access/limits";
import { mayReceiveSignInCode, recordRedemption, reserveInviteUse } from "@/lib/invites/redeem";
```

Remove `disableSignUp: !signupOpen,` from **both** `socialProviders.google` and `emailOTP(...)`.

Replace `sendVerificationOTP`:

```ts
      // Without disableSignUp, anyone could request codes for any address; only send to
      // existing accounts or to a new address that holds a valid invite (Resend caps at 100/day).
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        if (type === "sign-in" && !(await mayReceiveSignInCode(email, ctx?.getCookie(INVITE_COOKIE) ?? null))) return;
        await sendOtpEmail({ to: email, otp });
      },
```

Replace the `create` hooks:

```ts
      create: {
        // The single gate for every sign-up path: guests are capped; everyone else needs an invite.
        before: async (user, context) => {
          if (user.isAnonymous === true) {
            await assertGuestCreationAllowed();
            return { data: user };
          }
          if (!signupOpen) {
            throw new APIError("FORBIDDEN", { code: "SIGNUP_CLOSED", message: "Sign-up is currently closed. Existing accounts can sign in." });
          }
          const code = context?.getCookie(INVITE_COOKIE) ?? null;
          if (!code) {
            throw new APIError("FORBIDDEN", { code: "INVITE_REQUIRED", message: "An invite code is required to create an account." });
          }
          if (!(await reserveInviteUse(code))) {
            throw new APIError("FORBIDDEN", { code: "INVITE_INVALID", message: "This invite code is no longer valid." });
          }
          return { data: user };
        },
        after: async (user, context) => {
          if (user.isAnonymous === true) return;
          const code = context?.getCookie(INVITE_COOKIE);
          if (!code) return;
          await recordRedemption(code, user.id);
          // Best effort: the cookie also expires on its own after 10 minutes.
          context?.setCookie(INVITE_COOKIE, "", { maxAge: 0, path: "/" });
        },
      },
```

- [ ] **Step 6: Prove the reservation SQL (rolled back)** — `scripts/invite-check.tmp.mjs`

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { randomUUID } = await import("node:crypto");
const { db } = await import("../src/lib/db/index.ts");
const { users, inviteCodes, inviteRedemptions } = await import("../src/lib/db/schema.ts");
const { reserveInviteUse, recordRedemption } = await import("../src/lib/invites/redeem.ts");
const rollback = new Error("ROLLBACK");
try {
  await db.transaction(async (tx) => {
    const [admin] = await tx.insert(users).values({ email: `invite-check-${randomUUID()}@example.com` }).returning();
    await tx.insert(inviteCodes).values([
      { code: "AAAA-0001", maxUses: 1, createdBy: admin.id },
      { code: "AAAA-0002", maxUses: 5, createdBy: admin.id, expiresAt: new Date(Date.now() - 1000) },
      { code: "AAAA-0003", maxUses: 5, createdBy: admin.id, revokedAt: new Date() },
    ]);
    console.log("first use:", Boolean(await reserveInviteUse("aaaa 0001", tx)));
    console.log("second use:", await reserveInviteUse("AAAA-0001", tx));
    console.log("expired:", await reserveInviteUse("AAAA-0002", tx));
    console.log("revoked:", await reserveInviteUse("AAAA-0003", tx));
    await recordRedemption("AAAA-0001", admin.id, tx);
    console.log("redemptions:", (await tx.select().from(inviteRedemptions)).filter((r) => r.userId === admin.id).length);
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("ROLLED BACK");
}
process.exit(0);
```

Run: `node --import tsx scripts/invite-check.tmp.mjs`
Expected:
```
first use: true
second use: null
expired: null
revoked: null
redemptions: 1
ROLLED BACK
```

- [ ] **Step 7: Typecheck, lint, test, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/lib/invites src/lib/auth src/lib/actions/invites.ts
git commit -m "feat(auth): require an invite code to sign up"
```

---

### Task 7: `/admin/invites`

**Files:**
- Create: `src/app/(main)/admin/invites/page.tsx`, `src/app/(main)/admin/invites/_components/create-invite-form.tsx`, `src/app/(main)/admin/invites/_components/invite-list.tsx`
- Modify: `src/lib/navigation.ts`, `src/components/sidebar.tsx`, `src/app/(main)/layout.tsx`

**Interfaces:**
- Consumes: `listInviteCodes`, `createInviteCode`, `revokeInviteCode`, `InviteRow`, `ExpiryChoice` (Task 6).
- Produces:
  - `ADMIN_NAVIGATION: NavigationItem[]`;
  - `Sidebar` prop `access: Access` (Task 9 adds the locks).

- [ ] **Step 1: Page** — `src/app/(main)/admin/invites/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { listInviteCodes } from "@/lib/actions/invites";
import { CreateInviteForm } from "./_components/create-invite-form";
import { InviteList } from "./_components/invite-list";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await requirePageUser();
  if (user.access !== "admin") notFound();
  const invites = await listInviteCodes();

  return (
    <div className="mx-auto max-w-2xl px-10 py-10">
      <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Invites</h1>
      <p className="mb-10 text-sm text-muted-foreground">Codes that let someone create a full account.</p>
      <section className="rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-sm font-medium">New code</h2>
        <CreateInviteForm />
      </section>
      <section className="mt-6 rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-sm font-medium">All codes</h2>
        <InviteList invites={invites} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: `create-invite-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInviteCode } from "@/lib/actions/invites";
import type { ExpiryChoice } from "@/lib/invites/code";

export function CreateInviteForm() {
  const [maxUses, setMaxUses] = useState("1");
  const [expiry, setExpiry] = useState<"none" | "7d" | "30d" | "date">("none");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCopied(false);
    const choice: ExpiryChoice = expiry === "date" ? { date } : expiry;
    startTransition(async () => {
      const result = await createInviteCode({ maxUses: Number(maxUses), expiry: choice, note });
      if (!result.ok) return setError(result.error);
      setCreated(result.code);
      setNote("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Uses</span>
          <Input type="number" min={1} max={500} required value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Expires</span>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as typeof expiry)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <option value="none">Never</option>
            <option value="7d">In 7 days</option>
            <option value="30d">In 30 days</option>
            <option value="date">On a date…</option>
          </select>
        </label>
      </div>
      {expiry === "date" && <Input type="date" required aria-label="Expiry date" value={date} onChange={(e) => setDate(e.target.value)} />}
      <Input placeholder="Note (who it's for)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create code"}</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {created && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3">
          <span className="font-mono text-lg tracking-wider">{created}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(created);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: `invite-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { revokeInviteCode, type InviteRow } from "@/lib/actions/invites";
import { cn } from "@/lib/utils";

const STATUS_LABEL = { active: "Active", expired: "Expired", used_up: "Used up", revoked: "Revoked" } as const;
const day = (date: Date) => date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

export function InviteList({ invites }: { invites: InviteRow[] }) {
  if (!invites.length) return <p className="text-sm text-muted-foreground">No codes yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {invites.map((invite) => <InviteItem key={invite.id} invite={invite} />)}
    </ul>
  );
}

function InviteItem({ invite }: { invite: InviteRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <li className="py-3.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono tracking-wider">{invite.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invite.note || "No note"} · {invite.usedCount}/{invite.maxUses} used · {invite.expiresAt ? `expires ${day(invite.expiresAt)}` : "no expiry"} · created {day(invite.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", invite.status === "active" ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted-foreground")}>
            {STATUS_LABEL[invite.status]}
          </span>
          {invite.status === "active" && (
            <Dialog>
              <DialogTrigger asChild><Button variant="ghost" size="sm">Revoke</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Revoke {invite.code}?</DialogTitle>
                  <DialogDescription>Nobody can create an account with it afterwards. Existing accounts are not affected.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                  <Button variant="danger" disabled={pending} onClick={() => startTransition(() => revokeInviteCode(invite.id))}>Revoke</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {invite.redemptions.length > 0 && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-xs text-accent hover:underline">
          {open ? "Hide" : "Show"} {invite.redemptions.length} redemption{invite.redemptions.length === 1 ? "" : "s"}
        </button>
      )}
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {invite.redemptions.map((r) => <li key={r.email}>{r.email} · {day(r.redeemedAt)}</li>)}
        </ul>
      )}
    </li>
  );
}
```

Before writing, confirm that `DialogFooter` and `DialogDescription` are exported from `src/components/ui/dialog.tsx` (`grep -n "export" src/components/ui/dialog.tsx`). If either is missing, use the markup that `src/app/(main)/library/_components/delete-document-dialog.tsx` uses.

- [ ] **Step 4: Navigation** — `src/lib/navigation.ts`

Add `Ticket` to the lucide import, then:

```ts
export const ADMIN_NAVIGATION: NavigationItem[] = [
  { href: "/admin/invites", label: "Invites", icon: Ticket, matches: within("/admin") },
];
```

In `src/components/sidebar.tsx`, change the props to `{ account, access }: { account: {...}; access: Access }` (import `type Access` from `@/lib/access/features`). Then:
- desktop: after the `SECONDARY_NAVIGATION` map, add `{access === "admin" && ADMIN_NAVIGATION.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} />)}`;
- mobile: pass `access` to `MobileNavigation` and build its "More" list from `[...SECONDARY_NAVIGATION, ...(access === "admin" ? ADMIN_NAVIGATION : [])]`, including the `moreIsActive` check.

In `src/app/(main)/layout.tsx`: `<Sidebar account={account} access={user.access} />`.

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test` → pass.

- [ ] **Step 6: Real run** (as the owner's admin account on :3000)

1. The sidebar shows "Invites". Open `/admin/invites` and create a code: uses 1, expiry 7 days, note "plan test". Expect the code shown with Copy.
2. The list shows it as Active, `0/1 used`.
3. Create a second code with expiry "on a date" set to yesterday. Expect "Expiry is in the past."
4. Revoke the first code. Expect the status "Revoked" after the dialog closes.
5. In a guest session (`GuestStartButton`), open `/admin/invites`. Expect a 404.
6. Delete the test codes, and that guest, with the owner's OK. The guest goes through `scripts/delete-test-guests.tmp.mjs` from Task 5. The codes:
   ```sql
   delete from invite_codes where note = 'plan test';
   ```

- [ ] **Step 7: Commit**

```bash
git add "src/app/(main)/admin" src/lib/navigation.ts src/components/sidebar.tsx "src/app/(main)/layout.tsx"
git commit -m "feat(admin): create, list and revoke invite codes"
```

---

### Task 8: Invite step on `/login`, and guest → full conversion

**Files:**
- Create: `src/components/invite-code-form.tsx`
- Modify: `src/app/login/page.tsx`, `src/app/login/_components/login-form.tsx`, `src/app/(main)/account/page.tsx`

**Interfaces:**
- Consumes: `checkInviteCode`, `clearInviteCode` (Task 6); `INVITE_COOKIE` (Task 3); the Google `error=` value recorded in Task 1, Step 5.
- Produces: `<InviteCodeForm next?: string />`, which renders a `form#invite` so `/account#invite` links resolve.

- [ ] **Step 1: `src/components/invite-code-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInviteCode, type InviteCheckResult } from "@/lib/actions/invites";

const MESSAGES: Record<Exclude<InviteCheckResult["status"], "ok">, string> = {
  invalid: "That code isn't valid. Check it and try again.",
  expired: "This invite code has expired.",
  used_up: "This invite code has already been used.",
  revoked: "This invite code is no longer valid.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
};

/** Checks a code, then continues to account creation: `next` navigates, otherwise the page refreshes in place. */
export function InviteCodeForm({ next }: { next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await checkInviteCode(code);
    if (result.status !== "ok") {
      setPending(false);
      return setError(MESSAGES[result.status]);
    }
    if (next) window.location.assign(next);
    else router.refresh();
  }

  return (
    <form id="invite" onSubmit={submit} className="scroll-mt-8 space-y-3">
      <label htmlFor="invite-code" className="text-sm font-medium">Have an invite code?</label>
      <Input
        id="invite-code"
        autoComplete="off"
        placeholder="XXXX-XXXX"
        className="font-mono uppercase tracking-wider"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" variant="outline" className="w-full" disabled={pending || code.trim().length < 8}>
        {pending ? "Checking…" : "Use invite code"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Login page modes** — `src/app/login/page.tsx`

Add the imports (`cookies` from `next/headers`, `INVITE_COOKIE`, `InviteCodeForm`), then:

```tsx
  const user = await getCurrentUser();
  const inviteAccepted = Boolean((await cookies()).get(INVITE_COOKIE)?.value);
  // Guests stay on the form: signing in or creating an account converts them.
  const member = user && user.access !== "guest" ? user : null;
```

Render:
- heading: `{inviteAccepted && !member ? "Create your account" : "Welcome to Sundew"}`;
- subtitle: `inviteAccepted && !member ? "Your invite code is ready. Continue with Google or an email code." : "Your French practice, saved to your account."`;
- `member ?` → the existing "Signed in as {member.email}" block;
- otherwise:
  - `<LoginForm mode={inviteAccepted ? "create" : "sign-in"} … />`;
  - then, only when `!inviteAccepted`, `<div className="mt-6 border-t border-border pt-6"><InviteCodeForm /></div>`;
  - then the guest block from Task 5. Keep its `!user` condition, so a guest already on `/login` is not offered a second guest account.

- [ ] **Step 3: LoginForm** — `src/app/login/_components/login-form.tsx`

Add to `MESSAGES` (replace `GOOGLE_ERROR_VALUE` with the exact value recorded in Task 1, Step 5):

```ts
  INVITE_REQUIRED: "An invite code is required to create an account.",
  INVITE_INVALID: "This invite code is no longer valid.",
  SIGNUP_CLOSED: "Sign-up is currently closed. Existing accounts can sign in.",
  GOOGLE_ERROR_VALUE: "An invite code is required to create an account.",
```

Remove the now-unused `signup_disabled` entry. Add the prop `mode: "sign-in" | "create"`. In `"create"` mode, render below the buttons:

```tsx
      {mode === "create" && (
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-accent"
          onClick={async () => {
            await clearInviteCode();
            router.refresh();
          }}
        >
          Use a different invite code
        </button>
      )}
```

(Import `clearInviteCode` and `useRouter`; add `const router = useRouter();`.) Change the `!signupOpen` note to show in both modes. In `"sign-in"` mode, when `signupOpen`, add the line `New here? You'll need an invite code to create an account.` in the same `text-xs leading-5 text-muted-foreground` style.

- [ ] **Step 4: Guest conversion entry on `/account`**

In the guest branch from Task 5, add between the identity row and `SignOutButton`:

```tsx
          <div className="border-t border-border pt-5">
            <p className="mb-3 text-sm text-muted-foreground">
              Got an invite? Create a full account — it starts fresh; the demo data stays behind.
            </p>
            <InviteCodeForm next="/login?callbackURL=%2Ftoday" />
          </div>
```

- [ ] **Step 5: Typecheck, lint, test** → pass.

- [ ] **Step 6: Real run — invite sign-up, conversion, and spec assumption (b)**

In admin `/admin/invites`, create two 1-use codes, A and B, with the note "plan test".

1. **Plain sign-up.** In a private window, open `/login`, enter A. Expect "Create your account". Sign up `plan-a@example.com` by email code (the code is in the dev-server output). Expect `/today`, with the sidebar showing the email and "Member".
2. **Reuse is refused.** In another private window, enter A again. Expect "This invite code has already been used."
3. **No code, no email.** In a private window without a code, request a sign-in code for `plan-nocode@example.com`. Expect the dev-server output to show **no** OTP for that address. Entering any 6 digits fails with "That code isn't right…".
4. **Guest conversion.** In a private window, click "Try without signing up". Note the guest id from `scripts/latest-guests.tmp.mjs`. Go to `/account`, enter B, and sign up `plan-b@example.com`. Expect `/today` as Member.
5. Verify with throwaway `scripts/conversion-check.tmp.mjs`:

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const guestId = process.argv[2];
console.log("guest row:", await sql`select count(*)::int as n from users where id = ${guestId}`);
console.log("members:", await sql`select email, is_anonymous, role from users where email in ('plan-a@example.com', 'plan-b@example.com')`);
console.log("invites:", await sql`select code, used_count, max_uses from invite_codes where note = 'plan test'`);
console.log("redemptions:", await sql`select count(*)::int as n from invite_redemptions r join users u on u.id = r.user_id where u.email in ('plan-a@example.com', 'plan-b@example.com')`);
await sql.end();
```

Run: `node --import tsx scripts/conversion-check.tmp.mjs <guestId>`
Expected:
- `guest row: n 0`;
- two members, both `is_anonymous: false` and `role: member`;
- both invites `used_count 1`;
- `redemptions: n 2`.

If `guest row` is 1, the plugin's delete failed: check the dev-server log for "Failed to clean up anonymous user", and report.
6. **Existing account.** The owner signs in normally with no code. Expect it to work.
7. **Clean up** (owner OK): delete `plan-a`/`plan-b` via `deleteUserData` (adapt `delete-test-guests.tmp.mjs` to select by email), then `delete from invite_codes where note = 'plan test';`. The redemptions are already gone with the users.

Paste the outputs.

- [ ] **Step 7: Commit**

```bash
git add src/components/invite-code-form.tsx src/app/login "src/app/(main)/account/page.tsx"
git commit -m "feat(auth): redeem invite codes at sign-in and convert guests"
```

---
### Task 9: Gate primitives and the locked UI shell

**Files:**
- Create: `src/lib/access/guard.ts`, `src/lib/access/page-gate.tsx`, `src/components/access-context.tsx`, `src/components/feature-locked.tsx`, `src/components/invite-only-note.tsx`
- Modify: `src/lib/auth/session.ts`, `src/lib/navigation.ts`, `src/components/sidebar.tsx`, `src/app/(main)/layout.tsx`, `src/app/tcf/layout.tsx`

**Interfaces:**
- Consumes: `canUse`, `FEATURES`, `FeatureKey`, `Access` (Task 3); `<InviteCodeForm>` (Task 8).
- Produces:
  - `AuthenticationError` code `"FEATURE_LOCKED"`; `authErrorStatus(code): 401 | 403 | 503`
  - `requireFeature(key: FeatureKey): Promise<AuthenticatedUser>` (server)
  - `pageGate(key: FeatureKey): Promise<React.ReactElement | null>` (server)
  - `<AccessProvider access>`, `useAccess(): Access`, `useFeatureLocked(key): boolean` (client)
  - `<FeatureLocked feature>`, `<InviteOnlyNote />`
  - `NavigationItem.feature?: FeatureKey`

- [ ] **Step 1: Error code and status mapping** — `src/lib/auth/session.ts`

```ts
export class AuthenticationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "FEATURE_LOCKED" | "AUTH_MISCONFIGURED";
  …
}

/** HTTP status for route handlers that catch an AuthenticationError. */
export function authErrorStatus(code: AuthenticationError["code"]): 401 | 403 | 503 {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "AUTH_MISCONFIGURED") return 503;
  return 403;
}
```

- [ ] **Step 2: Server guards**

`src/lib/access/guard.ts`:

```ts
import "server-only";

import { AuthenticationError, requireUser, type AuthenticatedUser } from "@/lib/auth/session";
import { canUse, type FeatureKey } from "./features";

/** For actions and route handlers: the user, or FEATURE_LOCKED unless they have full use. */
export async function requireFeature(key: FeatureKey): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (canUse(user.access, key) === true) return user;
  throw new AuthenticationError("FEATURE_LOCKED");
}
```

`src/lib/access/page-gate.tsx`:

```tsx
import "server-only";

import { FeatureLocked } from "@/components/feature-locked";
import { requirePageUser } from "@/lib/auth/session";
import { canUse, type FeatureKey } from "./features";

/** For pages: null when allowed, otherwise the locked view to return instead of the page. */
export async function pageGate(key: FeatureKey): Promise<React.ReactElement | null> {
  const user = await requirePageUser();
  return canUse(user.access, key) === true ? null : <FeatureLocked feature={key} />;
}
```

- [ ] **Step 3: Client access context** — `src/components/access-context.tsx`

```tsx
"use client";

import { createContext, useContext } from "react";
import { canUse, type Access, type FeatureKey } from "@/lib/access/features";

// Defaults to "full": the server enforces access; this only shapes the UI.
const AccessContext = createContext<Access>("full");

export function AccessProvider({ access, children }: { access: Access; children: React.ReactNode }) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  return useContext(AccessContext);
}

/** True when this control should be disabled with an "Invite only" note. */
export function useFeatureLocked(key: FeatureKey): boolean {
  return canUse(useContext(AccessContext), key) !== true;
}
```

Wrap both layouts. In `src/app/(main)/layout.tsx` and `src/app/tcf/layout.tsx`, put `<AccessProvider access={user.access}>` directly inside `<AccountSession userId={user.id}>`, around the existing children.

- [ ] **Step 4: Locked page and inline note**

`src/components/invite-only-note.tsx`:

```tsx
import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function InviteOnlyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
      Invite only —{" "}
      <Link href="/account#invite" className="text-accent hover:underline">have a code?</Link>
    </p>
  );
}
```

`src/components/feature-locked.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { InviteCodeForm } from "@/components/invite-code-form";
import { FEATURES, type FeatureKey } from "@/lib/access/features";

const DESCRIPTIONS: Record<FeatureKey, string> = {
  tcf: "Timed listening and reading questions from the TCF Canada bank, with explanations and a review queue.",
  speaking: "Read-aloud practice with pronunciation scoring, and a timed Task 2 conversation.",
  quiz: "Import your own quizzes and podcast cloze dictations, then drill them.",
  writing: "Write a response and get structured feedback that feeds your error profile.",
  microDrill: "Short drills generated from your own mistakes.",
  upload: "Add your own French texts and read them with look-ups.",
  lookup: "Look up any word in your own texts.",
  enrich: "Full dictionary entries with conjugations and usage notes.",
};

export function FeatureLocked({ feature }: { feature: FeatureKey }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-blue text-accent">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Invite only</p>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.035em]">{FEATURES[feature].label}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{DESCRIPTIONS[feature]}</p>
        {feature === "tcf" && (
          <Link href="/demo#try-demo" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            Try an original sample question
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        <div className="mt-8 border-t border-border pt-6">
          <InviteCodeForm next="/login?callbackURL=%2Ftoday" />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Navigation locks**

In `src/lib/navigation.ts`: add `import type { FeatureKey } from "@/lib/access/features";` and `feature?: FeatureKey;` to `NavigationItem`. Set `feature: "tcf"` on the TCF Canada item.

In `src/components/sidebar.tsx`: import `LockKeyhole` and `canUse`. Give `NavigationLink` a `locked` prop, and render it after the label:

```tsx
      <span>{item.label}</span>
      {locked && <LockKeyhole className="ml-auto h-3.5 w-3.5 text-subtle-foreground" aria-label="Invite only" />}
```

Compute `locked={item.feature ? canUse(access, item.feature) !== true : false}` at each call site, including the mobile "More" dialog.

- [ ] **Step 6: Typecheck, lint, test** → pass. Nothing is gated yet; Task 10 applies the guards.

- [ ] **Step 7: Real run**

As a guest:
- the TCF Canada nav item shows a lock (desktop sidebar and mobile "More" — use `resize_window` mobile, then restore desktop);
- the page still opens, because gating comes in Task 10.

As admin, there is no lock.

- [ ] **Step 8: Commit**

```bash
git add src/lib/access src/lib/auth/session.ts src/components/access-context.tsx src/components/feature-locked.tsx src/components/invite-only-note.tsx src/lib/navigation.ts src/components/sidebar.tsx "src/app/(main)/layout.tsx" src/app/tcf/layout.tsx
git commit -m "feat(access): add feature guards and the locked view"
```

---

### Task 10: Gate the TCF, speaking and quiz areas

**Files:**
- Create: `src/lib/access/guard-coverage.test.ts`
- Modify:
  - actions: `src/lib/actions/{tcf,speaking,speaking-simulation,quiz,cloze,tasks,vocab-gaps,today}.ts`
  - API routes: `src/app/api/speaking/{assess,follow-ups/[followUpId],recordings/[assetId],sessions/[sessionId]/turns}/route.ts`, `src/app/api/media-url/route.ts`
  - pages: the 11 gated pages listed in Step 5, `src/app/(main)/today/page.tsx`, `src/app/(main)/training/page.tsx`

**Interfaces:**
- Consumes: `requireFeature`, `pageGate`, `authErrorStatus`, `canUse` (Task 9).
- Produces: `TodayPlan.skills[].locked: boolean`.

- [ ] **Step 1: Failing coverage test** — `src/lib/access/guard-coverage.test.ts`

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Bodies of exported async functions, keyed by name (each runs to the next export). */
function exportedBodies(file: string): Map<string, string> {
  const source = readFileSync(file, "utf8");
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];
  return new Map(starts.map((m, i) => [m[1], source.slice(m.index, starts[i + 1]?.index ?? source.length)]));
}

const WHOLE_FILES: Array<{ file: string; feature: string; summaryReads?: string[] }> = [
  { file: "src/lib/actions/tcf.ts", feature: "tcf", summaryReads: ["getTcfReviewCount", "listRecentTcfAttempts"] },
  { file: "src/lib/actions/speaking.ts", feature: "speaking" },
  { file: "src/lib/actions/speaking-simulation.ts", feature: "speaking" },
  { file: "src/lib/actions/quiz.ts", feature: "quiz" },
  { file: "src/lib/actions/cloze.ts", feature: "quiz" },
];

for (const { file, feature, summaryReads = [] } of WHOLE_FILES) {
  test(`${file}: every export is gated on ${feature}`, () => {
    const bodies = exportedBodies(file);
    assert.ok(bodies.size > 0, "no exports found");
    for (const [name, body] of bodies) {
      const pattern = summaryReads.includes(name) ? `canUse(user.access, "${feature}")` : `requireFeature("${feature}")`;
      assert.ok(body.includes(pattern), `${name} must call ${pattern}`);
    }
  });
}

/** [file, exported function, feature] — single gated exports inside otherwise open files. */
export const SINGLE_EXPORTS: Array<[string, string, string]> = [
  ["src/lib/actions/tasks.ts", "writeFromTcfPassage", "tcf"],
  ["src/lib/actions/vocab-gaps.ts", "markTcfVocabGap", "tcf"],
];

test("single gated exports", () => {
  for (const [file, name, feature] of SINGLE_EXPORTS) {
    const body = exportedBodies(file).get(name);
    assert.ok(body, `${file} has no export ${name}`);
    assert.ok(body.includes(`requireFeature("${feature}")`), `${name} must call requireFeature("${feature}")`);
  }
});

const GATED_FILES: Array<[string, string]> = [
  ["src/app/api/speaking/assess/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/follow-ups/[followUpId]/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/recordings/[assetId]/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/sessions/[sessionId]/turns/route.ts", `requireFeature("speaking")`],
  ["src/app/tcf/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/drill/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/exam/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/review/page.tsx", `pageGate("tcf")`],
  ["src/app/(main)/quiz/page.tsx", `pageGate("quiz")`],
  ["src/app/(main)/quiz/[setId]/page.tsx", `pageGate("quiz")`],
  ["src/app/(main)/speaking/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/task-2/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/sessions/[sessionId]/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/sessions/[sessionId]/feedback/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/[promptId]/script/page.tsx", `pageGate("speaking")`],
];

test("gated routes and pages call their guard", () => {
  for (const [file, call] of GATED_FILES) assert.ok(readFileSync(file, "utf8").includes(call), `${file} must call ${call}`);
});
```

Run: `npm test` → FAIL (no guards yet).

Before Step 2, re-list the gated pages and routes so the test stays exhaustive:

```bash
find src/app/tcf "src/app/(main)/speaking" "src/app/(main)/quiz" -name page.tsx
find src/app/api/speaking -name route.ts
```

If either finds a file not in `GATED_FILES`, add it there and gate it in Steps 4–5.

- [ ] **Step 2: Whole-file gating**

```bash
sed -i '' 's/requireUser()/requireFeature("tcf")/' src/lib/actions/tcf.ts
sed -i '' 's/requireUser()/requireFeature("speaking")/' src/lib/actions/speaking.ts src/lib/actions/speaking-simulation.ts
sed -i '' 's/requireUser()/requireFeature("quiz")/' src/lib/actions/quiz.ts src/lib/actions/cloze.ts
sed -i '' 's#^import { requireUser } from "@/lib/auth/session";#import { requireFeature } from "@/lib/access/guard";#' src/lib/actions/speaking.ts src/lib/actions/speaking-simulation.ts src/lib/actions/quiz.ts src/lib/actions/cloze.ts
```

In `src/lib/actions/tcf.ts`:
1. Keep `import { requireUser } from "@/lib/auth/session";`.
2. Add `import { requireFeature } from "@/lib/access/guard";` and `import { canUse } from "@/lib/access/features";`.
3. Restore the two summary reads used by `/review` and `/progress`:

```ts
export async function getTcfReviewCount(…) {
  const user = await requireUser();
  // Review (open to guests) shows this count; guests have no TCF history.
  if (canUse(user.access, "tcf") !== true) return 0;
  …
}

export async function listRecentTcfAttempts(limit = 10): Promise<TcfAttempt[]> {
  const user = await requireUser();
  if (canUse(user.access, "tcf") !== true) return [];
  …
}
```

Run: `grep -c 'requireFeature("tcf")' src/lib/actions/tcf.ts`. Expect 15 (17 exports − 2 summary reads).

- [ ] **Step 3: Single exports**

- In `src/lib/actions/tasks.ts` `writeFromTcfPassage`: `const user = await requireUser();` → `const user = await requireFeature("tcf");`, and add the `requireFeature` import.
- In `src/lib/actions/vocab-gaps.ts` `markTcfVocabGap`: the same change, with `requireFeature("tcf")`.

- [ ] **Step 4: Route handlers**

In each of the four speaking routes, replace `requireUser()` with `requireFeature("speaking")`, and replace its status ternary with `authErrorStatus(error.code)`. For example, the turns route:

```ts
import { AuthenticationError, authErrorStatus } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";
…
  try { user = await requireFeature("speaking"); }
  catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Unauthorized" }, { status: authErrorStatus(error.code) });
    throw error;
  }
```

The `assess` route keeps its `{ error: error.code.toLowerCase() }` body; only its status uses `authErrorStatus`. The `user` variable's type annotation becomes `Awaited<ReturnType<typeof requireFeature>>`.

In `src/app/api/media-url/route.ts`, after the path validation and before the queries:

```ts
  const canTcf = canUse(user.access, "tcf") === true;
  const canQuiz = canUse(user.access, "quiz") === true;
  if (!canTcf && !canQuiz) return NextResponse.json({ error: "Invite only." }, { status: 403 });
  const [shared, owned] = await Promise.all([
    canTcf ? db.select(…tcf query unchanged…) : Promise.resolve([]),
    canQuiz ? db.select(…quiz query unchanged…) : Promise.resolve([]),
  ]);
```

- [ ] **Step 5: Pages** — the first lines of each default export

```tsx
  const locked = await pageGate("tcf"); // "quiz" / "speaking" per page
  if (locked) return locked;
```

Apply this to each page:

| Pages | Gate |
|---|---|
| `src/app/tcf/page.tsx`, `drill/page.tsx`, `exam/page.tsx`, `review/page.tsx` | `"tcf"` |
| `src/app/(main)/quiz/page.tsx`, `quiz/[setId]/page.tsx` | `"quiz"` |
| `src/app/(main)/speaking/page.tsx`, `task-2/page.tsx`, `sessions/[sessionId]/page.tsx`, `sessions/[sessionId]/feedback/page.tsx`, `[promptId]/script/page.tsx` | `"speaking"` |

Place the gate before any `await params` / `await searchParams` that is only needed for data, and always before data reads.

- [ ] **Step 6: Today and Training**

`src/lib/actions/today.ts`:
1. Import `canUse`.
2. In `getTodayPlan()`, after `activities` is built:

```ts
  // Guests cannot open TCF drills; never recommend one.
  const available = canUse(user.access, "tcf") === true ? activities : activities.filter((candidate) => !candidate.key.startsWith("tcf-"));
```

3. Use `available` instead of `activities` for `activity` and `alternatives`, with a safe fallback:

```ts
  const activity = available.find((c) => c.key === activeKey) ?? available.find((c) => c.key === recommendedKey) ?? available[0];
  const alternatives = available.filter((candidate) => candidate.key !== activity.key && (!candidate.done || candidate.key === "writing"));
```

4. Add `locked: boolean` to the `skills` type and values:
   - listening → `canUse(user.access, "tcf") !== true`;
   - speaking → `canUse(user.access, "speaking") !== true`;
   - reading and writing → `false`.

`src/app/(main)/today/page.tsx`: in the skills grid, when `skill.locked`, render `<span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><LockKeyhole className="h-3 w-3" aria-hidden="true" />Invite only</span>` under the detail line.

`src/app/(main)/training/page.tsx`:
1. Make the page `async` and read `const user = await requirePageUser();`.
2. Add `feature?: FeatureKey` to the SKILLS entries: Listening `"tcf"`, Speaking `"speaking"`.
3. When `canUse(user.access, skill.feature) !== true`, replace the `note` text with an "Invite only" label (same lock markup), and hide the Reading card's secondary "TCF reading" link.
4. Show the lock icon on the Quiz supporting link when `quiz` is locked.

- [ ] **Step 7: Tests, typecheck, lint** → pass, including `guard-coverage.test.ts`.

- [ ] **Step 8: Real run as a guest** (fresh guest, private window)

1. Visit `/tcf`, `/tcf/drill?skill=listening`, `/tcf/exam?skill=reading&test=1`, `/tcf/review`, `/quiz`, `/speaking`, `/speaking/task-2`. Expect the locked view on each, with the invite form; TCF also shows the `/demo` link.
2. `/today`: no TCF activity among the recommendation or alternatives; Listening and Speaking cards show "Invite only".
3. `/review` and `/progress` load without errors.
4. In the browser console:
   ```js
   await fetch("/api/speaking/assess", { method: "POST" }).then((r) => r.status)
   ```
   Expect `403`.
5. In the browser console:
   ```js
   await fetch("/api/media-url?path=" + encodeURIComponent("/media/x.mp3")).then((r) => r.status)
   ```
   Expect `403`.
6. Check the dev-server log for stack traces.

As admin: `/tcf` drill and review work as before, and the media-url fetch on a real TCF question returns 200.

Paste the observed statuses and a screenshot of one locked page.

- [ ] **Step 9: Commit**

```bash
git add src/lib/access/guard-coverage.test.ts src/lib/actions src/app/api src/app/tcf "src/app/(main)/quiz" "src/app/(main)/speaking" "src/app/(main)/today" "src/app/(main)/training"
git commit -m "feat(access): lock TCF, speaking and quiz for guests"
```

---

### Task 11: Gate AI-triggering actions inside open areas

**Files:**
- Modify:
  - actions: `src/lib/actions/{tasks,errors,documents,vocabulary,vocab-gaps,today}.ts`
  - shared components: `src/components/word-lookup-popover.tsx`, `src/components/micro-drill-dialog.tsx`
  - page components: `src/app/(main)/practice/page.tsx`, `src/app/(main)/practice/_components/{quick-write-button,writing-form}.tsx`, `src/app/(main)/practice/[submissionId]/feedback/_components/feedback-retry.tsx`, `src/app/(main)/progress/_components/top-patterns-action.tsx`, `src/app/(main)/library/_components/add-document-dialog.tsx`, `src/app/(main)/documents/[id]/_components/reader-client.tsx`, `src/app/(main)/vocabulary/_components/vocab-browser.tsx`
  - test: `src/lib/access/guard-coverage.test.ts`

**Interfaces:**
- Consumes: `requireFeature`, `useFeatureLocked`, `<InviteOnlyNote>` (Task 9).
- Produces:
  - `type LookupOutcome = { status: "ok"; lemma: string; surface: string; result: LookupResult; cached: boolean } | { status: "locked"; feature: "lookup" }`;
  - `resolveLookup(...)` now returns `Promise<LookupOutcome>`;
  - `persistLookup(userId, surface, sentenceContext, source, result): Promise<string>` (resolved lemma; module-private);
  - `listRecentSubmissions(limit?): Promise<Array<{ id: string; promptEn: string; submittedAt: Date }>>`.

- [ ] **Step 1: Extend the coverage test** — append to `SINGLE_EXPORTS`

```ts
  ["src/lib/actions/tasks.ts", "generateWritingTask", "writing"],
  ["src/lib/actions/tasks.ts", "practiceFromPattern", "writing"],
  ["src/lib/actions/tasks.ts", "quickWrite", "writing"],
  ["src/lib/actions/tasks.ts", "createSubmission", "writing"],
  ["src/lib/actions/tasks.ts", "regenerateFeedback", "writing"],
  ["src/lib/actions/errors.ts", "createMicroDrill", "microDrill"],
  ["src/lib/actions/errors.ts", "retryMicroDrillFeedback", "microDrill"],
  ["src/lib/actions/documents.ts", "createDocument", "upload"],
  ["src/lib/actions/vocabulary.ts", "enrichEntry", "enrich"],
  ["src/lib/actions/vocabulary.ts", "reexplainInContext", "lookup"],
```

Run: `npm test` → FAIL on these entries.

- [ ] **Step 2: Gate the actions**

In each listed function, replace `const user = await requireUser();` with `const user = await requireFeature("<feature>");`, and add the import where missing. (`requireFeature("lookup")` rejects guests because their rule is `"sample"`, not `true`.)

In `saveVocabularyWord` (`src/lib/actions/vocabulary.ts`), only schedule enrichment when allowed:

```ts
  if (saved.length === 0) return;
  // Guests keep the basic entry; enrichment is a paid AI call.
  if (canUse(user.access, "enrich") !== true) return;
  after(async () => {
```

- [ ] **Step 3: Look-up outcome** — `src/lib/actions/vocabulary.ts`

Extract the cache-miss transaction into a module-private helper, unchanged except that it returns the lemma:

```ts
/** Writes a look-up result for this user: entry, alias, occurrence and recognition gap, atomically. */
async function persistLookup(userId: string, surface: string, sentenceContext: string, source: LookupSource, result: LookupResult): Promise<string> {
  const resolved = norm(result.lemma || surface);
  await db.transaction(async (tx) => {
    await upsertEntry(userId, resolved, surface, result, tx);
    await upsertAlias(userId, norm(surface), resolved, tx);
    await recordOccurrence({
      userId, lemma: resolved, surface, sentenceContext,
      sourceType: source.type,
      documentId: source.type === "reading" ? source.documentId : null,
      tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
    }, tx);
    await upsertGap({ userId, lemma: resolved, gapType: "recognition", source: "lookup", dbx: tx });
  });
  return resolved;
}
```

Change `resolveLookup`:
- its return type becomes `Promise<LookupOutcome>`;
- the cache-hit return becomes `return { status: "ok", lemma, surface, result, cached: true };`;
- the miss path becomes:

```ts
  // Guests never trigger an AI look-up (Task 14 adds the sample entries here).
  if (canUse(user.access, "lookup") !== true) return { status: "locked", feature: "lookup" };

  const result = await lookupWord(surface, sentenceContext);
  const resolved = await persistLookup(user.id, surface, sentenceContext, source, result);
  return { status: "ok", lemma: resolved, surface, result, cached: false };
```

Export `LookupOutcome` from this file.

In `src/lib/actions/vocab-gaps.ts` `markTcfVocabGap`:

```ts
  const outcome = await resolveLookup(input.surface, input.sentenceContext, { type: "tcf", tcfQuestionId: input.tcfQuestionId });
  if (outcome.status !== "ok") throw new AuthenticationError("FEATURE_LOCKED");
  await upsertGap({ userId: user.id, lemma: outcome.lemma, gapType: input.gapType, source: "manual" });
```

- [ ] **Step 4: Popover locked state** — `src/components/word-lookup-popover.tsx`

1. Add `| { phase: "locked"; word: string; x: number; y: number }` to `State`.
2. In `onSelect`:

```ts
          const outcome = await resolveLookup(requested, sel.sentenceContext, source);
          if (outcome.status === "locked") {
            setState((p) => (p.phase !== "hidden" && p.word === requested ? { phase: "locked", word: requested, x, y } : p));
            return;
          }
          const { lemma, result } = outcome;
```

3. Render branch for `locked` (reuse the loading skeleton's header markup):

```tsx
      ) : state.phase === "locked" ? (
        <div className="space-y-3 p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold">{word}</span>
            <button type="button" onClick={() => setState({ phase: "hidden" })} aria-label="Close word lookup" className="shrink-0 rounded-md text-subtle-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-muted-foreground">Look-ups outside the sample texts need an invite code.</p>
          <InviteOnlyNote />
        </div>
```

4. In `LookupCard`, hide the "re-explain" button when `useFeatureLocked("lookup")` is true.

- [ ] **Step 5: Disabled controls** — each uses `const locked = useFeatureLocked("<feature>");`

| Component | Feature | Change |
|---|---|---|
| `quick-write-button.tsx` | `writing` | `disabled={pending \|\| locked}`; when `locked`, render `<InviteOnlyNote />` instead of the hint line |
| `writing-form.tsx` | `writing` | textarea and submit `disabled` when `locked`; `<InviteOnlyNote className="mr-auto" />` left of the submit button |
| `reader-client.tsx` (Generate Writing Task) | `writing` | `disabled={isGenerating \|\| locked}`; note under the title row when locked |
| `feedback-retry.tsx` | `writing` | `disabled={pending \|\| locked}`; note below the button |
| `top-patterns-action.tsx` | `writing` | when locked, render `<InviteOnlyNote />` instead of the button |
| `add-document-dialog.tsx` | `upload` | when locked, render `<div className="flex flex-col items-end gap-1"><Button disabled>…Add Document</Button><InviteOnlyNote /></div>` and no dialog |
| `micro-drill-dialog.tsx` | `microDrill` | Submit and Retry feedback `disabled` when locked; `<InviteOnlyNote />` in the footer's left side |
| `vocab-browser.tsx` (rich-content retry) | `enrich` | when locked, replace the "Generating rich data…" box with `<InviteOnlyNote />` |

`writing-form.tsx`, `quick-write-button.tsx`, `micro-drill-dialog.tsx` and `top-patterns-action.tsx` are client components already. Confirm each file starts with `"use client"` before adding the hook.

- [ ] **Step 6: Today and Practice for guests**

`src/lib/actions/today.ts` `startTodayActivity`:

```ts
  const user = await requireUser();
  const activity = await saveFocus(key);
  // Guests land on /practice, which shows their sample feedback instead of generating a task.
  if (key === "writing" && !activity.done && activity.href === "/practice" && canUse(user.access, "writing") === true) await quickWrite();
  redirect(activity.href);
```

`src/lib/actions/tasks.ts`:

```ts
export async function listRecentSubmissions(limit = 5): Promise<Array<{ id: string; promptEn: string; submittedAt: Date }>> {
  const user = await requireUser();
  return db
    .select({ id: submissions.id, promptEn: writingTasks.promptEn, submittedAt: submissions.submittedAt })
    .from(submissions)
    .innerJoin(writingTasks, eq(writingTasks.id, submissions.taskId))
    .where(eq(submissions.userId, user.id))
    .orderBy(desc(submissions.submittedAt))
    .limit(limit);
}
```

`src/app/(main)/practice/page.tsx`:
1. In the `!taskId` branch, read `const user = await requirePageUser();`.
2. When `user.access === "guest"`, add a "Sample feedback" list under `QuickWriteButton`, using `listRecentSubmissions()`. Each item links to `/practice/${s.id}/feedback`, with the prompt truncated to one line in `text-sm`. Match the page's existing `text-muted-foreground` style.

- [ ] **Step 7: Tests, typecheck, lint** → pass.

- [ ] **Step 8: Real run as a guest**

The guest has no sample data yet: create one document as admin, or wait until Task 15 for the full pass. Check now:
1. `/practice`: "Écrire maintenant" is disabled, with the invite note.
2. `/library`: "Add Document" is disabled, with the note.
3. In a document (open one shared via admin impersonation, or skip until Task 15), clicking a word shows "Look-ups outside the sample texts need an invite code.".
4. `/today` → "Start writing" lands on `/practice` without generating a task, and the dev-server log shows no OpenAI call.

As admin, the same controls work normally: generate one task to confirm (AI ≈ US$0.01; mention it to the owner first).

- [ ] **Step 9: Commit**

```bash
git add src/lib/actions src/components src/app "src/lib/access/guard-coverage.test.ts"
git commit -m "feat(access): lock paid AI actions for guests"
```

---

### Task 12: AI and speech backstop

**Files:**
- Create: `src/lib/access/ai-guard.ts`
- Modify: `src/lib/ai/client.ts`, the 14 call sites listed in Step 3, and `src/lib/speech/azure.ts`

**Interfaces:**
- Produces:
  - `getOpenAI(): Promise<OpenAI>` (was sync);
  - `assertAiAllowed(): Promise<void>`.

- [ ] **Step 1: `src/lib/access/ai-guard.ts`**

```ts
import "server-only";

import { AuthenticationError, getCurrentUser } from "@/lib/auth/session";

/** Last line of defence: a guest request must never reach a paid AI or speech API. */
export async function assertAiAllowed(): Promise<void> {
  const user = await getCurrentUser();
  if (user?.access === "guest") throw new AuthenticationError("FEATURE_LOCKED");
}
```

- [ ] **Step 2: `src/lib/ai/client.ts`**

```ts
/**
 * Create the SDK only when an AI action actually runs. Importing this module
 * during `next build` must not require a production-only API key.
 *
 * Inside the Next.js server (NEXT_RUNTIME is set) every call first checks that
 * the requester is not a guest. Scripts run outside Next and skip the check —
 * they cannot load the server-only session module.
 */
export async function getOpenAI(): Promise<OpenAI> {
  if (process.env.NEXT_RUNTIME) {
    const { assertAiAllowed } = await import("@/lib/access/ai-guard");
    await assertAiAllowed();
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  client ??= new OpenAI({ apiKey });
  return client;
}
```

- [ ] **Step 3: Update every call site** (`getOpenAI().` → `(await getOpenAI()).`)

```bash
grep -rln "getOpenAI()\." src | xargs sed -i '' 's/getOpenAI()\./(await getOpenAI())./g'
grep -rn "getOpenAI()" src
```

Expected afterwards: only the definition in `client.ts` and 14 `(await getOpenAI()).` uses. The files:
- `src/lib/ai/`: `transcribe.ts`, `micro-drill.ts`, `cefr-estimator.ts`, `lookup.ts`, `cloze-select.ts`, `speaking-script.ts`, `feedback.ts`, `quiz-parse.ts`, `enrich.ts`, `task.ts`;
- `src/lib/actions/`: `speaking-simulation.ts`, `settings.ts`;
- `src/lib/speaking/voice.ts` (×2).

Each is already inside an `async` function. `tsc` will flag any that is not.

- [ ] **Step 4: Azure Speech** — `src/lib/speech/azure.ts`

Add `import { assertAiAllowed } from "@/lib/access/ai-guard";`, then make the first line of `assessPronunciation` `await assertAiAllowed();`. Confirm no script imports this file:

```bash
grep -rn "speech/azure" scripts
```

Expected: no matches.

- [ ] **Step 5: Typecheck, lint, test** → pass.

- [ ] **Step 6: Real run — prove the backstop fires** (temporary edits, reverted)

Both earlier layers have to be bypassed on purpose, or the guest never reaches `getOpenAI()`:

1. In `src/lib/actions/tasks.ts` `quickWrite`, temporarily replace `requireFeature("writing")` with `requireUser()`.
2. In `src/lib/actions/today.ts` `startTodayActivity`, temporarily drop the `canUse(user.access, "writing") === true &&` condition.
3. As a guest on `/today`, choose the writing activity and click "Start writing". Expect an error page or toast, `FEATURE_LOCKED` thrown from `getOpenAI` in the dev-server log, and no OpenAI request.
4. Revert: `git checkout src/lib/actions/tasks.ts src/lib/actions/today.ts`. Neither file has a `getOpenAI` call site, so this undoes only the two temporary edits.
5. As admin, generate one writing task. Expect it to work (≈ US$0.01; tell the owner first).

Paste the log line.

- [ ] **Step 7: Commit**

```bash
git add src/lib/access/ai-guard.ts src/lib/ai src/lib/actions/speaking-simulation.ts src/lib/actions/settings.ts src/lib/speaking/voice.ts src/lib/speech/azure.ts
git commit -m "feat(access): block AI and speech calls for guests at the client"
```

---
### Task 13: Sample-workspace format, seeding, export and drift check

**Files:**
- Create:
  - `src/lib/sample-workspace/format.ts`, `src/lib/sample-workspace/format.test.ts`, `src/lib/sample-workspace/seed.ts`
  - `src/lib/sample-workspace/fixtures/workspace.json`, `src/lib/sample-workspace/fixtures/lookups.json` (empty placeholders)
  - `scripts/sample-workspace/export.mts`, `scripts/sample-workspace/check.mts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `OWNED_TABLES`, `Dbx`, `deleteUserData` (Task 4).
- Produces:
  - `type WorkspaceFixture`, `type FixtureRow`
  - `SAMPLE_TABLES: OwnedTable[]`, `FORBIDDEN_TABLE`, `SKIPPED_TABLES`, `POLYMORPHIC_COLUMNS`
  - `columnPlan(table): ColumnPlan[]`
  - `encodeFixture(rowsByTable, shared, exportedAt): WorkspaceFixture`
  - `decodeFixture(fixture, userId, now, newId): { tables: SeedTable[]; unknownKeys: string[] }`
  - `SAMPLE_WORKSPACE: WorkspaceFixture`
  - `seedSampleWorkspace(userId, now?, dbx?, fixture?): Promise<Record<string, number>>`

- [ ] **Step 1: Inventory of undeclared references (read-only; CLAUDE.md rule 1)** — `scripts/inventory.tmp.mjs`

This prints row counts, id-like columns without foreign keys, jsonb key names and attempt types for the owner's real data. It prints **no values**.

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { sql } = await import("drizzle-orm");
const { getTableConfig } = await import("drizzle-orm/pg-core");
const { db } = await import("../src/lib/db/index.ts");
const { OWNED_TABLES } = await import("../src/lib/account/owned-tables.ts");
const OWNER = "00000000-0000-4000-8000-000000000001";
for (const { name, table, scope } of OWNED_TABLES) {
  const config = getTableConfig(table);
  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(table).where(scope(OWNER));
  const fkColumns = new Set(config.foreignKeys.flatMap((fk) => fk.reference().columns.map((c) => c.name)));
  const idLike = config.columns.filter((c) => /_id$/.test(c.name) && c.name !== "user_id" && !fkColumns.has(c.name)).map((c) => c.name);
  const jsonb = {};
  for (const column of config.columns.filter((c) => c.columnType === "PgJsonb")) {
    const rows = await db.execute(sql`select distinct jsonb_typeof(${sql.identifier(column.name)}) as type,
      case when jsonb_typeof(${sql.identifier(column.name)}) = 'object' then (select string_agg(k, ',' order by k) from jsonb_object_keys(${sql.identifier(column.name)}) k) end as keys
      from ${table} where ${scope(OWNER)} limit 10`);
    jsonb[column.name] = rows.map((r) => `${r.type}${r.keys ? `{${r.keys}}` : ""}`);
  }
  console.log(name, JSON.stringify({ rows: n, idLikeWithoutFk: idLike, jsonb }));
}
for (const t of ["review_evidence", "practice_run_items"]) {
  console.log(t, JSON.stringify(await db.execute(sql`select attempt_type, count(*)::int as n from ${sql.identifier(t)} group by 1`)));
}
process.exit(0);
```

Run: `node --import tsx scripts/inventory.tmp.mjs`.

**Show the output to the owner.** Then confirm:
- every `idLikeWithoutFk` column outside `tcf_*`/`speaking_*`/`quiz_*` is either covered by `POLYMORPHIC_COLUMNS` or holds no row reference (for example `request_key`, `rule_id` → shared `rules`);
- no jsonb object key names a row id (`*Id`, `*_id`).

If something is not covered, stop and agree the handling with the owner before Step 3.

- [ ] **Step 2: Failing tests** — `src/lib/sample-workspace/format.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_TABLES, columnPlan, decodeFixture, encodeFixture, type FixtureRow } from "./format";

const plan = (name: string) => {
  const entry = SAMPLE_TABLES.find((t) => t.name === name);
  assert.ok(entry, `${name} is not a sample table`);
  return Object.fromEntries(columnPlan(entry.table).map((c) => [c.key, c]));
};

test("sample tables exclude exam, speaking and quiz content and operational tables", () => {
  const names = SAMPLE_TABLES.map((t) => t.name);
  for (const name of ["documents", "writing_tasks", "submissions", "errors", "user_vocabulary", "user_settings"]) assert.ok(names.includes(name), name);
  assert.ok(!names.some((n) => /^(tcf_|speaking_|quiz_)/.test(n)));
  assert.ok(!names.includes("invite_redemptions") && !names.includes("review_backfill_jobs"));
});

test("column plans classify keys, refs, timestamps and forbidden targets", () => {
  assert.equal(plan("documents").id.kind, "pk");
  assert.equal(plan("documents").userId.kind, "user");
  assert.equal(plan("documents").createdAt.kind, "timestamp");
  assert.equal(plan("documents").title.kind, "plain");
  assert.equal(plan("writing_tasks").documentId.kind, "ref");
  assert.equal(plan("practice_run_items").runId.kind, "ref"); // composite (user_id, run_id) foreign key
  assert.equal(plan("practice_run_items").attemptId.kind, "polymorphic");
  assert.equal(plan("user_settings").key.kind, "plain"); // composite natural key, no ref
  assert.equal(plan("vocabulary_occurrences").tcfQuestionId.forbiddenTarget, "tcf_questions");
});

const at = (iso: string) => new Date(iso);

test("round trip keeps relations, shifts timestamps and swaps the owner", () => {
  const rows = new Map<string, FixtureRow[]>([
    ["documents", [{ id: "d-old", userId: "author", title: "Le marché", content: "Texte.", createdAt: at("2026-10-04T12:00:00Z"), lastReadAt: null }]],
    ["writing_tasks", [{ id: "t-old", userId: "author", documentId: "d-old", promptEn: "Describe the market.", targetWords: ["marché"], targetGrammar: [], createdAt: at("2026-10-05T12:00:00Z") }]],
  ]);
  const fixture = encodeFixture(rows, { vocabularyLookups: [] }, at("2026-10-07T12:00:00Z"));
  assert.equal(fixture.tables.documents[0].id, "documents#1");
  assert.equal(fixture.tables.writing_tasks[0].documentId, "documents#1");
  assert.equal(fixture.tables.documents[0].createdAt, -3 * 86_400_000);
  assert.ok(!("userId" in fixture.tables.documents[0]));

  let n = 0;
  const { tables } = decodeFixture(fixture, "guest-1", at("2026-11-01T00:00:00Z"), () => `new-${++n}`);
  const doc = tables.find((t) => t.name === "documents")!.rows[0];
  const task = tables.find((t) => t.name === "writing_tasks")!.rows[0];
  assert.equal(task.documentId, doc.id);
  assert.equal(doc.userId, "guest-1");
  assert.equal((doc.createdAt as Date).toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(doc.lastReadAt, null);
  assert.deepEqual(task.targetWords, ["marché"]);
  assert.ok(tables.findIndex((t) => t.name === "documents") < tables.findIndex((t) => t.name === "writing_tasks"));
});

test("export refuses exam references and dangling refs", () => {
  const occurrence = { id: "o1", userId: "a", lemma: "x", surface: "x", sentenceContext: "", sourceType: "tcf", documentId: null, tcfQuestionId: "q1", createdAt: new Date() };
  assert.throws(() => encodeFixture(new Map([["vocabulary_occurrences", [occurrence]]]), { vocabularyLookups: [] }, new Date()), /tcf_questions/);
  const task = { id: "t1", userId: "a", documentId: "missing", promptEn: "", targetWords: [], targetGrammar: [], createdAt: new Date() };
  assert.throws(() => encodeFixture(new Map([["writing_tasks", [task]]]), { vocabularyLookups: [] }, new Date()), /no exported target/);
});

test("decode reports fixture keys the schema no longer has", () => {
  const fixture = { version: 1 as const, exportedAt: "2026-10-07T12:00:00.000Z", shared: { vocabularyLookups: [] }, tables: { documents: [{ id: "documents#1", title: "t", content: "c", createdAt: 0, droppedColumn: 1 }] } };
  assert.deepEqual(decodeFixture(fixture, "g", new Date(), () => "id").unknownKeys, ["documents.droppedColumn"]);
});
```

Run: `npm test` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/sample-workspace/format.ts`

```ts
/**
 * Sample-workspace fixture format. Rows are keyed by Drizzle property names.
 * Timestamp columns hold an offset in milliseconds from export time; primary keys
 * and references to owned rows hold symbolic refs ("documents#3"); user_id is
 * omitted. Pure: no database access.
 */
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { OWNED_TABLES } from "@/lib/account/owned-tables";

export type FixtureRow = Record<string, unknown>;

export type WorkspaceFixture = {
  version: 1;
  exportedAt: string;
  shared: { vocabularyLookups: Array<{ lemma: string; surface: string }> };
  /** Keyed by SQL table name. */
  tables: Record<string, FixtureRow[]>;
};

/** Owned tables that never enter the sample: copyrighted exam content and paid features. */
export const FORBIDDEN_TABLE = /^(tcf_|speaking_|quiz_)/;
/** Owned tables the sample skips: operational state, not learning data. */
export const SKIPPED_TABLES = new Set(["invite_redemptions", "review_backfill_jobs"]);
/** References to another owned row without a declared foreign key (see Task 13 Step 1). */
export const POLYMORPHIC_COLUMNS: Record<string, string> = {
  review_evidence: "attemptId",
  practice_run_items: "attemptId",
};

export type ColumnKind = "pk" | "ref" | "polymorphic" | "timestamp" | "user" | "plain";
export type ColumnPlan = { key: string; kind: ColumnKind; forbiddenTarget?: string };
export type SeedTable = { name: string; table: PgTable; rows: Record<string, unknown>[] };

/** Owned tables that may appear in a fixture, parents first. */
export const SAMPLE_TABLES = OWNED_TABLES.filter((t) => !FORBIDDEN_TABLE.test(t.name) && !SKIPPED_TABLES.has(t.name));
const OWNED_NAMES = new Set(OWNED_TABLES.map((t) => t.name));

export function columnPlan(table: PgTable): ColumnPlan[] {
  const config = getTableConfig(table);
  const keyOf = new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]));
  const refs = new Set<string>();
  const forbidden = new Map<string, string>();
  for (const fk of config.foreignKeys) {
    const reference = fk.reference();
    const parent = getTableConfig(reference.foreignTable);
    const parentPk = parent.columns.filter((c) => c.primary);
    reference.columns.forEach((column, i) => {
      if (column.name === "user_id") return;
      if (FORBIDDEN_TABLE.test(parent.name)) forbidden.set(column.name, parent.name);
      else if (OWNED_NAMES.has(parent.name) && parentPk.length === 1 && reference.foreignColumns[i].name === parentPk[0].name) refs.add(column.name);
    });
  }
  const singlePk = config.columns.filter((c) => c.primary).length === 1;
  return config.columns.map((column): ColumnPlan => {
    const key = keyOf.get(column.name)!;
    if (column.name === "user_id") return { key, kind: "user" };
    if (forbidden.has(column.name)) return { key, kind: "plain", forbiddenTarget: forbidden.get(column.name) };
    if (refs.has(column.name)) return { key, kind: "ref" };
    if (singlePk && column.primary) return { key, kind: "pk" };
    if (POLYMORPHIC_COLUMNS[config.name] === key) return { key, kind: "polymorphic" };
    if (column.columnType.startsWith("PgTimestamp")) return { key, kind: "timestamp" };
    return { key, kind: "plain" };
  });
}

const isRef = (kind: ColumnKind) => kind === "pk" || kind === "ref" || kind === "polymorphic";

/** Export side: raw Drizzle rows per sample table → fixture. Ids are globally unique strings. */
export function encodeFixture(rowsByTable: Map<string, FixtureRow[]>, shared: WorkspaceFixture["shared"], exportedAt: Date): WorkspaceFixture {
  const refOf = new Map<string, string>();
  for (const { name, table } of SAMPLE_TABLES) {
    const pk = columnPlan(table).find((c) => c.kind === "pk");
    if (pk) (rowsByTable.get(name) ?? []).forEach((row, i) => refOf.set(String(row[pk.key]), `${name}#${i + 1}`));
  }
  const tables: Record<string, FixtureRow[]> = {};
  for (const { name, table } of SAMPLE_TABLES) {
    const rows = rowsByTable.get(name) ?? [];
    if (!rows.length) continue;
    const plan = columnPlan(table);
    tables[name] = rows.map((row) => {
      const out: FixtureRow = {};
      for (const column of plan) {
        if (column.kind === "user") continue;
        const value = row[column.key];
        if (column.forbiddenTarget && value != null) {
          throw new Error(`${name}.${column.key} points at ${column.forbiddenTarget}; the sample must not reference exam or quiz content`);
        }
        if (value == null) out[column.key] = null;
        else if (isRef(column.kind)) {
          const ref = refOf.get(String(value));
          if (!ref) throw new Error(`${name}.${column.key} = ${String(value)} has no exported target`);
          out[column.key] = ref;
        } else if (column.kind === "timestamp") out[column.key] = (value as Date).getTime() - exportedAt.getTime();
        else out[column.key] = value;
      }
      return out;
    });
  }
  return { version: 1, exportedAt: exportedAt.toISOString(), shared, tables };
}

/** Seed side: fresh ids, timestamps shifted to `now`, the new owner. Parents first. */
export function decodeFixture(fixture: WorkspaceFixture, userId: string, now: Date, newId: () => string): { tables: SeedTable[]; unknownKeys: string[] } {
  const plans = new Map(SAMPLE_TABLES.map((t) => [t.name, columnPlan(t.table)]));
  for (const name of Object.keys(fixture.tables)) if (!plans.has(name)) throw new Error(`Fixture table ${name} is not a sample table`);
  const idOf = new Map<string, string>();
  for (const { name } of SAMPLE_TABLES) {
    const pk = plans.get(name)!.find((c) => c.kind === "pk");
    if (pk) for (const row of fixture.tables[name] ?? []) idOf.set(String(row[pk.key]), newId());
  }
  const unknownKeys: string[] = [];
  const tables = SAMPLE_TABLES.filter((t) => fixture.tables[t.name]?.length).map(({ name, table }) => {
    const plan = plans.get(name)!;
    const known = new Set(plan.map((c) => c.key));
    for (const key of Object.keys(fixture.tables[name][0])) if (!known.has(key)) unknownKeys.push(`${name}.${key}`);
    const rows = fixture.tables[name].map((row) => {
      const out: Record<string, unknown> = {};
      for (const column of plan) {
        if (column.kind === "user") { out[column.key] = userId; continue; }
        if (!(column.key in row)) continue; // added after the export: the column default applies
        const value = row[column.key];
        if (value == null) out[column.key] = null;
        else if (isRef(column.kind)) {
          const id = idOf.get(String(value));
          if (!id) throw new Error(`${name}.${column.key}: unknown ref ${String(value)}`);
          out[column.key] = id;
        } else if (column.kind === "timestamp") out[column.key] = new Date(now.getTime() + Number(value));
        else out[column.key] = value;
      }
      return out;
    });
    return { name, table, rows };
  });
  return { tables, unknownKeys };
}
```

Placeholders (replaced in Task 15):

`src/lib/sample-workspace/fixtures/workspace.json`:
```json
{
  "version": 1,
  "exportedAt": "1970-01-01T00:00:00.000Z",
  "shared": { "vocabularyLookups": [] },
  "tables": {}
}
```

`src/lib/sample-workspace/fixtures/lookups.json`:
```json
{}
```

`src/lib/sample-workspace/seed.ts`:

```ts
/** Copies the reviewed sample workspace into a new guest's account. Not "use server". */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { vocabularyLookups } from "@/lib/db/schema";
import type { Dbx } from "@/lib/account/delete";
import { decodeFixture, type WorkspaceFixture } from "./format";
import bundled from "./fixtures/workspace.json";

export const SAMPLE_WORKSPACE = bundled as unknown as WorkspaceFixture;

/** One transaction; returns rows inserted per table. */
export async function seedSampleWorkspace(userId: string, now = new Date(), dbx: Dbx = db, fixture = SAMPLE_WORKSPACE): Promise<Record<string, number>> {
  const run = async (tx: Dbx) => {
    // user_vocabulary, occurrences and gaps reference the shared lemma table.
    const lemmas = fixture.shared.vocabularyLookups;
    if (lemmas.length) {
      await tx
        .insert(vocabularyLookups)
        .values(lemmas.map(({ lemma, surface }) => ({ id: randomUUID(), lemma, surface })))
        .onConflictDoNothing({ target: vocabularyLookups.lemma });
    }
    const counts: Record<string, number> = {};
    for (const { name, table, rows } of decodeFixture(fixture, userId, now, randomUUID).tables) {
      await tx.insert(table).values(rows as never);
      counts[name] = rows.length;
    }
    return counts;
  };
  return dbx === db ? db.transaction(run) : run(dbx);
}
```

Run: `npm test` → PASS.

- [ ] **Step 4: Export script** — `scripts/sample-workspace/export.mts`

```ts
/**
 * Exports the sample author's account to src/lib/sample-workspace/fixtures/workspace.json.
 *   npm run sample:export -- --email <sample author email>
 * Read-only. Aborts on exam, speaking or quiz data, or on any email address in the output.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const emailIndex = process.argv.indexOf("--email");
const email = emailIndex > -1 ? process.argv[emailIndex + 1] : undefined;
assert(email && !email.startsWith("--"), "Pass --email <sample author email>");

const { and, eq, inArray, sql } = await import("drizzle-orm");
const { db } = await import("../../src/lib/db");
const { users, vocabularyLookups } = await import("../../src/lib/db/schema");
const { OWNED_TABLES } = await import("../../src/lib/account/owned-tables");
const { FORBIDDEN_TABLE, SKIPPED_TABLES, encodeFixture } = await import("../../src/lib/sample-workspace/format");

const [author] = await db
  .select({ id: users.id })
  .from(users)
  .where(and(eq(sql`lower(${users.email})`, email.toLowerCase()), eq(users.isAnonymous, false)));
assert(author, `No account for ${email}`);

const rowsByTable = new Map<string, Record<string, unknown>[]>();
const blocked: string[] = [];
for (const { name, table, scope } of OWNED_TABLES) {
  const rows = await db.select().from(table).where(scope(author.id));
  if (FORBIDDEN_TABLE.test(name)) {
    if (rows.length) blocked.push(`${name}: ${rows.length}`);
  } else if (!SKIPPED_TABLES.has(name)) rowsByTable.set(name, rows);
}
assert(!blocked.length, `The sample author has exam, speaking or quiz data (${blocked.join(", ")}). Use a clean account.`);

const lemmaTables = ["user_vocabulary", "user_vocabulary_aliases", "vocabulary_occurrences", "vocabulary_gaps"];
const lemmas = [...new Set(lemmaTables.flatMap((name) => (rowsByTable.get(name) ?? []).map((row) => String(row.lemma))))];
const shared = {
  vocabularyLookups: lemmas.length
    ? await db.select({ lemma: vocabularyLookups.lemma, surface: vocabularyLookups.surface }).from(vocabularyLookups).where(inArray(vocabularyLookups.lemma, lemmas))
    : [],
};

const fixture = encodeFixture(rowsByTable, shared, new Date());
const text = JSON.stringify(fixture, null, 2) + "\n";
const leaked = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
assert(!leaked, `The export contains an email address (${leaked?.[0]}); remove it from the author's data first.`);

await writeFile(path.join(process.cwd(), "src/lib/sample-workspace/fixtures/workspace.json"), text);
console.table(Object.fromEntries(Object.entries(fixture.tables).map(([name, rows]) => [name, rows.length])));
console.log(`shared lemmas: ${shared.vocabularyLookups.length}`);
process.exit(0);
```

- [ ] **Step 5: Drift check script** — `scripts/sample-workspace/check.mts`

```ts
/**
 * Seeds the bundled sample workspace into a throwaway user, deletes it again,
 * and rolls everything back. Run after every migration and before deploying.
 *   npm run sample:check
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const { sql } = await import("drizzle-orm");
const { db } = await import("../../src/lib/db");
const { users } = await import("../../src/lib/db/schema");
const { OWNED_TABLES } = await import("../../src/lib/account/owned-tables");
const { deleteUserData } = await import("../../src/lib/account/delete");
const { decodeFixture } = await import("../../src/lib/sample-workspace/format");
const { SAMPLE_WORKSPACE, seedSampleWorkspace } = await import("../../src/lib/sample-workspace/seed");

const { unknownKeys } = decodeFixture(SAMPLE_WORKSPACE, "check", new Date(), randomUUID);
if (unknownKeys.length) console.warn("Fixture keys the schema no longer has (ignored):", unknownKeys.join(", "));
const expected = Object.fromEntries(Object.entries(SAMPLE_WORKSPACE.tables).map(([name, rows]) => [name, rows.length]));

const rollback = new Error("ROLLBACK");
try {
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: `sample-check-${randomUUID()}@example.com`, name: "Guest", isAnonymous: true }).returning();
    const seeded = await seedSampleWorkspace(user.id, new Date(), tx);
    console.log("seeded:");
    console.table(seeded);
    assert.deepEqual(seeded, expected, "seeded counts differ from the fixture");
    console.log("deleted:", await deleteUserData(user.id, tx));
    for (const { name, table, scope } of OWNED_TABLES) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(table).where(scope(user.id));
      assert.equal(n, 0, `${name} still has rows after deletion`);
    }
    console.log("seed → delete: OK");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("ROLLED BACK");
}
process.exit(0);
```

`package.json` scripts:

```json
    "sample:draft": "node --import tsx scripts/sample-workspace/draft.mts",
    "sample:export": "node --import tsx scripts/sample-workspace/export.mts",
    "sample:lookups": "node --import tsx scripts/sample-workspace/lookups.mts",
    "sample:check": "node --import tsx scripts/sample-workspace/check.mts",
```

(`draft.mts` and `lookups.mts` arrive in Task 14.)

- [ ] **Step 6: Run the drift check on the empty fixture**

Run: `npm run sample:check`
Expected:
```
seeded:
┌─────────┐
│ (index) │
└─────────┘
deleted: {}
seed → delete: OK
ROLLED BACK
```

The real run with data happens in Task 15.

- [ ] **Step 7: Typecheck, lint, test, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/lib/sample-workspace scripts/sample-workspace package.json
git commit -m "feat(sample): seed and export the sample workspace"
```

---

### Task 14: Sample-only look-ups and the authoring scripts

**Files:**
- Create: `src/lib/sample-workspace/lookups.ts`, `src/lib/sample-workspace/lookups.test.ts`, `scripts/sample-workspace/lookups.mts`, `scripts/sample-workspace/draft.mts`
- Modify: `src/lib/actions/vocabulary.ts`

**Interfaces:**
- Consumes: `persistLookup`, `LookupOutcome` (Task 11); `fixtures/lookups.json` (Task 13).
- Produces:
  - `sampleLookupKey(text): string`;
  - `tokenizeForLookups(text): Array<{ key: string; surface: string; context: string }>`.

- [ ] **Step 1: Failing tests** — `src/lib/sample-workspace/lookups.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { sampleLookupKey, tokenizeForLookups } from "./lookups";

test("keys normalize what a reader selects", () => {
  assert.equal(sampleLookupKey("L'École,"), "école");
  assert.equal(sampleLookupKey("« marché »"), "marché");
  assert.equal(sampleLookupKey("aujourd'hui"), "aujourd'hui");
  assert.equal(sampleLookupKey("Qu’il"), "il");
  assert.equal(sampleLookupKey("peut-être."), "peut-être");
});

test("the tokenizer yields distinct keys with the surface and its paragraph", () => {
  const items = tokenizeForLookups("Le marché ouvre à 8 h.\n\nL'école est près du marché.");
  assert.deepEqual(items.map((i) => i.key), ["le", "marché", "ouvre", "école", "est", "près", "du"]);
  const ecole = items.find((i) => i.key === "école")!;
  assert.equal(ecole.surface, "école");
  assert.equal(ecole.context, "L'école est près du marché.");
});
```

Run: `npm test` → FAIL.

- [ ] **Step 2: Implement** — `src/lib/sample-workspace/lookups.ts`

```ts
/** Keys for the guests' pre-generated look-ups (spec §9.4). Pure. */
const EDGE_PUNCTUATION = /^[\s«»"“”'’()\[\].,;:!?…–—-]+|[\s«»"“”'’()\[\].,;:!?…–—-]+$/g;
const ELISION = /^(?:qu|jusqu|lorsqu|puisqu|[cdjlmnst])['’]/i;

/** What a selection is matched by: lowercase NFC, edge punctuation stripped, French elision removed. */
export function sampleLookupKey(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(EDGE_PUNCTUATION, "").replace(ELISION, "");
}

/** Every distinct key in a text, with its first surface form and that paragraph as context (as the reader sends it). */
export function tokenizeForLookups(text: string): Array<{ key: string; surface: string; context: string }> {
  const seen = new Map<string, { key: string; surface: string; context: string }>();
  for (const paragraph of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    for (const token of paragraph.split(/\s+/)) {
      const surface = token.normalize("NFC").replace(EDGE_PUNCTUATION, "").replace(ELISION, "");
      const key = sampleLookupKey(surface);
      if (key.length < 2 || /\d/.test(key) || seen.has(key)) continue;
      seen.set(key, { key, surface, context: paragraph });
    }
  }
  return [...seen.values()];
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: Guest fallback in `resolveLookup`** — `src/lib/actions/vocabulary.ts`

Imports (module scope, not exported — this is a `"use server"` file):

```ts
import sampleLookups from "@/lib/sample-workspace/fixtures/lookups.json";
import { sampleLookupKey } from "@/lib/sample-workspace/lookups";

const SAMPLE_LOOKUPS = sampleLookups as Record<string, LookupResult>;
```

Replace the guest line from Task 11:

```ts
  const rule = canUse(user.access, "lookup");
  if (rule !== true) {
    // Guests: pre-generated entries for the sample texts only — never an AI call.
    const sample = rule === "sample" ? SAMPLE_LOOKUPS[sampleLookupKey(surface)] : undefined;
    if (!sample) return { status: "locked", feature: "lookup" };
    const resolved = await persistLookup(user.id, surface, sentenceContext, source, sample);
    return { status: "ok", lemma: resolved, surface, result: sample, cached: true };
  }
```

- [ ] **Step 4: Look-up generation script** — `scripts/sample-workspace/lookups.mts`

```ts
/**
 * Pre-generates look-up entries for every word in the sample texts, so guests
 * can look words up without an AI call. Resumable: writes every 25 entries.
 *   npm run sample:lookups            # dry run: counts and cost estimate
 *   npm run sample:lookups -- --yes   # generate with gpt-4o-mini (≈ US$0.00015 per word)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const { tokenizeForLookups } = await import("../../src/lib/sample-workspace/lookups");

const dir = path.join(process.cwd(), "src/lib/sample-workspace/fixtures");
const outFile = path.join(dir, "lookups.json");
const workspace = JSON.parse(await readFile(path.join(dir, "workspace.json"), "utf8"));
const entries: Record<string, unknown> = JSON.parse(await readFile(outFile, "utf8"));
const documents = (workspace.tables.documents ?? []) as Array<{ content: string }>;
if (!documents.length) throw new Error("workspace.json has no documents; run sample:export first");

const items = new Map(documents.flatMap((d) => tokenizeForLookups(d.content)).map((item) => [item.key, item]));
const missing = [...items.values()].filter((item) => !(item.key in entries));
console.log(`${items.size} distinct words, ${missing.length} without an entry; estimated cost ≈ US$${(missing.length * 0.00015).toFixed(2)}`);
if (!process.argv.includes("--yes")) {
  console.log("Dry run. Re-run with --yes to generate.");
  process.exit(0);
}

const { lookupWord } = await import("../../src/lib/ai/lookup");
const sorted = () => Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
let succeeded = 0;
const failed: string[] = [];
for (const [i, item] of missing.entries()) {
  try {
    entries[item.key] = await lookupWord(item.surface, item.context);
    succeeded += 1;
  } catch (error) {
    failed.push(`${item.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if ((i + 1) % 25 === 0 || i === missing.length - 1) {
    await writeFile(outFile, JSON.stringify(sorted(), null, 2) + "\n");
    console.log(`${i + 1}/${missing.length}`);
  }
}
console.log(JSON.stringify({ processed: missing.length, succeeded, failed: failed.length }));
for (const line of failed) console.log("  failed", line);
process.exit(0);
```

- [ ] **Step 5: Draft script** — `scripts/sample-workspace/draft.mts`

```ts
/**
 * Drafts the sample workspace's texts and learner essays with one gpt-4o call (≈ US$0.03).
 *   npm run sample:draft -- --yes
 * Writes src/lib/sample-workspace/source/text-{1,2,3}.md and essay-{1,2}.md for the owner to edit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.argv.includes("--yes")) {
  console.log("Calls gpt-4o once (≈ US$0.03). Re-run with --yes.");
  process.exit(0);
}

const { z } = await import("zod");
const { zodResponseFormat } = await import("openai/helpers/zod");
const { getOpenAI, MODELS } = await import("../../src/lib/ai/client");

// No min/max array lengths: structured outputs reject them. Counts are checked below.
const Draft = z.object({
  texts: z.array(z.object({ title: z.string(), paragraphs: z.array(z.string()) })),
  essays: z.array(z.object({ aboutText: z.number(), text: z.string() })),
});

const completion = await (await getOpenAI()).chat.completions.parse({
  model: MODELS.task,
  temperature: 0.8,
  response_format: zodResponseFormat(Draft, "draft"),
  messages: [
    { role: "system", content: "You write original French learning material. Never reproduce published text." },
    {
      role: "user",
      content: `Write exactly three original French texts for A2–B1 learners about everyday life in Montréal (for example: a neighbourhood market in autumn, taking the métro in winter, a weekend on Mont-Royal). Each text has a title and 3–4 paragraphs, 220–300 words in total, using the present and the passé composé and a few useful everyday expressions.

Then write exactly two short learner essays (90–130 words each): the first responds to text 1, the second to text 2. Write them as an A2–B1 learner would: mostly understandable, with 6–8 natural mistakes spread across agreement, verb conjugation, prepositions, articles and word order. Do not mark the mistakes.`,
    },
  ],
});

const draft = completion.choices[0].message.parsed;
if (!draft || draft.texts.length !== 3 || draft.essays.length !== 2) throw new Error("Unexpected draft shape; re-run.");
const dir = path.join(process.cwd(), "src/lib/sample-workspace/source");
await mkdir(dir, { recursive: true });
for (const [i, text] of draft.texts.entries()) {
  await writeFile(path.join(dir, `text-${i + 1}.md`), `# ${text.title}\n\n${text.paragraphs.join("\n\n")}\n`);
}
for (const [i, essay] of draft.essays.entries()) {
  await writeFile(path.join(dir, `essay-${i + 1}.md`), `<!-- Learner essay responding to text ${essay.aboutText}. The mistakes are intentional. -->\n\n${essay.text}\n`);
}
console.log(`Wrote 3 texts and 2 essays to ${path.relative(process.cwd(), dir)}`);
process.exit(0);
```

- [ ] **Step 6: Dry runs (no spend)**

- `npm run sample:draft` → prints the cost line and exits.
- `npm run sample:lookups` → throws "workspace.json has no documents…" (expected before Task 15).

- [ ] **Step 7: Typecheck, lint, test, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/lib/sample-workspace src/lib/actions/vocabulary.ts scripts/sample-workspace
git commit -m "feat(sample): serve pre-generated look-ups to guests"
```

---

### Task 15: Produce the sample workspace and seed it into new guests (owner in the loop)

Paid steps: draft ≈ US$0.03, app usage ≈ US$0.07, look-ups ≈ US$0.07. Ask for the OK before each.

**Files:**
- Create: `src/lib/sample-workspace/source/*.md`; fill `src/lib/sample-workspace/fixtures/workspace.json` and `lookups.json`
- Modify: `src/lib/auth/auth.ts`, `docs/demo-content-sources.md`

- [ ] **Step 1: Draft (owner OK, ≈ US$0.03)**

Run: `npm run sample:draft -- --yes`
Expected: `Wrote 3 texts and 2 essays to src/lib/sample-workspace/source`.

Ask the owner to read and edit the five files. **Wait** for "done".

- [ ] **Step 2: Create the sample author**

1. The owner creates a 1-use invite with the note "sample author" on `/admin/invites`.
2. In the built-in browser at `http://localhost:3000/login`, enter the code and sign up `sample-author@example.com` by email code (the code is in the dev-server output). This account stays in the database for future re-exports.

- [ ] **Step 3: Use the app as the author (owner OK, ≈ US$0.07)**

As `sample-author@example.com`. **Do not open** `/tcf`, `/quiz` or `/speaking`: the exporter refuses exam, quiz and speaking data.

1. Settings: CEFR **A2**; study goal → learning mode **General** (not TCF).
2. Library → Add Document three times: each text's title, type `other`, source "Sundew sample", and the paragraphs as content.
3. Open each document. Select and save about 5 words per text (15 in total).
4. On text 1, "Generate Writing Task" → paste `essay-1.md` (without the comment line) → Submit for Feedback. Repeat for text 2 with `essay-2.md`. Wait for both feedback pages.
5. On one feedback page, open one error's micro-drill and submit one answer.
6. `/conjugation`: answer 10 items, a few wrong.
7. `/vocabulary/review`: review any due cards.

- [ ] **Step 4: Export**

Run: `npm run sample:export -- --email sample-author@example.com`
Expected: a table with non-zero counts for at least `documents` (3), `reading_sessions`, `writing_tasks` (2), `submissions` (2), `errors`, `micro_drills` (1), `user_vocabulary`, `vocabulary_occurrences`, `conjugation_attempts` (10), `user_settings`, then `shared lemmas: N`.

If it aborts, report the message. Do not work around it.

- [ ] **Step 5: Look-ups (owner OK)**

1. Run: `npm run sample:lookups`. Expect a dry-run line like `≈ 450 distinct words … ≈ US$0.07`. Show it to the owner.
2. After the OK, run `npm run sample:lookups -- --yes`. Expect it to end with `{"processed":N,"succeeded":N,"failed":0}`.
3. Re-run to retry any failures (it is resumable).

- [ ] **Step 6: Drift check with real data**

Run: `npm run sample:check`
Expected: `seeded` equals the export counts; `seed → delete: OK`; `ROLLED BACK`. Paste the output.

- [ ] **Step 7: Seed new guests** — `src/lib/auth/auth.ts`

Imports: `import { deleteUserData } from "@/lib/account/delete";` and `import { seedSampleWorkspace } from "@/lib/sample-workspace/seed";`. In the `create.after` hook, replace `if (user.isAnonymous === true) return;` with:

```ts
          if (user.isAnonymous === true) {
            try {
              await seedSampleWorkspace(user.id);
            } catch (error) {
              console.error("Sample workspace seeding failed", error);
              await deleteUserData(user.id);
              throw new APIError("INTERNAL_SERVER_ERROR", { code: "GUEST_SEED_FAILED", message: "Couldn't start the demo." });
            }
            return;
          }
```

- [ ] **Step 8: Real run — a seeded guest**

1. In a private window, click "Try without signing up". Expect `/today` to show focus areas and the week's counts from the sample.
2. Count the guest's rows with throwaway `scripts/guest-counts.tmp.mjs` (pass the guest id from `latest-guests.tmp.mjs`):

```js
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { sql } = await import("drizzle-orm");
const { db } = await import("../src/lib/db/index.ts");
const { OWNED_TABLES } = await import("../src/lib/account/owned-tables.ts");
const id = process.argv[2];
const counts = {};
for (const { name, table, scope } of OWNED_TABLES) {
  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(table).where(scope(id));
  if (n) counts[name] = n;
}
console.table(counts);
process.exit(0);
```

   Expect the counts to equal the export (plus any rows the guest created by browsing, e.g. `reading_sessions`).
3. `/library`: 3 documents. Open one and click several words. Expect a result each time (the AI backstop guarantees no AI call). Select a word from outside the texts (type it in a `[data-selectable]` area, or check a word missing from `lookups.json`) and expect the invite-only message.
4. `/practice`: the "Sample feedback" list with 2 entries; open one and see the full feedback.
5. `/progress`: errors and trend visible. `/vocabulary`: the saved words, enriched.
6. Delete this guest with `delete-test-guests.tmp.mjs` (owner OK).

Paste the counts and a `/today` screenshot.

- [ ] **Step 9: Provenance** — `docs/demo-content-sources.md`

Add a row to the inventory table:

```markdown
| Sample workspace for guest accounts | `src/lib/sample-workspace/source/`, `fixtures/` | Approved for demo (owner, <date>) | Texts and essays drafted with gpt-4o on <date> and edited by the owner; feedback, look-ups and drills generated by the app for the `sample-author@example.com` account; no personal history |
```

- [ ] **Step 10: Owner review and commit**

1. Show `git diff --stat`, and ask the owner to skim `source/*.md` and a sample of `workspace.json` (documents, submissions, errors).
2. Check the staged diff for emails:
   ```bash
   git diff --cached | grep -niE "[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}"
   ```
   Expect matches only in `docs/demo-content-sources.md` (the placeholder author address).
3. After the owner's OK:

```bash
git add src/lib/sample-workspace src/lib/auth/auth.ts docs/demo-content-sources.md
git commit -m "feat(sample): add the reviewed sample workspace data"
```

---

### Task 16: Daily guest cleanup

**Files:**
- Create: `src/app/api/cron/cleanup-guests/route.ts`
- Modify: `vercel.json`, `src/proxy.ts`

**Interfaces:**
- Consumes: `deleteUserData` (Task 4); `GUEST_CLEANUP_BATCH`, `GUEST_LIFETIME_DAYS` (Task 3).

- [ ] **Step 1: Route** — `src/app/api/cron/cleanup-guests/route.ts`

```ts
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { deleteUserData } from "@/lib/account/delete";
import { GUEST_CLEANUP_BATCH, GUEST_LIFETIME_DAYS } from "@/lib/access/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron (daily): deletes guests created more than GUEST_LIFETIME_DAYS ago. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response(null, { status: 401 });

  const cutoff = new Date(Date.now() - GUEST_LIFETIME_DAYS * 86_400_000);
  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
    .orderBy(asc(users.createdAt))
    .limit(GUEST_CLEANUP_BATCH);

  const totals: Record<string, number> = {};
  let failed = 0;
  for (const { id } of expired) {
    try {
      for (const [table, n] of Object.entries(await deleteUserData(id))) totals[table] = (totals[table] ?? 0) + n;
    } catch (error) {
      failed += 1;
      console.error("Guest cleanup failed", id, error);
    }
  }
  const summary = { deleted: expired.length - failed, failed, totals };
  console.info("guest cleanup", JSON.stringify(summary));
  return Response.json(summary);
}
```

- [ ] **Step 2: Schedule and public prefix**

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["yul1"],
  "crons": [{ "path": "/api/cron/cleanup-guests", "schedule": "0 9 * * *" }]
}
```

`src/proxy.ts`:

```ts
// /api/cron is guarded by CRON_SECRET in the route itself.
const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/assets", "/demo", "/login"];
```

- [ ] **Step 3: Typecheck, lint, test** → pass.

- [ ] **Step 4: Real run** (heads-up: add `CRON_SECRET=<random>` to `.env.local` and restart the dev server)

1. Run:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/cleanup-guests
   ```
   Expect `401`.
2. Start one guest in a private window. Note its id. With the owner's OK, backdate it:
   ```sql
   update users set created_at = now() - interval '8 days' where id = '<id>';
   ```
3. Run:
   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup-guests
   ```
   Expect `{"deleted":1,"failed":0,"totals":{…sample tables…}}` (plus any older test guests).
4. `scripts/latest-guests.tmp.mjs` no longer lists that id.

Paste the outputs.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron vercel.json src/proxy.ts
git commit -m "feat(ops): delete expired guests daily"
```

---

### Task 17: Docs, full verification, merge and production check

**Files:**
- Create: `docs/operations/guest-access.md`
- Modify: `CLAUDE.md`, `.env.example`

- [ ] **Step 1: Environment docs**

`.env.example` — replace the `AUTH_SIGNUP_ENABLED` comment and add:

```bash
# Invite sign-up kill switch: "false" stops every new account (invite codes are always required).
# AUTH_SIGNUP_ENABLED=true
# One-click guest accounts: "false" hides the button and rejects guest creation.
# GUEST_ACCESS_ENABLED=true
# Development only: turn on Better Auth rate limiting to test it locally.
# AUTH_RATE_LIMIT_ENABLED=true
# Vercel Cron bearer token for /api/cron/* (required in production).
CRON_SECRET=
```

`CLAUDE.md` → "Environment variables": replace the `AUTH_SIGNUP_ENABLED` line and add the others:

```
AUTH_SIGNUP_ENABLED   # Invite sign-up kill switch; "false" stops new accounts (codes always required)
GUEST_ACCESS_ENABLED  # "false" disables one-click guest accounts
AUTH_RATE_LIMIT_ENABLED # Development only: "true" enables Better Auth rate limiting
CRON_SECRET           # Required in production — Vercel Cron bearer token for /api/cron/*
```

`CLAUDE.md` → "Commands": add `npm run sample:check # Seed + delete the sample workspace in a rolled-back transaction (after migrations, before deploys)`.

`CLAUDE.md` → "Architecture": add a short "Access levels" subsection. It says:
- access is guest / full / admin, derived in `src/lib/auth/user.ts`;
- `src/lib/access/features.ts` lists what guests may use;
- new server actions in a gated area call `requireFeature`, and gated pages call `pageGate`;
- every new table with `user_id` is picked up by `src/lib/account/owned-tables.ts` automatically; a test fails if a child table without `user_id` is not registered.

- [ ] **Step 2: Runbook** — `docs/operations/guest-access.md`

Sections (short, imperative):

1. **Create an invite** — `/admin/invites`; codes are plaintext and revocable.
2. **Turn guests off** — set `GUEST_ACCESS_ENABLED=false` in Vercel and redeploy.
3. **Stop all sign-ups** — set `AUTH_SIGNUP_ENABLED=false`.
4. **Cleanup job** — `/api/cron/cleanup-guests`, daily 09:00 UTC, 100 guests per run, logs `guest cleanup {…}` in Vercel logs; run it manually with `curl -H "Authorization: Bearer $CRON_SECRET" https://sundew.jingxuanxu.com/api/cron/cleanup-guests`.
5. **After a migration** — run `npm run sample:check`. If it fails, sign in locally as `sample-author@example.com` (email code in the dev console) and re-run `npm run sample:export -- --email sample-author@example.com`. The look-ups only need `npm run sample:lookups -- --yes` if the texts changed.
6. **Limits** — 3 guests per IP per hour, 200 per UTC day, guests deleted 7 days after creation.

- [ ] **Step 3: Full local verification** — paste each output

1. Run:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
2. Run `npm run sample:check`.
3. Run `npm run build`. Before running, confirm the owner's dev server will not be disturbed (Next 16 builds to `.next` while dev uses `.next/dev`; if unsure, ask).
4. Walk spec §12 "Real runs" items 2–9 once more on the final branch, in a fresh private window. Most were proven in their tasks: re-check items 2 (guest seeded), 3 (locks and the look-up), 6 (conversion) and 8 (admin impersonating a guest sees locks).
5. Delete every test user created today: `delete-test-guests.tmp.mjs`, plus any `plan-*@example.com` by email.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md .env.example docs/operations/guest-access.md
git commit -m "docs: guest access, invites and the sample workspace"
```

- [ ] **Step 5: Owner actions before merge** — ask in chat and wait

- Vercel → Settings → Environment Variables (Production):
  - set `CRON_SECRET` (a long random string);
  - set `AUTH_SIGNUP_ENABLED=true`, or delete it: the new default is `true`;
  - leave `GUEST_ACCESS_ENABLED` unset;
  - **delete** `AUTH_RATE_LIMIT_ENABLED` if it was ever set.
- Confirm Resend status and the Google consent-screen mode (affects friends' first sign-in only).
- Approve the merge.

- [ ] **Step 6: Merge (owner OK)**

```bash
git checkout main
git merge --no-ff feat/guest-access -m "feat: guest access, invite codes and the sample workspace"
git push origin main
```

Vercel deploys `main`. Wait for the deployment to finish.

- [ ] **Step 7: Production check** (spec §12 item 10)

1. Open `https://sundew.jingxuanxu.com/demo` in a private window → "Try the full app" → `/today` with sample data.
2. The rate limiter sees the real client IP. In `rate_limits`, the newest key for `/sign-in/anonymous` starts with a public IP, not `127.0.0.1` or `unknown`:
   ```sql
   select key, count from rate_limits where key like '%/sign-in/anonymous%' order by last_request desc limit 3;
   ```
   Spec §12 "Verify first" item 3.
3. A gated page shows the locked view; a sample word look-up works.
4. The owner signs in normally; `/admin/invites` works.
5. The next day: Vercel → Logs shows one `guest cleanup {…}` line from the cron run. Report it in the next session if this one has ended.

Paste the results.

---

## Self-review notes

- **Spec coverage:**

  | Spec section | Task(s) |
  |---|---|
  | §1 matrix | 10, 11 |
  | §3 facts | verified in 1, 5, 8 |
  | §5 data model | 2 |
  | §6.1 | 3 |
  | §6.2 registry | 3 |
  | §6.3 layer 1 | 10, 11 |
  | §6.3 layer 2 | 10 |
  | §6.3 layer 3 | 12 |
  | §6.4 UI | 9, 10, 11 |
  | §7 deletion | 4; hook in 5 |
  | §8.1–8.2 | 6, 8 |
  | §8.3 | 8 |
  | §8.4 | 7 |
  | §9.1 | 5 |
  | §9.2 | 13 Step 1, 14, 15 |
  | §9.3 | 13 |
  | §9.4 | 14 |
  | §9.5 | 16 |
  | §10 | 5, 6, 16, 17 |
  | §11 copy | 5, 6, 8, 11 |
  | §12 verify-first | 1, 8, 17 |
  | §12 unit tests | 3, 4, 6, 10, 13, 14 |
  | §12 real runs | each task; 17 |
  | §14 delivery | 17 |

- **Type names used across tasks:**
  - `Access`, `FeatureKey`, `canUse`, `requireFeature`, `pageGate`, `useFeatureLocked`;
  - `OWNED_TABLES` / `OWNED_DELETE_ORDER`, `Dbx`, `purgeOwnedData`, `deleteUserData`;
  - `reserveInviteUse`, `recordRedemption`, `mayReceiveSignInCode`;
  - `checkInviteCode` / `InviteCheckResult`;
  - `LookupOutcome`, `persistLookup`;
  - `SAMPLE_TABLES`, `encodeFixture` / `decodeFixture`, `SAMPLE_WORKSPACE`, `seedSampleWorkspace`;
  - `sampleLookupKey`, `tokenizeForLookups`.
- **Known judgment calls an executor may hit:**
  - **Task 1 Google path:** this step needs the owner.
  - **Task 7 dialog exports:** check `DialogFooter` and `DialogDescription` before use.
  - **Task 10 `today.ts`:** keep the `available[0]` fallback.
  - **Task 13 Step 1 inventory:** this can change `POLYMORPHIC_COLUMNS`; agree any change with the owner.
