"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function ImpersonationBanner({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-warning-soft px-4 py-2 text-sm text-warning">
      <span>Viewing as {email}</span>
      <button
        type="button"
        disabled={pending}
        className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
        onClick={async () => {
          setPending(true);
          await authClient.admin.stopImpersonating();
          window.location.assign("/account");
        }}
      >
        Stop
      </button>
    </div>
  );
}
