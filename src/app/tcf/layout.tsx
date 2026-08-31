import { Suspense } from "react";
import { TcfHeader } from "./_components/tcf-header";

export default function TcfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<div className="h-[53px] border-b border-border/60" />}>
        <TcfHeader />
      </Suspense>
      {/* Width is each page's own call (drill/exam ~5xl, review ~6xl) —
          the layout only owns vertical rhythm. */}
      <main className="flex-1 px-4 py-5 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
