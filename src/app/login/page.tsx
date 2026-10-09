import Link from "next/link";
import { cookies } from "next/headers";
import { SundewLogo } from "@/components/sundew-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { GlowBackdrop } from "@/components/theme/glow-backdrop";
import { GlowTheme } from "@/components/theme/glow-theme";
import { Button } from "@/components/ui/button";
import { INVITE_COOKIE } from "@/lib/access/limits";
import { safeCallbackPath } from "@/lib/auth/callback-path";
import { otpEmailConfigured } from "@/lib/auth/email";
import { getCurrentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup";
import { InviteDisclosure } from "./_components/invite-disclosure";
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
  const creating = inviteAccepted && !member;

  return (
    <GlowTheme className="flex flex-col items-center justify-center px-5 py-20">
      <GlowBackdrop placement="centered" />
      <main className="relative w-full max-w-[400px]">
        <section className="relative rounded-[28px] bg-surface/90 px-7 pb-8 pt-16 shadow-[var(--shadow-float)] backdrop-blur sm:px-9">
          <Link
            href="/"
            aria-label="Sundew home"
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <SundewLogo wordmark={false} priority className="text-[48px] drop-shadow-[var(--drop-brand)]" />
          </Link>
          <div className="text-center">
            <h1 className="font-display text-[32px] font-extrabold tracking-[-0.025em]">
              {member ? "You're signed in" : creating ? "Create your account" : "Welcome back"}
            </h1>
            {!member && (
              <p className="mt-2 text-[15px] text-muted-foreground">
                {creating
                  ? "Your invite code is ready. Continue with Google or an email code."
                  : "Your French practice, right where you left it."}
              </p>
            )}
          </div>
          {member ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="break-all text-sm text-muted-foreground">Signed in as {member.email}</p>
              <div className="flex flex-wrap justify-center gap-3">
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
          {!member && !inviteAccepted && signupEnabled() && (
            <div className="mt-6 border-t border-border pt-5">
              <InviteDisclosure />
            </div>
          )}
        </section>
        {!member && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to Sundew?{" "}
            <Link href="/" className="font-semibold text-primary hover:underline">
              Take the 3-minute tour →
            </Link>
          </p>
        )}
      </main>
    </GlowTheme>
  );
}
