import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { FEATURES, type FeatureKey } from "@/lib/access/features";

/** Why a guest can't use this control, with a quiet way in for friends who have a code. */
export function MembersOnlyNote({ feature, className = "" }: { feature: FeatureKey; className?: string }) {
  return (
    <p className={`inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground ${className}`}>
      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
      Members only — {FEATURES[feature].memberReason}{" "}
      <Link href="/account#invite" className="text-accent hover:underline">Have a code?</Link>
    </p>
  );
}
