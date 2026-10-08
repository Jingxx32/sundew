import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// /assets holds brand images only. public/media (private exam audio) stays behind the gate.
// /api/cron is guarded by CRON_SECRET in the route itself.
const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/assets", "/demo", "/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPageRequest(request: NextRequest): boolean {
  return request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/");
}

/** Optimistic gate: only checks that a session cookie exists. Server code validates it. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!getSessionCookie(request)) {
    if (isPageRequest(request)) {
      const login = new URL("/login", request.url);
      login.searchParams.set("callbackURL", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Lets requirePageUser() return here if the cookie turns out to be stale.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-sundew-path", `${pathname}${search}`);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
