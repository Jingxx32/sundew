import Link from "next/link";
import { cookies } from "next/headers";
import { SundewLogo } from "@/components/sundew-logo";
import { GuestStartButton } from "@/components/guest-start-button";
import { InviteCodeForm } from "@/components/invite-code-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { INVITE_COOKIE } from "@/lib/access/limits";
import { safeCallbackPath } from "@/lib/auth/callback-path";
import { otpEmailConfigured } from "@/lib/auth/email";
import { guestAccessEnabled } from "@/lib/auth/guest";
import { getCurrentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string; error?: string }>;
}) {
  const { callbackURL, error } = await searchParams;
  const callbackPath = safeCallbackPath(callbackURL);
  const user = await getCurrentUser();
  const inviteAccepted = Boolean((await cookies()).get(INVITE_COOKIE)?.value);
  // Guests stay on the form: signing in or creating an account converts them.
  const member = user && user.access !== "guest" ? user : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Link href="/demo" className="mb-10 w-fit">
        <SundewLogo className="text-[30px]" priority />
      </Link>
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">
          {inviteAccepted && !member ? "Create your account" : "Welcome to Sundew"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {inviteAccepted && !member
            ? "Your invite code is ready. Continue with Google or an email code."
            : "Your French practice, saved to your account."}
        </p>
        {member ? (
          <div className="mt-6 space-y-4">
            <p className="break-all text-sm">Signed in as {member.email}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={callbackPath}>Continue</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
        ) : (
          <LoginForm
            mode={inviteAccepted ? "create" : "sign-in"}
            callbackPath={callbackPath}
            otpAvailable={otpEmailConfigured()}
            signupOpen={signupEnabled()}
            initialError={error ?? null}
          />
        )}
        {!member && !inviteAccepted && (
          <div className="mt-6 border-t border-border pt-6">
            <InviteCodeForm />
          </div>
        )}
        {!user && guestAccessEnabled() && (
          <div className="mt-6 border-t border-border pt-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Just looking around? Open a demo account with sample data — no sign-up, deleted after 7 days.
            </p>
            <GuestStartButton variant="outline" className="w-full" />
          </div>
        )}
      </section>
      <Link href="/demo" className="mt-6 text-center text-sm text-muted-foreground hover:text-accent">
        Explore the public demo
      </Link>
    </main>
  );
}
