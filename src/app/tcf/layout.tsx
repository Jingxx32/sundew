import { Suspense } from "react";
import { TcfHeader } from "./_components/tcf-header";
import { AccountSession } from "@/components/account-session";
import { requirePageUser } from "@/lib/auth/session";

export default async function TcfLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  return (
    <AccountSession userId={user.id}>
      <div className="flex min-h-screen flex-col">
        <a
          href="#tcf-main-content"
          className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Aller à l’exercice
        </a>
        <Suspense fallback={<div className="h-[53px] border-b border-border/60" />}>
          <TcfHeader />
        </Suspense>
        {/* Width is each page's own call (drill/exam ~5xl, review ~6xl) —
            the layout only owns vertical rhythm. */}
        <main id="tcf-main-content" className="flex-1 px-4 py-5 md:px-10 md:py-10">{children}</main>
      </div>
    </AccountSession>
  );
}
