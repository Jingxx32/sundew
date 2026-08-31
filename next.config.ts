import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) resolves its worker file at runtime — bundling breaks it
  serverExternalPackages: ["pdf-parse"],
  // Phone access over the LAN (`npm run dev:lan`). Next blocks dev-only assets
  // and endpoints requested from an origin other than the one the server was
  // started with, so the Mac's LAN address has to be listed here or /_next and
  // HMR fail while the page itself loads. DHCP may hand out a different address
  // — update this when it does. Dev-only: `next build` ignores it.
  allowedDevOrigins: ["192.168.2.66"],
};

export default nextConfig;
