const FALLBACK = "/today";
const BASE = "http://sundew.invalid";

/** Post-sign-in destination: same-origin relative paths only, never back to /login. */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return FALLBACK;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || url.pathname === "/login" || url.pathname.startsWith("/login/")) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
