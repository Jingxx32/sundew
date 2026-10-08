"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInviteCode, type InviteCheckResult } from "@/lib/actions/invites";

const MESSAGES: Record<Exclude<InviteCheckResult["status"], "ok">, string> = {
  invalid: "That code isn't valid. Check it and try again.",
  expired: "This invite code has expired.",
  used_up: "This invite code has already been used.",
  revoked: "This invite code is no longer valid.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
};

/** Checks a code, then continues to account creation: `next` navigates, otherwise the page refreshes in place. */
export function InviteCodeForm({ next }: { next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await checkInviteCode(code);
    if (result.status !== "ok") {
      setPending(false);
      return setError(MESSAGES[result.status]);
    }
    if (next) window.location.assign(next);
    else router.refresh();
  }

  return (
    <form id="invite" onSubmit={submit} className="scroll-mt-8 space-y-3">
      <label htmlFor="invite-code" className="text-sm font-medium">Have an invite code?</label>
      <Input
        id="invite-code"
        autoComplete="off"
        placeholder="XXXX-XXXX"
        className="font-mono uppercase tracking-wider"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" variant="outline" className="w-full" disabled={pending || code.trim().length < 8}>
        {pending ? "Checking…" : "Use invite code"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
