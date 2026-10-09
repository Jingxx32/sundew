import Link from "next/link";
import { GuestStartButton } from "@/components/guest-start-button";
import { Button, type ButtonProps } from "@/components/ui/button";
import { guestAccessEnabled } from "@/lib/auth/guest";

const SIZE = "h-[52px] px-7";

/** The recruiter path: a 7-day guest account, or sign-in when guests are off. */
export function GuestCta({ variant = "default" }: { variant?: ButtonProps["variant"] }) {
  if (!guestAccessEnabled()) {
    return (
      <Button asChild size="lg" variant={variant} className={SIZE}>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="grid">
      <GuestStartButton size="lg" variant={variant} className={SIZE}>Try the full app</GuestStartButton>
      {/* w-0 + min-w-full: wrap to the button's width instead of widening the row. */}
      <p className="mt-2 w-0 min-w-full text-xs leading-5 text-muted-foreground">No sign-up · sample data · deleted after 7 days</p>
    </div>
  );
}
