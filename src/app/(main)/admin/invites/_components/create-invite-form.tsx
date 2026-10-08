"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInviteCode } from "@/lib/actions/invites";
import type { ExpiryChoice } from "@/lib/invites/code";

export function CreateInviteForm() {
  const [maxUses, setMaxUses] = useState("1");
  const [expiry, setExpiry] = useState<"none" | "7d" | "30d" | "date">("none");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCopied(false);
    const choice: ExpiryChoice = expiry === "date" ? { date } : expiry;
    startTransition(async () => {
      const result = await createInviteCode({ maxUses: Number(maxUses), expiry: choice, note });
      if (!result.ok) return setError(result.error);
      setCreated(result.code);
      setNote("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Uses</span>
          <Input type="number" min={1} max={500} required value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Expires</span>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as typeof expiry)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <option value="none">Never</option>
            <option value="7d">In 7 days</option>
            <option value="30d">In 30 days</option>
            <option value="date">On a date…</option>
          </select>
        </label>
      </div>
      {expiry === "date" && <Input type="date" required aria-label="Expiry date" value={date} onChange={(e) => setDate(e.target.value)} />}
      <Input placeholder="Note (who it's for)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create code"}</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {created && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3">
          <span className="font-mono text-lg tracking-wider">{created}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(created);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </form>
  );
}
