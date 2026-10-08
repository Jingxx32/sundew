import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function InviteOnlyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
      Invite only —{" "}
      <Link href="/account#invite" className="text-accent hover:underline">have a code?</Link>
    </p>
  );
}
