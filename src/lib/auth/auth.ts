import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "@/lib/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/lib/db/schema";
import { sendOtpEmail } from "./email";
import { signupEnabled } from "./signup";

const signupOpen = signupEnabled();

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
  rateLimit: { storage: "database", modelName: "rateLimits" },
  databaseHooks: {
    user: {
      create: {
        // Backstop for every sign-up path; the provider options above give the friendly errors.
        before: async (user) => {
          if (!signupOpen) throw new APIError("FORBIDDEN", { message: "Sign-up is currently closed." });
          return { data: user };
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
    nextCookies(), // must stay last
  ],
});
