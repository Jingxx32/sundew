import { AccessProvider } from "@/components/access-context";
import { AccountSession } from "@/components/account-session";
import { GuestBar } from "@/components/guest-bar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { formatGuestExpiry } from "@/lib/access/limits";
import { requirePageUser } from "@/lib/auth/session";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();
  const account =
    user.access === "guest" && user.guestExpiresAt
      ? { primary: "Guest", secondary: `Expires ${formatGuestExpiry(user.guestExpiresAt)}` }
      : { primary: user.email, secondary: user.access === "admin" ? "Administrator" : "Member" };

  return (
    <AccountSession userId={user.id}>
      <AccessProvider access={user.access}>
        <div className="flex min-h-screen">
          <a
            href="#main-content"
            className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Skip to content
          </a>
          <Sidebar account={account} access={user.access} />
          <main id="main-content" className="min-w-0 flex-1 pb-20 md:pb-0">
            {user.impersonatedBy && <ImpersonationBanner email={user.email} />}
            {user.access === "guest" && user.guestExpiresAt && <GuestBar expiresAt={user.guestExpiresAt} />}
            {children}
          </main>
        </div>
      </AccessProvider>
    </AccountSession>
  );
}
