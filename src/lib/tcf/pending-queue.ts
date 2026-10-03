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
