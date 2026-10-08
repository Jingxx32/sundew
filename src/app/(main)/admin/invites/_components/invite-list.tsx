"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { revokeInviteCode, type InviteRow } from "@/lib/actions/invites";
import { cn } from "@/lib/utils";

const STATUS_LABEL = { active: "Active", expired: "Expired", used_up: "Used up", revoked: "Revoked" } as const;
const day = (date: Date) => date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

export function InviteList({ invites }: { invites: InviteRow[] }) {
  if (!invites.length) return <p className="text-sm text-muted-foreground">No codes yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {invites.map((invite) => <InviteItem key={invite.id} invite={invite} />)}
    </ul>
  );
}

function InviteItem({ invite }: { invite: InviteRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <li className="py-3.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono tracking-wider">{invite.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invite.note || "No note"} · {invite.usedCount}/{invite.maxUses} used · {invite.expiresAt ? `expires ${day(invite.expiresAt)}` : "no expiry"} · created {day(invite.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", invite.status === "active" ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted-foreground")}>
            {STATUS_LABEL[invite.status]}
          </span>
          {invite.status === "active" && (
            <Dialog>
              <DialogTrigger asChild><Button variant="ghost" size="sm">Revoke</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Revoke {invite.code}?</DialogTitle>
                  <DialogDescription>Nobody can create an account with it afterwards. Existing accounts are not affected.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                  <Button variant="danger" disabled={pending} onClick={() => startTransition(() => revokeInviteCode(invite.id))}>Revoke</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {invite.redemptions.length > 0 && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-xs text-accent hover:underline">
          {open ? "Hide" : "Show"} {invite.redemptions.length} redemption{invite.redemptions.length === 1 ? "" : "s"}
        </button>
      )}
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {invite.redemptions.map((r) => <li key={r.email}>{r.email} · {day(r.redeemedAt)}</li>)}
        </ul>
      )}
    </li>
  );
}
