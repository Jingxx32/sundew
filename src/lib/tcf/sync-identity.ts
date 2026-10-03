export function pendingSyncKey(owner: string): string {
  if (!owner) throw new Error("An account is required for pending answers.");
  return `tcf-pending-sync:${owner}`;
}

/** A comparison only: the authenticated server identity always owns the write. */
export function assertSyncAccount(authenticatedId: string, expectedId?: string): void {
  if (expectedId !== undefined && expectedId !== authenticatedId) throw new Error("ACCOUNT_CHANGED");
}
