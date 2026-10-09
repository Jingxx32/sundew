import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) resolves its worker file at runtime — bundling breaks it;
  // @napi-rs/canvas is its native DOMMatrix polyfill (see src/lib/pdf/extract.ts)
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  // …and file tracing can't see that runtime path, so ship the package's dist as-is.
  outputFileTracingIncludes: { "/**": ["./node_modules/pdf-parse/dist/**"] },
  // Phone access over the LAN (`npm run dev:lan`). Next blocks dev-only assets
  // and endpoints requested from an origin other than the one the server was
  // started with, so the Mac's LAN address has to be listed here or /_next and
  // HMR fail while the page itself loads. DHCP may hand out a different address
  // — update this when it does. Dev-only: `next build` ignores it.
  allowedDevOrigins: ["192.168.2.66"],
  // The public demo became the landing page at / (2026-10).
  async redirects() {
    return [{ source: "/demo", destination: "/", permanent: true }];
  },
};

export default nextConfig;
