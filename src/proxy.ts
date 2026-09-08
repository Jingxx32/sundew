import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  authConfigFromEnv,
  authLoginPath,
  resolveRequestIdentity,
} from "@/lib/auth/identity";

const PUBLIC_PREFIXES = ["/.auth", "/demo", "/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPageRequest(request: NextRequest): boolean {
  return request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/");
}

export function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const authConfig = authConfigFromEnv();
  const decision = resolveRequestIdentity(request.headers, authConfig);
  if (decision.ok) return NextResponse.next();

  if (decision.reason === "misconfigured") {
    return new NextResponse("Authentication is not configured.", { status: 503 });
  }

  if (decision.reason === "unauthenticated" && isPageRequest(request)) {
    const loginPath = authLoginPath(authConfig);
    if (!loginPath) {
      return new NextResponse("Authentication is not configured.", { status: 503 });
    }
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set(
      "post_login_redirect_uri",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return Response.json(
    { error: decision.reason === "forbidden" ? "forbidden" : "unauthenticated" },
    { status: decision.reason === "forbidden" ? 403 : 401 },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
