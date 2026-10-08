"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, anonymousClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [emailOTPClient(), adminClient(), anonymousClient()] });
