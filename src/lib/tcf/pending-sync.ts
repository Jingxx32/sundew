"use client";

import { useSyncExternalStore } from "react";
import { recordTcfExamAttempt, recordTcfQuestionAttempt } from "@/lib/actions/tcf";

/**
 * Both `record*` actions above are called fire-and-forget from the runners —
 * a phone on the LAN can lose the request to a Mac sleep cycle or a dev-server
 * restart invalidating the Server Action id, and the runner's own UI state
 * (streaks, colors) already reflects the answer regardless of whether the
 * write landed. Without this queue that failure is silent and the attempt is
 * gone the moment the tab reloads.
 *
 * This module is a small store outside React (subscribe/notify, no context)
 * so the two runners — which never mount at the same time as each other —
 * and the header's pending-count badge — mounted on every /tcf page — can all
 * reach the same queue without prop-drilling it through the layout.
 */

type DrillPayload = Parameters<typeof recordTcfQuestionAttempt>[0];
type ExamPayload = Parameters<typeof recordTcfExamAttempt>[0];

type PendingItem =
  | { id: string; kind: "drill"; payload: DrillPayload }
  | { id: string; kind: "exam"; payload: ExamPayload };

const STORAGE_KEY = "tcf-pending-sync";
/** Matches the Mac's idle-sleep window closely enough to retry soon after a wake. */
const RETRY_INTERVAL_MS = 30_000;

function sendItem(item: PendingItem): Promise<void> {
  return item.kind === "drill" ? recordTcfQuestionAttempt(item.payload) : recordTcfExamAttempt(item.payload);
}

// crypto.randomUUID() throws outside a secure context — a plain-http LAN
// address (the phone's actual use case) doesn't qualify, so this can't use it.
function localId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readQueue(): PendingItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingItem[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable (private browsing) — the in-memory queue
    // still retries for this tab's lifetime, it just won't survive a reload.
  }
}

let queue: PendingItem[] = [];
let hydrated = false;
let flushing = false;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const callback of subscribers) callback();
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  queue = readQueue();
  window.addEventListener("online", () => void flushPendingSync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushPendingSync();
  });
  window.setInterval(() => void flushPendingSync(), RETRY_INTERVAL_MS);
  if (queue.length > 0) void flushPendingSync();
}

async function enqueueAndTry(item: PendingItem): Promise<void> {
  hydrate();
  try {
    await sendItem(item);
  } catch {
    queue = [...queue, item];
    writeQueue(queue);
    notify();
  }
}

export function submitDrillAttempt(payload: DrillPayload): void {
  void enqueueAndTry({ id: localId(), kind: "drill", payload });
}

export function submitExamAttempt(payload: ExamPayload): void {
  void enqueueAndTry({ id: localId(), kind: "exam", payload });
}

/** Retries every queued item once; each success drops it from the queue, each renewed failure keeps it for the next attempt. */
export async function flushPendingSync(): Promise<void> {
  hydrate();
  if (flushing || queue.length === 0) return;
  flushing = true;
  const remaining: PendingItem[] = [];
  for (const item of queue) {
    try {
      await sendItem(item);
    } catch {
      remaining.push(item);
    }
  }
  queue = remaining;
  writeQueue(queue);
  flushing = false;
  notify();
}

function subscribe(callback: () => void): () => void {
  hydrate();
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot(): number {
  hydrate();
  return queue.length;
}

function getServerSnapshot(): number {
  return 0;
}

export function usePendingSyncCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
