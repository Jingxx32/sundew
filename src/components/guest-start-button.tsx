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
