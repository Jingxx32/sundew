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
