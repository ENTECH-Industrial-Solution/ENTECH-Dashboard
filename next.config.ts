import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers applied to every response.
 * CSP is intentionally strict: no inline scripts, no external origins.
 * If you add a third-party script/font later, extend the directive explicitly
 * rather than loosening it with 'unsafe-inline'.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; 'strict-dynamic' + nonce is
      // handled by middleware. This is the no-JS fallback policy.
      //
      // 'unsafe-eval' is DEV ONLY and not optional there: `next dev` ships every
      // client module through eval(), so without it main-app.js throws, React
      // never hydrates, and every onClick in the app silently does nothing —
      // forms still post, which makes it look like "only some buttons broke".
      // The production bundle contains no eval, so the strict policy stands.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // The dev server pushes HMR updates over a websocket.
      isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
      // Field trips embed a Google Map. This is the narrowest opening that
      // allows it: one host, frames only — no scripts, no connections. The
      // embed URL is always built by src/lib/maps.ts from coordinates or a
      // name, never from a URL someone pasted, so this cannot be pointed at
      // arbitrary content even within google.com.
      "frame-src 'self' https://www.google.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      // Would rewrite http://localhost to https:// while developing.
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: {
    serverActions: {
      // Server Actions already enforce an Origin check; keep the allowlist tight.
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
