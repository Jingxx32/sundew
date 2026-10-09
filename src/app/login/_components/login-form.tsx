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

/** Google's "G", in its brand colours, as its sign-in guidelines allow. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
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
    <div className="mt-7 space-y-4">
      <Button variant="outline" size="lg" className="w-full" disabled={pending} onClick={continueWithGoogle}>
        <GoogleMark />
        Continue with Google
      </Button>
      {otpAvailable && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-11"
                aria-label="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" variant="strong" size="lg" className="w-full" disabled={pending || !email}>
                Email me a code
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
                className="h-11 text-center font-mono tracking-[0.3em]"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              />
              <Button type="submit" variant="strong" size="lg" className="w-full" disabled={pending || otp.length !== 6}>
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
