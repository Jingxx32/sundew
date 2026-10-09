// /assets holds brand images only. public/media (private exam audio) stays behind the gate.
// /api/cron is guarded by CRON_SECRET in the route itself.
const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/assets", "/login"];
// Exact matches only: as a prefix, "/" would open every path.
const PUBLIC_PAGES = ["/"];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PAGES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}
