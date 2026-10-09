"use client";

import { useEffect, useState } from "react";
import { InviteCodeForm } from "@/components/invite-code-form";

/** Keeps the invite form out of the way until someone says they have a code. */
export function InviteDisclosure({ next }: { next?: string }) {
  const [open, setOpen] = useState(false);
  // The toggle unmounts on open; hand focus to the field instead of losing it.
  useEffect(() => {
    if (open) document.getElementById("invite-code")?.focus();
  }, [open]);
  if (open) return <InviteCodeForm next={next} />;
  return (
    <p className="text-center text-sm text-muted-foreground">
      Have an invite code?{" "}
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOpen(true)}>
        Create an account
      </button>
    </p>
  );
}
