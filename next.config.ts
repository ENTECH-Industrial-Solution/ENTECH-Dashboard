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
      // i.ytimg.com serves the poster frame inside the YouTube embed, and that
      // request is measured against *this* policy rather than YouTube's —
      // verified by removing the host and watching the frame report
      // "violates ... img-src 'self' data: blob:" while seven Google Maps
      // frames on the same page reported nothing. Images only, one host.
      //
      // tile.openstreetmap.org is the customer map's basemap, and it earns its
      // place on exactly the terms i.ytimg.com does: **images only**. Leaflet
      // itself is bundled from node_modules, so no script host is opened; the
      // tiles are <img> requests and nothing else, and the URLs are composed by
      // Leaflet from the z/x/y of the current view — there is no pasted value
      // anywhere in the path. The alternative was Google's JS Maps API, which
      // would need script-src, connect-src, an API key, and a bill.
      //
      // It is the *only* basemap host, and the map's three looks are CSS
      // filters over these same tiles rather than three providers — see
      // src/lib/basemaps.ts, which records what happened when a second host was
      // tried. A fourth style that wants one has to argue for it there first.
      "img-src 'self' data: blob: https://i.ytimg.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
      "font-src 'self' data:",
      // The dev server pushes HMR updates over a websocket.
      isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
      // Three framed hosts, and every one of them earns its place the same way:
      // frames only — no scripts, no connections — and the src is always built
      // by our own code from an id or a place name, never from a URL somebody
      // pasted. So none of these can be pointed at arbitrary content even
      // within their own origin.
      //
      //   www.google.com          — the trip map        (src/lib/maps.ts)
      //   www.youtube-nocookie.com — a video evidence link, cookie-free until
      //                              playback starts    (src/lib/video.ts)
      //   drive.google.com        — the same, for a Drive file. Drive enforces
      //                              its own sharing rules inside the frame.
      //
      // Anything this app cannot positively recognise stays a plain link, which
      // is the fallback that keeps this list from ever needing to grow.
      "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com https://drive.google.com",
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
