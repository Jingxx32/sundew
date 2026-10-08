"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearInviteCode } from "@/lib/actions/invites";
import { authClient } from "@/lib/auth/client";

const MESSAGES: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the latest email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Send a new code.",
  BANNED_USER: "This account has been disabled.",
  INVITE_REQUIRED: "An invite code is required to create an account.",
  INVITE_INVALID: "This invite code is no longer valid.",
  SIGNUP_CLOSED: "Sign-up is currently closed. Existing accounts can sign in.",
};
const FALLBACK = "Something went wrong. Please try again.";

function messageFor(error: { code?: string; status?: number }): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

export function LoginForm({
  mode,
  callbackPath,
  otpAvailable,
  signupOpen,
  initialError,
}: {
  mode: "sign-in" | "create";
  callbackPath: string;
  otpAvailable: boolean;
  signupOpen: boolean;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (MESSAGES[initialError] ?? "Google sign-in didn't complete. Please try again.") : null,
  );

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackPath,
      errorCallbackURL: `/login?callbackURL=${encodeURIComponent(callbackPath)}`,
    });
    if (error) {
      setError(messageFor(error));
      setPending(false);
    }
  }

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setPending(false);
    if (error) return setError(messageFor(error));
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    if (error) {
      setPending(false);
      return setError(messageFor(error));
    }
    window.location.assign(callbackPath);
  }

  return (
    <div className="mt-6 space-y-5">
      <Button className="w-full" disabled={pending} onClick={continueWithGoogle}>
        Continue with Google
      </Button>
      {otpAvailable && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use an email code
            <span className="h-px flex-1 bg-border" />
          </div>
          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-label="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" variant="outline" className="w-full" disabled={pending || !email}>
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code sent to {email}. It expires in 5 minutes.
              </p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                aria-label="Sign-in code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              />
              <Button type="submit" className="w-full" disabled={pending || otp.length !== 6}>
                Sign in
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-accent"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                }}
              >
                Use a different email or send a new code
              </button>
            </form>
          )}
        </>
      )}
      {mode === "create" && (
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-accent"
          onClick={async () => {
            await clearInviteCode();
            router.refresh();
          }}
        >
          Use a different invite code
        </button>
      )}
      {!signupOpen && (
        <p className="text-xs leading-5 text-muted-foreground">
          Sign-up is currently closed. Existing accounts can sign in.
        </p>
      )}
      {mode === "sign-in" && signupOpen && (
        <p className="text-xs leading-5 text-muted-foreground">
          New here? You&apos;ll need an invite code to create an account.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
