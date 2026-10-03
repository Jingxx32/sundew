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
