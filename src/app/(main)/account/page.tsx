import { headers } from "next/headers";
import { UserRound } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { formatGuestExpiry } from "@/lib/access/limits";
import { auth } from "@/lib/auth/auth";
import { requirePageUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser();
  if (user.access === "guest") {
    return (
      <div className="mx-auto max-w-2xl px-10 py-10">
        <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Account</h1>
        <p className="mb-10 text-sm text-muted-foreground">You&apos;re exploring Sundew with a demo account.</p>
        <section className="space-y-5 rounded-2xl bg-surface p-6 shadow-card">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Guest</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This demo account and its sample data are deleted on {formatGuestExpiry(user.guestExpiresAt!)}.
              </p>
            </div>
          </div>
          <SignOutButton label="End demo" />
        </section>
      </div>
    );
  }
  const linked = await auth.api.listUserAccounts({ headers: await headers() });
  const google = linked.some((account) => account.providerId === "google");

  return (
    <div className="mx-auto max-w-2xl px-10 py-10">
      <h1 className="mb-1 text-[38px] font-bold tracking-[-0.035em]">Account</h1>
      <p className="mb-10 text-sm text-muted-foreground">Your sign-in and the learning history that belongs to it.</p>
      <section className="space-y-5 rounded-2xl bg-surface p-6 shadow-card">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">{user.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user.role === "admin" ? "Administrator" : "Member"}</p>
          </div>
        </div>
        <div className="text-sm">
          <p className="font-medium">Sign-in methods</p>
          <p className="mt-1 text-muted-foreground">Email code{google ? " · Google" : ""}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Documents, answers, vocabulary, feedback and recordings belong to this account. The TCF question bank is shared.
        </p>
        <SignOutButton />
      </section>
    </div>
  );
}
