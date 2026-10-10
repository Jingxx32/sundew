import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16 sm:px-8">
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">404</p>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.025em]">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The link may be old, or the item was deleted. Guest demo data is removed after seven days.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/today">Go to Today</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Homepage</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
