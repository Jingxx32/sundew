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
