export type AppIdentity = {
  subject: string;
  email: string;
  provider: "google" | "aad" | "development";
};

export type AuthDecision =
  | { ok: true; identity: AppIdentity }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "misconfigured" };

export type AuthConfig = {
  nodeEnv?: string;
  mode?: string;
  provider?: string;
  allowedEmails?: string;
  adminEmails?: string;
  devEmail?: string;
};

type ProductionAuthProvider = Exclude<AppIdentity["provider"], "development">;

function configuredProvider(value: string | undefined): ProductionAuthProvider | null {
  const provider = value?.trim().toLowerCase() || "google";
  return provider === "google" || provider === "aad" ? provider : null;
}

export function authLoginPath(config: Pick<AuthConfig, "provider">): string | null {
  const provider = configuredProvider(config.provider);
  return provider ? `/.auth/login/${provider}` : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function allowedEmailSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter((item): item is string => item !== null),
  );
}

/**
 * Resolve the identity asserted by the deployment authentication boundary.
 *
 * Azure App Service / Container Apps authentication removes client-supplied
 * X-MS-CLIENT-PRINCIPAL-* headers before adding its own. Production deployment
 * must keep that platform authentication enabled and prevent direct origin
 * access; these headers are not self-verifying credentials.
 */
export function resolveRequestIdentity(
  requestHeaders: Pick<Headers, "get">,
  config: AuthConfig,
): AuthDecision {
  if (config.nodeEnv !== "production") {
    const email = normalizeEmail(config.devEmail) ?? "developer@localhost";
    return {
      ok: true,
      identity: { subject: `dev:${email}`, email, provider: "development" },
    };
  }

  if (config.mode !== "azure-easy-auth") {
    return { ok: false, reason: "misconfigured" };
  }

  const provider = configuredProvider(config.provider);
  if (!provider) {
    return { ok: false, reason: "misconfigured" };
  }

  const subject = requestHeaders.get("x-ms-client-principal-id")?.trim();
  const email = normalizeEmail(requestHeaders.get("x-ms-client-principal-name"));
  const assertedProvider = requestHeaders.get("x-ms-client-principal-idp")?.trim().toLowerCase();
  if (!subject || !email || !assertedProvider) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (assertedProvider !== provider) return { ok: false, reason: "forbidden" };

  const allowed = allowedEmailSet(config.allowedEmails);
  // Until every learning-history table has an owner column, the private app
  // deliberately supports one production identity only.
  if (allowed.size !== 1) {
    return { ok: false, reason: "misconfigured" };
  }
  const admins = allowedEmailSet(config.adminEmails);
  if (!admins.has([...allowed][0])) {
    return { ok: false, reason: "misconfigured" };
  }
  if (!allowed.has(email)) {
    return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    identity: { subject, email, provider },
  };
}

export function authConfigFromEnv(): AuthConfig {
  return {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.APP_AUTH_MODE,
    provider: process.env.APP_AUTH_PROVIDER,
    allowedEmails: process.env.APP_ALLOWED_EMAILS,
    adminEmails: process.env.APP_ADMIN_EMAILS,
    devEmail: process.env.DEV_AUTH_EMAIL,
  };
}
