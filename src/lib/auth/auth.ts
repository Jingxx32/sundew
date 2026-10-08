import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError, addOAuthServerContext, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, anonymous, emailOTP } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { purgeOwnedData } from "@/lib/account/delete";
import { GUEST_DAILY_CAP, GUEST_SIGNINS_PER_IP_PER_HOUR, INVITE_COOKIE } from "@/lib/access/limits";
import { db } from "@/lib/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/lib/db/schema";
import { mayReceiveSignInCode, recordRedemption, reserveInviteUse } from "@/lib/invites/redeem";
import { sendOtpEmail } from "./email";
import { guestAccessEnabled, rateLimitEnabled } from "./guest";
import { signupEnabled } from "./signup";

const signupOpen = signupEnabled();

/** Guests are capped per UTC day; GUEST_ACCESS_ENABLED=false turns them off. */
async function assertGuestCreationAllowed() {
  if (!guestAccessEnabled()) {
    throw new APIError("FORBIDDEN", { code: "GUEST_DISABLED", message: "The demo is currently unavailable." });
  }
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isAnonymous, true), gte(users.createdAt, since)));
  if (n >= GUEST_DAILY_CAP) {
    throw new APIError("FORBIDDEN", { code: "GUEST_CAPACITY", message: "The demo is at capacity today." });
  }
}

/** The invite code for this sign-up: OAuth state on a provider callback, the cookie otherwise (email OTP). */
async function inviteCodeFor(context: { getCookie: (key: string) => string | null } | null): Promise<string | null> {
  const fromState = (await getOAuthState().catch(() => null))?.serverContext?.inviteCode;
  return typeof fromState === "string" ? fromState : (context?.getCookie(INVITE_COOKIE) ?? null);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { users, sessions, accounts, verifications, rateLimits },
  }),
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  // Postgres generates the uuid primary keys (column defaults).
  advanced: { database: { generateId: "uuid" } },
  trustedOrigins: process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  rateLimit: {
    enabled: rateLimitEnabled(),
    storage: "database",
    modelName: "rateLimits",
    customRules: { "/sign-in/anonymous": { window: 3600, max: GUEST_SIGNINS_PER_IP_PER_HOUR } },
  },
  // Google's callback does not carry our cookies; carry the invite code in the signed OAuth state instead.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/social") return;
      const inviteCode = ctx.getCookie(INVITE_COOKIE);
      if (inviteCode) await addOAuthServerContext({ inviteCode });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // The single gate for every sign-up path: guests are capped; everyone else needs an invite.
        before: async (user, context) => {
          if (user.isAnonymous === true) {
            await assertGuestCreationAllowed();
            return { data: user };
          }
          if (!signupOpen) {
            throw new APIError("FORBIDDEN", { code: "SIGNUP_CLOSED", message: "Sign-up is currently closed. Existing accounts can sign in." });
          }
          const code = await inviteCodeFor(context);
          if (!code) {
            throw new APIError("FORBIDDEN", { code: "INVITE_REQUIRED", message: "An invite code is required to create an account." });
          }
          if (!(await reserveInviteUse(code))) {
            throw new APIError("FORBIDDEN", { code: "INVITE_INVALID", message: "This invite code is no longer valid." });
          }
          return { data: user };
        },
        after: async (user, context) => {
          if (user.isAnonymous === true) return;
          const code = await inviteCodeFor(context);
          if (!code) return;
          await recordRedemption(code, user.id);
          // Best effort: the cookie also expires on its own after 10 minutes.
          context?.setCookie(INVITE_COOKIE, "", { maxAge: 0, path: "/" });
        },
      },
      delete: {
        // Owned rows use RESTRICT foreign keys; clear them before Better Auth deletes the user
        // (the anonymous plugin after a guest converts, the admin plugin's removeUser).
        before: async (user) => {
          await purgeOwnedData(user.id);
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      storeOTP: "hashed",
      rateLimit: { window: 60, max: 3 },
      // Without disableSignUp, anyone could request codes for any address; only send to
      // existing accounts or to a new address that holds a valid invite (Resend caps at 100/day).
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        if (type === "sign-in" && !(await mayReceiveSignInCode(email, ctx?.getCookie(INVITE_COOKIE) ?? null))) return;
        await sendOtpEmail({ to: email, otp });
      },
    }),
    admin({ roles: { admin: adminAc, member: userAc }, adminRoles: ["admin"], defaultRole: "member" }),
    anonymous({ generateName: () => "Guest" }),
    nextCookies(), // must stay last
  ],
});
