import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatGuestExpiry } from "@/lib/access/limits";
import { SOURCE_URL } from "@/lib/site";

const LINK = "font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** Tells a guest where they are on every page, with a way back to the homepage and the source. */
export function GuestBar({ expiresAt }: { expiresAt: Date }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent-soft px-4 py-2 text-sm text-accent">
      <span>
        <strong className="font-semibold">Sample workspace</strong>
        <span className="hidden sm:inline"> — explore freely. This demo account is deleted on {formatGuestExpiry(expiresAt)}.</span>
      </span>
      <span aria-hidden="true">·</span>
      <Link href="/" className={LINK}>Homepage</Link>
      <span aria-hidden="true">·</span>
      <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-0.5 ${LINK}`}>
        Source
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}
