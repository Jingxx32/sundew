import { AccountSession } from "@/components/account-session";
import { Sidebar } from "@/components/sidebar";
import { requirePageUser } from "@/lib/auth/session";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();

  return (
    <AccountSession userId={user.id}>
      <div className="flex min-h-screen">
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Skip to content
        </a>
        <Sidebar />
        <main id="main-content" className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </AccountSession>
  );
}
