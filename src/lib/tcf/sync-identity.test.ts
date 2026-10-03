import assert from "node:assert/strict";
import test from "node:test";
import { assertSyncAccount, pendingSyncKey } from "./sync-identity";

test("offline answers use separate storage for each account and never the legacy queue", () => {
  assert.notEqual(pendingSyncKey("owner"), pendingSyncKey("test"));
  assert.notEqual(pendingSyncKey("owner"), "tcf-pending-sync");
  assert.throws(() => pendingSyncKey(""));
});

test("a queued answer or stale tab cannot write after a different account signs in", () => {
  assert.doesNotThrow(() => assertSyncAccount("owner", "owner"));
  assert.throws(() => assertSyncAccount("test", "owner"), /ACCOUNT_CHANGED/);
  assert.throws(() => assertSyncAccount("test", ""), /ACCOUNT_CHANGED/);
});
