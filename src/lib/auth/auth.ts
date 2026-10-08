import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, anonymous, emailOTP } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { purgeOwnedData } from "@/lib/account/delete";
import { GUEST_DAILY_CAP, GUEST_SIGNINS_PER_IP_PER_HOUR } from "@/lib/access/limits";
import { db } from "@/lib/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/lib/db/schema";
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
      disableSignUp: !signupOpen,
    },
  },
  rateLimit: {
    enabled: rateLimitEnabled(),
    storage: "database",
    modelName: "rateLimits",
    customRules: { "/sign-in/anonymous": { window: 3600, max: GUEST_SIGNINS_PER_IP_PER_HOUR } },
  },
  databaseHooks: {
    user: {
      create: {
        // Backstop for every sign-up path; the provider options above give the friendly errors.
        before: async (user) => {
          if (user.isAnonymous === true) {
            await assertGuestCreationAllowed();
            return { data: user };
          }
          if (!signupOpen) throw new APIError("FORBIDDEN", { message: "Sign-up is currently closed." });
          return { data: user };
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
      disableSignUp: !signupOpen,
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: ({ email, otp }) => sendOtpEmail({ to: email, otp }),
    }),
    admin({ roles: { admin: adminAc, member: userAc }, adminRoles: ["admin"], defaultRole: "member" }),
    anonymous({ generateName: () => "Guest" }),
    nextCookies(), // must stay last
  ],
});
