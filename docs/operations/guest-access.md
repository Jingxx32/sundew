# Guest access and invites

Status: shipped with `feat/guest-access`. Updated 2026-10-08.

Three access levels: **guest** (one-click anonymous account, limited features, deleted after 7 days), **full** (invite code, Google or email code), **admin** (the owner). Code map is in `CLAUDE.md` under "Access levels".

## Sign-up behavior

- A new account needs an invite code. Google sign-up carries the code through Better Auth's signed OAuth state; email-code sign-up reads the `sundew_invite` cookie (10 minutes).
- Sign-in codes by email go only to existing accounts, or to new addresses that hold a valid invite cookie.
- A guest who signs up with a code is converted to a full account.

## Create an invite

Open `/admin/invites`. Codes are plaintext and revocable; revoking stops new sign-ups with that code, not existing accounts.

## Turn guests off

Set `GUEST_ACCESS_ENABLED=false` in Vercel (Production) and redeploy. The button disappears and guest creation is rejected. Existing guests keep working until the cleanup deletes them.

## Stop all sign-ups

Set `AUTH_SIGNUP_ENABLED=false` in Vercel and redeploy. No new accounts, with or without a code. Unset means `true`.

## Cleanup job

- Route: `/api/cron/cleanup-guests`, Vercel Cron, daily at 09:00 UTC (`vercel.json`). It needs `CRON_SECRET`; without it the route returns 401.
- Each run deletes at most 100 guests older than 7 days, oldest first. Each guest is re-checked right before deletion (still anonymous, still past the cutoff).
- It logs `guest cleanup {…}` in Vercel logs and returns `{ deleted, failed, skipped, totals }`. `failed` rows are retried by the next run.
- Run it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://sundew.jingxuanxu.com/api/cron/cleanup-guests
```

## After a migration

Run `npm run sample:check` (seeds and deletes the sample workspace in a rolled-back transaction). Also run it before deploys.

If it fails, the fixtures no longer match the schema:

1. Sign in locally as `sample-author@example.com` (the email code prints in the dev console).
2. Re-run `npm run sample:export -- --email sample-author@example.com`. This rewrites `src/lib/sample-workspace/fixtures/workspace.json`.
3. Run `npm run sample:lookups -- --yes` only if the sample texts changed. It calls OpenAI and costs tokens.

Drafts live in `src/lib/sample-workspace/source/`; `data/` is gitignored.

## Limits

- 3 guest sign-ins per IP per hour; 200 guests per UTC day.
- Guests are deleted 7 days after creation.
- Invite-code checks are rate limited (10 per 10 minutes).
