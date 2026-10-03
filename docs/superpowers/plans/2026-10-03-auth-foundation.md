# Auth Foundation (Better Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Azure Easy Auth and the uncommitted local-profile work with Better Auth
(Google + email OTP, database sessions, admin roles/ban/impersonation), keeping every
existing server action's auth call unchanged.

**Architecture:** Better Auth runs inside the Next.js app on the existing Postgres through
the Drizzle adapter. It reuses `users` (uuid PK, referenced by ~30 tables) and adds
`sessions`, `accounts`, `verifications` and `rate_limits`. `src/lib/auth/session.ts` keeps
its exports and resolves users via `auth.api.getSession()`. `src/proxy.ts` only checks for
the presence of a session cookie.

**Tech Stack:** Next 16.2.4, React 19.2, drizzle-orm 0.45 / drizzle-kit 0.31 (upgraded
here), postgres.js 3.4, better-auth 1.7.7, resend, node:test via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-auth-foundation-design.md`

## Global Constraints

- Commit messages: conventional commits, **no** `Co-Authored-By` / "Generated with" trailers.
- Before every commit: `git diff --cached` inspected — no exam content, real emails, Google subject ids or secrets.
- The repo is public: never write the owner's email or Google `sub` into tracked files.
- New tables: `uuid("id").primaryKey().defaultRandom()` and `timestamp(..., { withTimezone: true })`.
- UI: semantic tokens only (`text-muted-foreground`, `bg-surface`, …); primitives from `src/components/ui/`.
- The shared database is at migration **0025**; 0026–0036 are deferred. Migration 0037 is applied out of band by `scripts/apply-auth-migration.mts`, **never** recorded in `drizzle.__drizzle_migrations`, and must stay idempotent.
- Applying anything for real to the shared database requires the owner's explicit OK after the rehearsal output is shown.
- Verification per task: `npx tsc --noEmit && npm run lint && npm test` (plus task-specific runs).
- `LEGACY_OWNER_ID = "00000000-0000-4000-8000-000000000001"` (`src/lib/db/constants.ts`).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/tcf/pending-queue.ts` (new) | Pure per-account offline queue: send-first, persist on failure, legacy adoption |
| `src/lib/tcf/pending-sync.ts` | Browser wiring: one queue per account, retry triggers, React hook |
| `src/lib/tcf/sync-identity.ts` (from Codex) | `pendingSyncKey`, `assertSyncAccount` |
| `src/components/account-session.tsx` (from Codex) | Remount per account; cross-tab reload; `useAccountId()` |
| `src/lib/auth/callback-path.ts` (new) | `safeCallbackPath()` |
| `src/lib/auth/signup.ts` (new) | `signupEnabled()` |
| `src/lib/auth/user.ts` (new) | `AuthenticatedUser`, `toAuthenticatedUser()` |
| `src/lib/auth/email.ts` (new) | `otpEmailConfigured()`, `sendOtpEmail()` |
| `src/lib/auth/auth.ts` (new) | Better Auth server instance |
| `src/lib/auth/client.ts` (new) | Better Auth React client |
| `src/lib/auth/session.ts` | Same exports, now backed by Better Auth; adds `requirePageUser` |
| `src/lib/auth/identity.ts` (+test) | **Deleted** |
| `src/app/api/auth/[...all]/route.ts` (new) | Better Auth handler |
| `src/proxy.ts` | Cookie-presence gate + `x-sundew-path` forwarding |
| `src/app/login/page.tsx`, `_components/login-form.tsx` (new) | Sign-in / sign-up |
| `src/app/(main)/account/page.tsx` (new) | Account page |
| `src/components/sign-out-button.tsx`, `impersonation-banner.tsx` (new) | Shared client controls |
| `drizzle/0037_auth_foundation.sql` (generated, hand-edited) | Idempotent auth migration |
| `scripts/apply-auth-migration.mts` (new) | Rehearse / apply 0037 out of band |
| `scripts/account-access-smoke.mts` (from Codex, adapted) | Rollback-only isolation checks |

---

### Task 1: Archive the Codex work; clean `main`

**Files:** none edited (git only).

- [ ] **Step 1: Confirm the working tree holds only the Codex changes**

Run: `git status --short`
Expected: 18 `M` + 9 `??` entries. All are listed in the spec §1 / gitStatus; nothing else.

- [ ] **Step 2: Commit them unchanged to an archive branch, return to main**

```bash
git switch -c archive/codex-account-profiles
git add -A
git commit -m "wip: archive Codex local account profiles (superseded by Better Auth)"
git switch main
git status --short
```
Expected: the final `git status --short` prints nothing. `git log --oneline -1 archive/codex-account-profiles` shows the archive commit.

Later tasks read files from the archive with `git show archive/codex-account-profiles:<path>`.

---

### Task 2: Per-account TCF offline queue, AccountSession, media-url hardening

Works under the current Easy Auth; no Better Auth dependency.

**Files:**
- Create: `src/lib/tcf/pending-queue.ts`, `src/lib/tcf/pending-queue.test.ts`
- Create (from archive): `src/lib/tcf/sync-identity.ts`, `src/lib/tcf/sync-identity.test.ts`, `src/components/account-session.tsx`
- Modify: `src/lib/tcf/pending-sync.ts`, `src/lib/actions/tcf.ts`, `src/app/tcf/_components/{drill-runner,exam-runner,tcf-header}.tsx`, `src/app/tcf/layout.tsx`, `src/app/(main)/layout.tsx`, `src/app/api/media-url/route.ts`

**Interfaces:**
- Produces: `createPendingQueue<Item extends QueueItem>(options: { owner: string; send: (item: Item) => Promise<void>; storage: QueueStorage | null }) => PendingQueue<Item>` with `submit(item)`, `flush()`, `count()`, `subscribe(cb)`
- Produces: `submitDrillAttempt(owner, payload)`, `submitExamAttempt(owner, payload)`, `flushPendingSync(owner)`, `usePendingSyncCount(owner)`
- Produces: `<AccountSession userId>`, `useAccountId(): string`
- Produces: `recordTcfQuestionAttempt` / `recordTcfExamAttempt` accept `expectedUserId?: string`

- [ ] **Step 1: Restore the Codex helper files**

```bash
mkdir -p src/lib/tcf
git show archive/codex-account-profiles:src/lib/tcf/sync-identity.ts > src/lib/tcf/sync-identity.ts
git show archive/codex-account-profiles:src/lib/tcf/sync-identity.test.ts > src/lib/tcf/sync-identity.test.ts
```

Write `src/components/account-session.tsx` (Codex logic, reformatted to the repo's multi-line style):

```tsx
"use client";

import { createContext, useContext, useEffect } from "react";

const AccountContext = createContext<string | null>(null);
const ACTIVE_ACCOUNT_KEY = "sundew-active-account";

/**
 * Keys account-bound client state by user: switching accounts (or starting an
 * impersonation) remounts the subtree, and other open tabs reload instead of
 * writing with the previous account's state.
 */
export function AccountSession({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const active = userId ?? "signed-out";

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, active);
    } catch {
      // Storage may be disabled; cross-tab refresh is a convenience only.
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_ACCOUNT_KEY && event.newValue !== active) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [active]);

  return (
    <AccountContext.Provider key={active} value={userId}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccountId(): string {
  const userId = useContext(AccountContext);
  if (!userId) throw new Error("An authenticated account is required.");
  return userId;
}
```

- [ ] **Step 2: Write the failing queue tests**

Create `src/lib/tcf/pending-queue.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_OWNER_ID } from "../db/constants";
import { createPendingQueue, LEGACY_QUEUE_KEY, type QueueItem, type QueueStorage } from "./pending-queue";
import { pendingSyncKey } from "./sync-identity";

function memoryStorage(initial: Record<string, string> = {}): QueueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const item = (id: string, owner: string): QueueItem => ({ id, kind: "drill", payload: { expectedUserId: owner } });

test("a successful answer is sent directly and never queued", async () => {
  const storage = memoryStorage();
  const sent: string[] = [];
  const queue = createPendingQueue({ owner: "a", storage, send: async (entry) => void sent.push(entry.id) });
  await queue.submit(item("1", "a"));
  assert.deepEqual(sent, ["1"]);
  assert.equal(queue.count(), 0);
  assert.equal(storage.data.size, 0);
});

test("a failed answer is persisted under its account and retried by flush", async () => {
  const storage = memoryStorage();
  let online = false;
  const queue = createPendingQueue({ owner: "a", storage, send: async () => { if (!online) throw new Error("offline"); } });
  await queue.submit(item("1", "a"));
  assert.equal(queue.count(), 1);
  assert.ok(storage.data.get(pendingSyncKey("a"))?.includes('"1"'));
  online = true;
  await queue.flush();
  assert.equal(queue.count(), 0);
  assert.equal(storage.data.has(pendingSyncKey("a")), false);
});

test("stored entries for another account are ignored", () => {
  const storage = memoryStorage({ [pendingSyncKey("a")]: JSON.stringify([item("1", "a"), item("2", "b")]) });
  const queue = createPendingQueue({ owner: "a", storage, send: async () => {} });
  assert.equal(queue.count(), 1);
});

test("the legacy unscoped queue is adopted once, only by the legacy owner", () => {
  const legacy = JSON.stringify([{ id: "old", kind: "exam", payload: {} }]);
  const other = memoryStorage({ [LEGACY_QUEUE_KEY]: legacy });
  assert.equal(createPendingQueue({ owner: "someone-else", storage: other, send: async () => {} }).count(), 0);
  assert.equal(other.data.get(LEGACY_QUEUE_KEY), legacy);

  const owner = memoryStorage({ [LEGACY_QUEUE_KEY]: legacy });
  const queue = createPendingQueue({ owner: LEGACY_OWNER_ID, storage: owner, send: async () => {} });
  assert.equal(queue.count(), 1);
  assert.equal(owner.data.has(LEGACY_QUEUE_KEY), false);
  assert.ok(owner.data.get(pendingSyncKey(LEGACY_OWNER_ID))?.includes(LEGACY_OWNER_ID));
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx tsx --test src/lib/tcf/pending-queue.test.ts`
Expected: FAIL. The module `./pending-queue` cannot be found.

- [ ] **Step 4: Implement the queue core**

Create `src/lib/tcf/pending-queue.ts`:

```ts
import { LEGACY_OWNER_ID } from "../db/constants";
import { pendingSyncKey } from "./sync-identity";

/** Storage subset the queue needs; `window.localStorage` satisfies it. */
export type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type QueueItem = {
  id: string;
  kind: "drill" | "exam";
  payload: { expectedUserId?: string };
};

export type PendingQueue<Item extends QueueItem> = {
  submit(item: Item): Promise<void>;
  flush(): Promise<void>;
  count(): number;
  subscribe(callback: () => void): () => void;
};

/** Written before answers were scoped to accounts, when production had one user. */
export const LEGACY_QUEUE_KEY = "tcf-pending-sync";

function isItem(value: unknown): value is QueueItem {
  const item = value as QueueItem | null;
  return Boolean(item && typeof item.id === "string" && (item.kind === "drill" || item.kind === "exam") && item.payload);
}

function parse(raw: string | null): QueueItem[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

function load<Item extends QueueItem>(owner: string, storage: QueueStorage | null): Item[] {
  if (!storage) return [];
  try {
    const own = parse(storage.getItem(pendingSyncKey(owner))).filter((item) => item.payload.expectedUserId === owner);
    if (owner !== LEGACY_OWNER_ID) return own as Item[];
    const legacy = parse(storage.getItem(LEGACY_QUEUE_KEY))
      .map((item) => ({ ...item, payload: { ...item.payload, expectedUserId: owner } }));
    if (legacy.length === 0) return own as Item[];
    const adopted = [...own, ...legacy];
    storage.setItem(pendingSyncKey(owner), JSON.stringify(adopted));
    storage.removeItem(LEGACY_QUEUE_KEY);
    return adopted as Item[];
  } catch {
    return [];
  }
}

export function createPendingQueue<Item extends QueueItem>({
  owner,
  send,
  storage,
}: {
  owner: string;
  send: (item: Item) => Promise<void>;
  storage: QueueStorage | null;
}): PendingQueue<Item> {
  let queue = load<Item>(owner, storage);
  let flushing = false;
  const subscribers = new Set<() => void>();

  function persist(): void {
    try {
      if (queue.length === 0) storage?.removeItem(pendingSyncKey(owner));
      else storage?.setItem(pendingSyncKey(owner), JSON.stringify(queue));
    } catch {
      // Storage full or unavailable (private browsing) — the in-memory queue
      // still retries for this tab's lifetime, it just won't survive a reload.
    }
    for (const callback of subscribers) callback();
  }

  return {
    async submit(item) {
      try {
        await send(item);
      } catch {
        queue = [...queue, item];
        persist();
      }
    },
    /** Retries every queued item once; each success drops it, each renewed failure keeps it for the next attempt. */
    async flush() {
      if (flushing || queue.length === 0) return;
      flushing = true;
      try {
        for (const item of [...queue]) {
          try {
            await send(item);
            queue = queue.filter((entry) => entry.id !== item.id);
            persist();
          } catch {
            // Same account and request key are retried on the next trigger.
          }
        }
      } finally {
        flushing = false;
      }
    },
    count: () => queue.length,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx tsx --test src/lib/tcf/pending-queue.test.ts src/lib/tcf/sync-identity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Rewire `pending-sync.ts` onto the core**

Replace `src/lib/tcf/pending-sync.ts`. Keep the original module comment; it explains why the queue exists.

```ts
"use client";

import { useSyncExternalStore } from "react";
import { recordTcfExamAttempt, recordTcfQuestionAttempt } from "@/lib/actions/tcf";
import { createPendingQueue, type PendingQueue } from "./pending-queue";

/**
 * Both `record*` actions above are called fire-and-forget from the runners —
 * a phone on the LAN can lose the request to a Mac sleep cycle or a dev-server
 * restart invalidating the Server Action id, and the runner's own UI state
 * (streaks, colors) already reflects the answer regardless of whether the
 * write landed. Without this queue that failure is silent and the attempt is
 * gone the moment the tab reloads.
 *
 * Queues are per account: each entry carries `expectedUserId`, and the server
 * rejects it (ACCOUNT_CHANGED) if a different account is signed in, so a stale
 * tab can never write one learner's answers into another's history.
 */

type DrillPayload = Parameters<typeof recordTcfQuestionAttempt>[0];
type ExamPayload = Parameters<typeof recordTcfExamAttempt>[0];

type PendingItem =
  | { id: string; kind: "drill"; payload: DrillPayload }
  | { id: string; kind: "exam"; payload: ExamPayload };

/** Matches the Mac's idle-sleep window closely enough to retry soon after a wake. */
const RETRY_INTERVAL_MS = 30_000;

const queues = new Map<string, PendingQueue<PendingItem>>();

function sendItem(item: PendingItem): Promise<void> {
  return item.kind === "drill"
    ? recordTcfQuestionAttempt({ ...item.payload, requestKey: item.id })
    : recordTcfExamAttempt({ ...item.payload, requestKey: item.id });
}

function queueFor(owner: string): PendingQueue<PendingItem> {
  const existing = queues.get(owner);
  if (existing) return existing;
  const browser = typeof window !== "undefined";
  const queue = createPendingQueue<PendingItem>({
    owner,
    send: sendItem,
    storage: browser ? window.localStorage : null,
  });
  queues.set(owner, queue);
  if (browser) {
    const flush = () => void queue.flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") flush();
    });
    window.setInterval(flush, RETRY_INTERVAL_MS);
    if (queue.count() > 0) flush();
  }
  return queue;
}

// crypto.randomUUID() throws outside a secure context — a plain-http LAN
// address (the phone's actual use case) doesn't qualify, so this can't use it.
function localId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function submitDrillAttempt(owner: string, payload: DrillPayload): void {
  void queueFor(owner).submit({ id: localId(), kind: "drill", payload: { ...payload, expectedUserId: owner } });
}

export function submitExamAttempt(owner: string, payload: ExamPayload): void {
  void queueFor(owner).submit({ id: localId(), kind: "exam", payload: { ...payload, expectedUserId: owner } });
}

export function flushPendingSync(owner: string): Promise<void> {
  return queueFor(owner).flush();
}

export function usePendingSyncCount(owner: string): number {
  return useSyncExternalStore(
    (callback) => queueFor(owner).subscribe(callback),
    () => queueFor(owner).count(),
    () => 0,
  );
}
```

- [ ] **Step 7: Server check and call sites**

In `src/lib/actions/tcf.ts`, add `import { assertSyncAccount } from "@/lib/tcf/sync-identity";` next to the other `@/lib/…` imports. Do not place it above the existing import block.

Then add `expectedUserId?: string;` to the input types of `recordTcfExamAttempt` and `recordTcfQuestionAttempt`. In each function, add this line directly after `const user = await requireUser();`:
```ts
  assertSyncAccount(user.id, input.expectedUserId);
```

In `drill-runner.tsx`, `exam-runner.tsx` and `tcf-header.tsx`, add `import { useAccountId } from "@/components/account-session";` within the existing `@/…` import group. Then make these changes:
- `drill-runner.tsx`:
  - add `const owner = useAccountId();` as the first line of `DrillRunner`;
  - prefix the drill `storageKey` with `${owner}:`;
  - change the call to `submitDrillAttempt(owner, { … })`.
- `exam-runner.tsx`: add `const owner = useAccountId();` and change the call to `submitExamAttempt(owner, { … })`.
- `tcf-header.tsx`: add `const owner = useAccountId();`, then use `usePendingSyncCount(owner)` and `flushPendingSync(owner)`.

Layouts: in `src/app/tcf/layout.tsx` and `src/app/(main)/layout.tsx`, change `await requireUser();` to `const user = await requireUser();`. Wrap the existing root `<div>` in `<AccountSession userId={user.id}>`, with each element on its own line:

```tsx
  return (
    <AccountSession userId={user.id}>
      <div className="flex min-h-screen">
        …unchanged children…
      </div>
    </AccountSession>
  );
```

- [ ] **Step 8: media-url ownership check**

Replace the route with the archived version:
```bash
git show archive/codex-account-profiles:src/app/api/media-url/route.ts > src/app/api/media-url/route.ts
```
Then read the result. It adds an exact-path check: only `tcf_questions.audio_path` / `image_path` paths, or the caller's own `quiz_passages.audio_url`, get signed; anything else returns 404.

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. The test count is the HEAD count + 6. `identity.test.ts` is still present and still passes.

Browser check (owner's dev server on :3000):
- Open a TCF drill and answer a question → no "non enregistrée" badge appears.
- Set DevTools → Network → Offline, answer → badge shows 1.
- Set it back to Online → the badge clears within 30 s, or immediately on click.

- [ ] **Step 10: Commit**

```bash
git add src/lib/tcf src/components/account-session.tsx src/lib/actions/tcf.ts src/app/tcf src/app/\(main\)/layout.tsx src/app/api/media-url/route.ts
git diff --cached --stat
git commit -m "feat(tcf): isolate offline answer queues per account"
```

---

### Task 3: Upgrade Drizzle

**Files:** `package.json`, `package-lock.json`, `scripts/review-rehearsal/safety.mts`

- [ ] **Step 1: Upgrade**

```bash
npm install drizzle-orm@^0.45.2
npm install -D drizzle-kit@^0.31.4
```

- [ ] **Step 2: Unwrap `DrizzleQueryError` in the rehearsal helper**

In `scripts/review-rehearsal/safety.mts`, replace `failureCategory`:

```ts
export function failureCategory(error: unknown): string {
  // drizzle-orm >= 0.44 wraps driver errors in DrizzleQueryError; the SQLSTATE lives on `cause`.
  for (let current: unknown = error; current && typeof current === "object"; current = (current as { cause?: unknown }).cause) {
    if ("code" in current) return String((current as { code: unknown }).code);
  }
  return error instanceof Error ? error.name : "UnknownFailure";
}
```

- [ ] **Step 3: Verify schema parity and the suite**

Run: `npx drizzle-kit generate`
Expected: "No schema changes, nothing to migrate". If it generates a file instead, delete that file and its snapshot/journal entry, and stop: report the diff.

Run: `npx tsc --noEmit && npm run lint && npm test && npm run test:review-rehearsal`
Expected: all pass.

Browser check: `/today`, `/library`, `/tcf` and `/vocabulary` load on the owner's dev server. A restart may be needed after a dependency change; ask the owner.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/review-rehearsal/safety.mts
git commit -m "chore(deps): upgrade drizzle-orm to 0.45 and drizzle-kit to 0.31"
```

---

### Task 4: Auth schema, idempotent migration 0037, rehearse/apply script

**Files:**
- Modify: `src/lib/db/schema.ts` (`users` + new tables)
- Create: `drizzle/0037_auth_foundation.sql` (+ generated `meta/0037_snapshot.json`, journal entry)
- Create: `scripts/apply-auth-migration.mts`

**Interfaces:**
- Produces: Drizzle tables `users` (with `name`, `emailVerified`, `image`, `banned`, `banReason`, `banExpires`), `sessions`, `accounts`, `verifications`, `rateLimits`. Property names are exactly Better Auth's field names.

- [ ] **Step 1: Edit `users` in `schema.ts`**

```ts
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Legacy Easy Auth identity, unread since Better Auth; dropped by the post-cutover cleanup.
    authIssuer: text("auth_issuer"),
    authSubject: text("auth_subject"),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("member"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    // Legacy flag copied into `banned` by 0037; unread, dropped with authIssuer.
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_auth_identity_key").on(t.authIssuer, t.authSubject),
    unique("users_email_unique").on(t.email),
    index("users_email_idx").on(t.email),
  ],
);
```

Directly after `export type AppUser …`, add:

```ts
/* ------------------------------------------------------------------ */
/*  auth — Better Auth sessions, sign-in methods, codes, rate limits    */
/*  Property names must match Better Auth's field names exactly.        */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sessions_token_key").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("accounts_provider_account_key").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [unique("rate_limits_key_key").on(t.key)],
);
```

Add `bigint` to the `drizzle-orm/pg-core` import list.

- [ ] **Step 2: Generate**

Run: `npx drizzle-kit generate --name auth_foundation`
Expected: it creates `drizzle/0037_auth_foundation.sql`, `meta/0037_snapshot.json` and a journal entry. Read the generated SQL and note its exact constraint, index and FK names; Step 3 must use those names.

- [ ] **Step 3: Rewrite 0037 to be idempotent; append the data steps**

Replace the SQL file's content. Keep every object name identical to the generated file. Expected FK names follow Drizzle's `<table>_<column>_<ref table>_<ref column>_fk` pattern.

```sql
-- Auth foundation (Better Auth). Hand-edited to be IDEMPOTENT: the shared database
-- is still at 0025 (0026–0036 deferred), so this file is applied out of band by
-- scripts/apply-auth-migration.mts and NOT recorded in drizzle.__drizzle_migrations.
-- It runs again, in order, when the deferred chain is applied. Keep every statement re-runnable.
ALTER TABLE "users" ALTER COLUMN "auth_issuer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'auth foundation: duplicate user emails must be resolved first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_key" UNIQUE("token")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_key" UNIQUE("provider_id","account_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_key" UNIQUE("key")
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_impersonated_by_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_users_id_fk') THEN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
-- Data: only ever raises flags, so a re-run cannot undo a later admin action.
UPDATE "users" SET "email_verified" = true WHERE "auth_issuer" IS NOT NULL AND "email_verified" = false;--> statement-breakpoint
UPDATE "users" SET "banned" = true WHERE "status" = 'disabled' AND "banned" = false;--> statement-breakpoint
-- The owner's Easy Auth subject is their Google `sub`; Better Auth finds Google users by it.
INSERT INTO "accounts" ("user_id", "account_id", "provider_id")
SELECT "id", "auth_subject", 'google' FROM "users"
WHERE "id" = '00000000-0000-4000-8000-000000000001' AND "auth_issuer" = 'google' AND "auth_subject" IS NOT NULL
ON CONFLICT ("provider_id", "account_id") DO NOTHING;--> statement-breakpoint
-- Synthetic local identities are obsolete. A row that still owns data is kept.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT "id" FROM "users" WHERE "auth_issuer" = 'development' LOOP
    BEGIN
      DELETE FROM "users" WHERE "id" = r."id";
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'auth foundation: kept development user % (owns data)', r."id";
    END;
  END LOOP;
END $$;
```

If the generated SQL declared the `users_email_idx` / `users_auth_identity_key` changes differently (it should not), reconcile them before continuing.

- [ ] **Step 4: Confirm the snapshot matches the schema**

Run: `npx drizzle-kit generate`
Expected: "No schema changes, nothing to migrate".

- [ ] **Step 5: Write the rehearse/apply script**

Create `scripts/apply-auth-migration.mts`:

```ts
/**
 * Applies drizzle/0037_auth_foundation.sql out of band. The shared database is at
 * 0025 and 0026–0036 are deferred, so `npm run db:init` cannot reach 0037 yet.
 * The file is idempotent and deliberately NOT recorded in drizzle.__drizzle_migrations:
 * the migrator only applies files newer than the last recorded one, so recording 0037
 * would make it skip 0026–0036 forever.
 *
 *   node --import tsx scripts/apply-auth-migration.mts --rehearse   # apply, verify, roll back
 *   node --import tsx scripts/apply-auth-migration.mts --apply      # apply, verify, commit
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import postgres from "postgres";

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rehearse") ? "rehearse" : null;
assert(mode, "Pass --rehearse or --apply");
nextEnv.loadEnvConfig(process.cwd(), true);
assert(process.env.DATABASE_URL, "DATABASE_URL required");

const OWNER = "00000000-0000-4000-8000-000000000001";
const SAMPLE = ["documents", "submissions", "tcf_question_attempts", "user_vocabulary", "errors"];
const file = path.join(process.cwd(), "drizzle", "0037_auth_foundation.sql");
const statements = (await readFile(file, "utf8"))
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: (notice) => console.log("NOTICE", notice.message),
});
const rollback = new Error("REHEARSAL_ROLLBACK");

async function snapshot(tx: postgres.Sql) {
  const [{ users }] = await tx<{ users: number }[]>`select count(*)::int as users from users`;
  const owned: Record<string, number> = {};
  for (const table of SAMPLE) {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)} where user_id = ${OWNER}`;
    owned[table] = n;
  }
  return { users, owned };
}

async function count(tx: postgres.Sql, query: Promise<{ n: number }[]>) {
  return (await query)[0].n;
}

try {
  await sql.begin(async (tx) => {
    const before = await snapshot(tx);
    console.log("before", JSON.stringify(before));
    for (const statement of statements) await tx.unsafe(statement);
    const after = await snapshot(tx);
    console.log("after ", JSON.stringify(after));
    assert.deepEqual(after.owned, before.owned, "owner data changed");
    assert.equal(await count(tx, tx`select count(*)::int as n from accounts where user_id = ${OWNER} and provider_id = 'google'`), 1, "owner Google account");
    assert.equal(await count(tx, tx`select count(*)::int as n from pg_constraint where conname = 'users_email_unique'`), 1, "email unique");
    assert.equal(await count(tx, tx`select count(*)::int as n from users where status = 'disabled' and not banned`), 0, "bans copied");
    console.log("development users remaining:", await count(tx, tx`select count(*)::int as n from users where auth_issuer = 'development'`));
    for (const statement of statements) await tx.unsafe(statement);
    assert.deepEqual(await snapshot(tx), after, "a second run changed state");
    console.log("second run: no changes (idempotent)");
    if (mode === "rehearse") throw rollback;
  });
  console.log("APPLIED (committed)");
} catch (error) {
  if (error !== rollback) throw error;
  console.log("REHEARSED (rolled back)");
} finally {
  await sql.end();
}
```

- [ ] **Step 6: Rehearse against the shared database**

Run: `node --import tsx scripts/apply-auth-migration.mts --rehearse`
Expected output:
- `before {"users":3,"owned":{…}}`;
- `after  {"users":1,…}`, with the same `owned` numbers;
- `development users remaining: 0`;
- `second run: no changes (idempotent)`;
- `REHEARSED (rolled back)`.

Paste the full output to the owner.

- [ ] **Step 7: Verify suite, commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: pass. The app still runs on Easy Auth code because the schema change is additive.

```bash
git add src/lib/db/schema.ts drizzle/0037_auth_foundation.sql drizzle/meta scripts/apply-auth-migration.mts
git commit -m "feat(db): add Better Auth tables and migrate the owner identity"
```

- [ ] **Step 8: Apply for real — only after the owner's explicit OK**

First, confirm with the owner that Azure Postgres point-in-time restore is enabled.

Run: `node --import tsx scripts/apply-auth-migration.mts --apply`
Expected: the same assertions pass, ending with `APPLIED (committed)`. Paste the output.

---

### Task 5: Pure auth helpers (TDD)

**Files:**
- Create: `src/lib/auth/callback-path.ts`, `src/lib/auth/signup.ts`, `src/lib/auth/user.ts`
- Create: `src/lib/auth/auth-helpers.test.ts`

**Interfaces:**
- Produces: `safeCallbackPath(value: string | null | undefined): string`
- Produces: `signupEnabled(env?: { NODE_ENV?: string; AUTH_SIGNUP_ENABLED?: string }): boolean`
- Produces: `type AuthenticatedUser = { id: string; email: string; name: string; role: "admin" | "member"; impersonatedBy: string | null }`
- Produces: `toAuthenticatedUser(session: SessionLike | null): AuthenticatedUser | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/auth-helpers.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { safeCallbackPath } from "./callback-path";
import { signupEnabled } from "./signup";
import { toAuthenticatedUser } from "./user";

test("callback paths stay on this site", () => {
  assert.equal(safeCallbackPath("/tcf/drill?skill=reading#q3"), "/tcf/drill?skill=reading#q3");
  for (const value of [null, undefined, "", "today", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/login?callbackURL=/x"]) {
    assert.equal(safeCallbackPath(value), "/today", String(value));
  }
});

test("sign-up is closed in production unless explicitly opened", () => {
  assert.equal(signupEnabled({ NODE_ENV: "production" }), false);
  assert.equal(signupEnabled({ NODE_ENV: "production", AUTH_SIGNUP_ENABLED: "true" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(signupEnabled({ NODE_ENV: "development", AUTH_SIGNUP_ENABLED: "false" }), false);
});

test("sessions map to the app user; banned users have none", () => {
  const session = { user: { id: "u1", email: "a@example.com", name: "", role: "admin", banned: false }, session: { impersonatedBy: null } };
  assert.deepEqual(toAuthenticatedUser(session), { id: "u1", email: "a@example.com", name: "", role: "admin", impersonatedBy: null });
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, role: "user" } })?.role, "member");
  assert.equal(toAuthenticatedUser({ ...session, user: { ...session.user, banned: true } }), null);
  assert.equal(toAuthenticatedUser(null), null);
  assert.equal(toAuthenticatedUser({ ...session, session: { impersonatedBy: "admin-1" } })?.impersonatedBy, "admin-1");
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx tsx --test src/lib/auth/auth-helpers.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/auth/callback-path.ts`:
```ts
const FALLBACK = "/today";
const BASE = "http://sundew.invalid";

/** Post-sign-in destination: same-origin relative paths only, never back to /login. */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return FALLBACK;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || url.pathname === "/login" || url.pathname.startsWith("/login/")) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
```

`src/lib/auth/signup.ts`:
```ts
/** Closed in production unless opened explicitly; sub-project 2 opens it behind feature tiers. */
export function signupEnabled(
  env: { NODE_ENV?: string; AUTH_SIGNUP_ENABLED?: string } = process.env,
): boolean {
  if (env.AUTH_SIGNUP_ENABLED === "true") return true;
  if (env.AUTH_SIGNUP_ENABLED === "false") return false;
  return env.NODE_ENV !== "production";
}
```

`src/lib/auth/user.ts`:
```ts
export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  /** Set while an administrator is viewing the app as this user. */
  impersonatedBy: string | null;
};

type SessionLike = {
  user: { id: string; email: string; name: string; role?: string | null; banned?: boolean | null };
  session: { impersonatedBy?: string | null };
};

export function toAuthenticatedUser(session: SessionLike | null): AuthenticatedUser | null {
  if (!session || session.user.banned) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "admin" ? "admin" : "member",
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test src/lib/auth/auth-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/callback-path.ts src/lib/auth/signup.ts src/lib/auth/user.ts src/lib/auth/auth-helpers.test.ts
git commit -m "feat(auth): add callback, sign-up gate and session mapping helpers"
```

---

### Task 6: Better Auth server, client, route, email

**Files:**
- Create: `src/lib/auth/auth.ts`, `src/lib/auth/client.ts`, `src/lib/auth/email.ts`, `src/app/api/auth/[...all]/route.ts`
- Modify: `package.json` / lock (`better-auth`, `resend`), `.env.example`
- Local (not tracked): `.env.local`, which gets `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; the owner adds the Google keys

**Interfaces:**
- Consumes: `signupEnabled()` (Task 5); Drizzle tables (Task 4)
- Produces: `auth` (server instance; `auth.api.getSession`, `auth.api.listUserAccounts`); `authClient` (`signIn.social`, `signIn.emailOtp`, `emailOtp.sendVerificationOtp`, `signOut`, `admin.*`); `otpEmailConfigured(): boolean`

- [ ] **Step 1: Install**

```bash
npm install better-auth@^1.7.7 resend
```
Expected: no peer warnings for drizzle-orm (now 0.45) or next.

- [ ] **Step 2: Email module**

`src/lib/auth/email.ts`:
```ts
import "server-only";

import { Resend } from "resend";

/** Development prints codes to the server console; production needs Resend configured. */
export function otpEmailConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

export async function sendOtpEmail({ to, otp }: { to: string; otp: string }): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] sign-in code for ${to}: ${otp}`);
    return;
  }
  if (!otpEmailConfigured()) throw new Error("Email sign-in is not configured.");
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.AUTH_EMAIL_FROM!,
    to,
    subject: `${otp} is your Sundew sign-in code`,
    text: `Your Sundew sign-in code is ${otp}.\n\nIt expires in 5 minutes. If you didn't request it, you can ignore this email.`,
    html: `<p>Your Sundew sign-in code is</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>It expires in 5 minutes. If you didn't request it, you can ignore this email.</p>`,
  });
  if (error) {
    // Never log the code itself.
    console.error("[auth] sign-in email failed:", error.name);
    throw new Error("Couldn't send the sign-in code.");
  }
}
```

- [ ] **Step 3: Server instance**

`src/lib/auth/auth.ts`:
```ts
import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "@/lib/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/lib/db/schema";
import { sendOtpEmail } from "./email";
import { signupEnabled } from "./signup";

const signupOpen = signupEnabled();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { users, sessions, accounts, verifications, rateLimits },
  }),
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  // Postgres generates the uuid primary keys (column defaults).
  advanced: { database: { generateId: "uuid" } },
  trustedOrigins: process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      disableSignUp: !signupOpen,
    },
  },
  rateLimit: { storage: "database", modelName: "rateLimits" },
  databaseHooks: {
    user: {
      create: {
        // Backstop for every sign-up path; the provider options above give the friendly errors.
        before: async (user) => {
          if (!signupOpen) throw new APIError("FORBIDDEN", { message: "Sign-up is currently closed." });
          return { data: user };
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      storeOTP: "hashed",
      disableSignUp: !signupOpen,
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: ({ email, otp }) => sendOtpEmail({ to: email, otp }),
    }),
    admin({ roles: { admin: adminAc, member: userAc }, adminRoles: ["admin"], defaultRole: "member" }),
    nextCookies(), // must stay last
  ],
});
```

If `tsc` rejects an option name (`APIError` constructor shape, `rateLimit.modelName`), check `node_modules/better-auth/dist` types. Fix it to the 1.7 shape and note the change in the commit message.

- [ ] **Step 4: Client and route**

`src/lib/auth/client.ts`:
```ts
"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [emailOTPClient(), adminClient()] });
```

`src/app/api/auth/[...all]/route.ts`:
```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Env files**

In `.env.example`, replace the whole "Private-app authentication" block (`APP_AUTH_MODE` through `DEV_AUTH_EMAIL`) with:

```bash
# Authentication (Better Auth). Generate a secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
# Public origin of this app — http://localhost:3000 locally, https://<host> in production.
BETTER_AUTH_URL=http://localhost:3000
# Google OAuth client. Authorized redirect URI: <BETTER_AUTH_URL>/api/auth/callback/google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Email sign-in codes. Development prints codes to the server console instead.
# Production hides email sign-in until both are set (sender on a Resend-verified domain).
# RESEND_API_KEY=
# AUTH_EMAIL_FROM=Sundew <noreply@mail.example.com>
# Sign-up gate: defaults to open in development, closed in production.
# AUTH_SIGNUP_ENABLED=false
```

For `.env.local`: tell the owner first, then append `BETTER_AUTH_SECRET=<generated>` and `BETTER_AUTH_URL=http://localhost:3000`. Never echo the secret. The owner adds `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (the Easy Auth Google client) and registers `http://localhost:3000/api/auth/callback/google` in Google Cloud Console.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: pass. `session.ts` is still on Easy Auth; the route exists but nothing calls it yet.

```bash
git add package.json package-lock.json src/lib/auth/auth.ts src/lib/auth/client.ts src/lib/auth/email.ts "src/app/api/auth/[...all]/route.ts" .env.example
git commit -m "feat(auth): configure Better Auth with Google, email OTP and admin"
```

---

### Task 7: Switch request authorization to Better Auth

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/proxy.ts`, `src/app/(main)/layout.tsx`, `src/app/tcf/layout.tsx`
- Delete: `src/lib/auth/identity.ts`, `src/lib/auth/identity.test.ts`

**Interfaces:**
- Consumes: `auth` (Task 6), `toAuthenticatedUser`, `safeCallbackPath` (Task 5)
- Produces: unchanged `getCurrentUser`, `requireUser`, `requireAdmin`, `AuthenticationError`; new `requirePageUser(): Promise<AuthenticatedUser>`

- [ ] **Step 1: Rewrite `session.ts`**

```ts
import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { safeCallbackPath } from "./callback-path";
import { toAuthenticatedUser, type AuthenticatedUser } from "./user";

export type { AuthenticatedUser } from "./user";

export class AuthenticationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTH_MISCONFIGURED";

  constructor(code: AuthenticationError["code"]) {
    super(code);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

/** Validates the session cookie against the database once per request. */
const resolveCurrentUser = cache(async (): Promise<AuthenticatedUser | null> =>
  toAuthenticatedUser(await auth.api.getSession({ headers: await headers() })),
);

export const getCurrentUser = resolveCurrentUser;

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await resolveCurrentUser();
  if (user) return user;
  throw new AuthenticationError("UNAUTHENTICATED");
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  throw new AuthenticationError("FORBIDDEN");
}

/** Pages send signed-out visitors to /login and bring them back afterwards. */
export async function requirePageUser(): Promise<AuthenticatedUser> {
  const user = await resolveCurrentUser();
  if (user) return user;
  const path = safeCallbackPath((await headers()).get("x-sundew-path"));
  redirect(`/login?callbackURL=${encodeURIComponent(path)}`);
}
```

`auth` is imported through the `@/` alias, not `./auth`, so the smoke script's module mock can intercept it.

- [ ] **Step 2: Rewrite `proxy.ts`**

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// /assets holds brand images only. public/media (private exam audio) stays behind the gate.
const PUBLIC_PREFIXES = ["/api/auth", "/assets", "/demo", "/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPageRequest(request: NextRequest): boolean {
  return request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/");
}

/** Optimistic gate: only checks that a session cookie exists. Server code validates it. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!getSessionCookie(request)) {
    if (isPageRequest(request)) {
      const login = new URL("/login", request.url);
      login.searchParams.set("callbackURL", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Lets requirePageUser() return here if the cookie turns out to be stale.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-sundew-path", `${pathname}${search}`);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 3: Layouts use `requirePageUser`**

In `src/app/(main)/layout.tsx` and `src/app/tcf/layout.tsx`, replace `requireUser` with `requirePageUser`, both in the import and in the call.

- [ ] **Step 4: Delete Easy Auth parsing**

```bash
git rm src/lib/auth/identity.ts src/lib/auth/identity.test.ts
grep -rn "auth/identity\|authConfigFromEnv\|APP_ALLOWED_EMAILS\|DEV_AUTH_EMAIL" src scripts
```
Expected: the grep prints nothing. If it finds anything, remove those usages.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: pass. The test count drops by the deleted identity tests.

Local check, with the owner's dev server restarted so env changes load:
- `curl -sI localhost:3000/library` → `307`, `location: /login?callbackURL=%2Flibrary`.
- `curl -s localhost:3000/api/media-url?path=/media/x` → 401 JSON.
- `curl -sI localhost:3000/assets/sundew-logo-assets/sundew-logo-horizontal.svg` → 200.

`/login` itself is built in Task 8, so a 404 there is expected for now.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/auth src/proxy.ts "src/app/(main)/layout.tsx" src/app/tcf/layout.tsx
git commit -m "feat(auth): replace Easy Auth with Better Auth sessions"
```

---

### Task 8: Login, account, sign-out, impersonation banner, sidebar

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/_components/login-form.tsx`, `src/app/(main)/account/page.tsx`, `src/components/sign-out-button.tsx`, `src/components/impersonation-banner.tsx`
- Modify: `src/components/sidebar.tsx`, `src/lib/navigation.ts`, `src/app/(main)/layout.tsx`, `src/app/tcf/layout.tsx`

**Interfaces:**
- Consumes: `authClient` (Task 6); `getCurrentUser`, `requirePageUser` (Task 7); `safeCallbackPath`, `signupEnabled`, `otpEmailConfigured`
- Produces: `<SignOutButton />`, `<ImpersonationBanner email />`, `<Sidebar email role />`

- [ ] **Step 1: Shared client controls**

`src/components/sign-out-button.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      className={className}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        // A full load resets account-bound client state and tells other tabs.
        window.location.assign("/login");
      }}
    >
      Sign out
    </Button>
  );
}
```

`src/components/impersonation-banner.tsx`:
```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function ImpersonationBanner({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-warning-soft px-4 py-2 text-sm text-warning">
      <span>Viewing as {email}</span>
      <button
        type="button"
        disabled={pending}
        className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
        onClick={async () => {
          setPending(true);
          await authClient.admin.stopImpersonating();
          window.location.assign("/account");
        }}
      >
        Stop
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Login page**

`src/app/login/_components/login-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

const MESSAGES: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the latest email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Send a new code.",
  BANNED_USER: "This account has been disabled.",
  signup_disabled: "Sign-up is currently closed. Existing accounts can sign in.",
};
const FALLBACK = "Something went wrong. Please try again.";

function messageFor(error: { code?: string; status?: number }): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

export function LoginForm({
  callbackPath,
  otpAvailable,
  signupOpen,
  initialError,
}: {
  callbackPath: string;
  otpAvailable: boolean;
  signupOpen: boolean;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (MESSAGES[initialError] ?? "Google sign-in didn't complete. Please try again.") : null,
  );

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackPath,
      errorCallbackURL: `/login?callbackURL=${encodeURIComponent(callbackPath)}`,
    });
    if (error) {
      setError(messageFor(error));
      setPending(false);
    }
  }

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setPending(false);
    if (error) return setError(messageFor(error));
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    if (error) {
      setPending(false);
      return setError(messageFor(error));
    }
    window.location.assign(callbackPath);
  }

  return (
    <div className="mt-6 space-y-5">
      <Button className="w-full" disabled={pending} onClick={continueWithGoogle}>
        Continue with Google
      </Button>
      {otpAvailable && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use an email code
            <span className="h-px flex-1 bg-border" />
          </div>
          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <Input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email address" />
              <Button type="submit" variant="outline" className="w-full" disabled={pending || !email}>
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {email}. It expires in 5 minutes.</p>
              <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} aria-label="Sign-in code" />
              <Button type="submit" className="w-full" disabled={pending || otp.length !== 6}>
                Sign in
              </Button>
              <button type="button" className="text-sm text-muted-foreground hover:text-accent" onClick={() => { setStep("email"); setOtp(""); }}>
                Use a different email or send a new code
              </button>
            </form>
          )}
        </>
      )}
      {!signupOpen && <p className="text-xs leading-5 text-muted-foreground">Sign-up is currently closed. Existing accounts can sign in.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

Before writing, `grep -n "danger\|destructive" src/app/globals.css` to find the error-text token. Use it in place of `text-danger` if the name differs.

`src/app/login/page.tsx`:
```tsx
import Link from "next/link";
import { SundewLogo } from "@/components/sundew-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { safeCallbackPath } from "@/lib/auth/callback-path";
import { otpEmailConfigured } from "@/lib/auth/email";
import { getCurrentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Link href="/demo" className="mb-10 w-fit">
        <SundewLogo priority />
      </Link>
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">Welcome to Sundew</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your French practice, saved to your account.</p>
        {user ? (
          <div className="mt-6 space-y-4">
            <p className="break-all text-sm">Signed in as {user.email}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={callbackPath}>Continue</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
        ) : (
          <LoginForm
            callbackPath={callbackPath}
            otpAvailable={otpEmailConfigured()}
            signupOpen={signupEnabled()}
            initialError={error ?? null}
          />
        )}
      </section>
      <Link href="/demo" className="mt-6 text-center text-sm text-muted-foreground hover:text-accent">
        Explore the public demo
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Account page**

`src/app/(main)/account/page.tsx`:
```tsx
import { headers } from "next/headers";
import { UserRound } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth/auth";
import { requirePageUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser();
  const linked = await auth.api.listUserAccounts({ headers: await headers() });
  const google = linked.some((account) => account.providerId === "google");

  return (
    <div className="mx-auto max-w-2xl px-10 py-10">
      <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Account</h1>
      <p className="mb-10 text-sm text-muted-foreground">Your sign-in and the learning history that belongs to it.</p>
      <section className="space-y-5 rounded-2xl bg-surface p-6 shadow-card">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">{user.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user.role === "admin" ? "Administrator" : "Member"}</p>
          </div>
        </div>
        <div className="text-sm">
          <p className="font-medium">Sign-in methods</p>
          <p className="mt-1 text-muted-foreground">Email code{google ? " · Google" : ""}</p>
        </div>
        <p className="text-sm text-muted-foreground">Documents, answers, vocabulary, feedback and recordings belong to this account. The TCF question bank is shared.</p>
        <SignOutButton />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Sidebar footer, nav item, banner in layouts**

`src/lib/navigation.ts`: add `UserRound` to the lucide import, and add this as the **first** `SECONDARY_NAVIGATION` entry, so mobile can reach the page through "More":
```ts
  { href: "/account", label: "Account", icon: UserRound, matches: within("/account") },
```

`src/components/sidebar.tsx`: change the signature to `export function Sidebar({ email, role }: { email: string; role: "admin" | "member" })`. Replace the `v0.2 · self` footer div with:
```tsx
        <Link
          href="/account"
          className="mt-auto rounded-lg border-t border-border/70 px-3 pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <p className="truncate text-xs font-medium" title={email}>{email}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {role === "admin" ? "Administrator" : "Member"}
          </p>
        </Link>
```

`src/app/(main)/layout.tsx`:
- pass `<Sidebar email={user.email} role={user.role} />`;
- render `{user.impersonatedBy && <ImpersonationBanner email={user.email} />}` as the first child inside `<main>`.

`src/app/tcf/layout.tsx`: render the same banner directly above `<TcfHeader />`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: pass.

Browser (owner's dev server; Google keys present in `.env.local`):
1. Open `/library` while signed out → redirected to `/login?callbackURL=/library`.
2. Continue with Google (owner) → lands on `/library`, which shows the owner's documents. Paste the count next to `select count(*) from documents where user_id = LEGACY_OWNER_ID`.
3. Run `select provider_id, count(*) from accounts where user_id = '<LEGACY_OWNER_ID>' group by 1` → `google | 1`.
   - If it shows 2, Easy Auth's subject was not the Google `sub`: delete the seeded row (the one whose `account_id` equals `users.auth_subject` but differs from the newer row) and report it.
4. `/account` shows the email, Administrator, and "Email code · Google".
5. Sign out → `/login`. Send a code to a new address → the code appears in the dev-server console → sign in → `/account` shows Member; `/library` is empty.
6. Screenshot `/login` and `/account` at a narrow (375px) and a desktop width.

- [ ] **Step 6: Commit**

```bash
git add src/app/login "src/app/(main)/account" src/components/sign-out-button.tsx src/components/impersonation-banner.tsx src/components/sidebar.tsx src/lib/navigation.ts "src/app/(main)/layout.tsx" src/app/tcf/layout.tsx
git commit -m "feat(auth): add sign-in, account and impersonation views"
```

---

### Task 9: Smoke script, docs, full verification

**Files:**
- Create (adapted from archive): `scripts/account-access-smoke.mts`
- Modify: `docs/architecture/system.md`, `docs/operations/deployment-security.md`, `docs/README.md`, `CLAUDE.md` (environment variables), `docs/roadmap.md`
- Create: `docs/operations/accounts.md`

- [ ] **Step 1: Adapt the smoke script**

Start from the archive copy:
```bash
git show archive/codex-account-profiles:scripts/account-access-smoke.mts > scripts/account-access-smoke.mts
```

Changes:
1. **Identities.** The async-local store holds `{ userId, impersonatedBy } | null` (null = signed out). This replaces `"owner" | "test" | "signed-out"`.
2. **Mocks.**
   - Remove the `next/headers` cookie mock; keep `headers: async () => new Headers()`.
   - Add a mock for the auth module. Its `getSession` reads the user row inside the rolled-back transaction:
     ```js
     exports.auth = { api: { getSession: async () => {
       const ctx = globalThis[Symbol.for("sundew.account.smoke")];
       const who = ctx.localAccount.getStore();
       if (!who) return null;
       const [user] = await ctx.lookupUser(who.userId);
       return user ? { user, session: { impersonatedBy: who.impersonatedBy ?? null } } : null;
     } } };
     ```
     `ctx.lookupUser = (id) => tx.select().from(schema.users).where(eq(schema.users.id, id))`.
3. **Resolve hook.** Match mocks on the *resolved* URL as well as the bare specifier: call `next()` first for non-bare specifiers, then check whether `resolved.url` ends with `/src/lib/auth/auth.ts`. Bare `server-only` is matched by specifier, before resolution.
4. **Fixtures.**
   - `owner` = the `LEGACY_OWNER_ID` row.
   - `member` = a row inserted in the transaction: `insert into users (email, role) values ('smoke-member@example.test', 'member')`.
5. **Assertions.**
   - Signed-out → `UNAUTHENTICATED`.
   - The disabled check sets `banned = true` and expects `UNAUTHENTICATED`, since a banned user now has no session user. It also asserts that `banned` stays `true`.
   - Add an impersonation check: with `{ userId: member.id, impersonatedBy: owner.id }`, `listDocuments()` returns the member's fixture and not the owner's.

- [ ] **Step 2: Run it**

Run: `node --import tsx scripts/account-access-smoke.mts --rollback-only`
Expected: 12 `PASS` lines, then a JSON summary with `"failed": 0`, including "all synthetic changes rolled back". Paste the output.

- [ ] **Step 3: Docs**

- `docs/operations/accounts.md` (new). Cover:
  - sign-in methods;
  - the sign-up gate and how sub-project 2 opens it;
  - the admin role, ban and impersonation;
  - local setup: env vars, the Google redirect URI, console OTP;
  - the production cutover checklist (spec §4.8);
  - the out-of-band migration rule for 0037 (spec Global Constraints);
  - known open items (spec §8).
- `docs/architecture/system.md` § Authentication: replace the Easy Auth paragraph with a short Better Auth description that links to `accounts.md`.
- `docs/operations/deployment-security.md` § Production access: replace "Azure Easy Auth with an allowlisted identity" with Better Auth (Google/email OTP, database sessions, sign-up gate). Keep the rule that personal data uses the authenticated identity.
- `docs/README.md`: link `operations/accounts.md`.
- `CLAUDE.md` environment-variable block: add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM` and `AUTH_SIGNUP_ENABLED`, one comment each.
- `docs/roadmap.md`: one line under current priorities noting that account sub-project 1 is done and sub-project 2 is next.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: pass.

Before running the build, ask the owner whether `npm run build` may run now, since it writes `.next` next to their dev server.

Run: `npm run build`
Expected: success.

Remaining local checks (spec §6), each with pasted evidence:
- **Impersonation.** From the browser console as the owner, call `fetch("/api/auth/admin/impersonate-user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "<member id>" }) })`, then reload → the banner shows "Viewing as …"; Stop → back to the owner.
- **Ban.** `POST /api/auth/admin/ban-user` for the member → the member's open tab reloads to `/login`. Then `unban-user`.
- **Sign-up gate.** Set `AUTH_SIGNUP_ENABLED=false` in `.env.local` and restart → a new email gets no code and sign-in fails with the closed message. Restore it afterwards.
- **OTP rate limit.** The fourth send within 60 s → "Too many attempts". Rate limiting is off in development by default, so temporarily set `rateLimit.enabled: true` locally and do not commit it.

- [ ] **Step 5: Commit**

```bash
git add scripts/account-access-smoke.mts docs CLAUDE.md
git diff --cached --stat
git commit -m "docs: account system operations; adapt the access smoke check"
```

---

## Self-review notes

- **Spec coverage.**
  - §4.1 → Task 3; §4.2–4.3 → Task 4; §4.4 → Task 6; §4.5 → Task 8; §4.6 → Task 7; §4.7 → Task 6; §4.9 → Tasks 1–2 and 9; §6 → the verification steps.
  - §4.8 (production cutover) is documented in Task 9 and executed later by the owner.
- **Deviations from the spec, recorded back into it.**
  - OTP rate limiting uses the email-OTP plugin's built-in limit (3 per 60 s) instead of a `customRules` entry.
  - The admin plugin needs `roles: { admin, member }`.
  - Offline-queue fix 2 (re-flush) is subsumed by fix 1 (send-first): only failed sends are ever queued.
  - `/assets` is a public proxy prefix.
  - Migration 0037 is applied out of band.
