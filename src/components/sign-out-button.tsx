"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SignOutButton({ className, label = "Sign out" }: { className?: string; label?: string }) {
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
      {label}
    </Button>
  );
}
