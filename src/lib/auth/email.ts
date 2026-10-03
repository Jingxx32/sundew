import "server-only";

import { Resend } from "resend";

/** Development prints codes to the server console; production needs Resend configured. */
export function otpEmailConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

export async function sendOtpEmail({ to, otp }: { to: string; otp: string }): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] sign-in code for ${to}: ${otp}`);
    return;
  }
  if (!otpEmailConfigured()) throw new Error("Email sign-in is not configured.");
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.AUTH_EMAIL_FROM!,
    to,
    subject: `${otp} is your Sundew sign-in code`,
    text: `Your Sundew sign-in code is ${otp}.\n\nIt expires in 5 minutes. If you didn't request it, you can ignore this email.`,
    html: `<p>Your Sundew sign-in code is</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>It expires in 5 minutes. If you didn't request it, you can ignore this email.</p>`,
  });
  if (error) {
    // Never log the code itself.
    console.error("[auth] sign-in email failed:", error.name);
    throw new Error("Couldn't send the sign-in code.");
  }
}
