import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware — a cheap first filter, NOT the authorization boundary.
 *
 * It runs on the Edge runtime where Prisma and Argon2 are unavailable, so it
 * can only see whether a session cookie exists, never whether it is valid. Real
 * enforcement lives in lib/auth/rbac.ts, which every page and server action
 * calls. Treat anything here as an optimisation that keeps anonymous traffic
 * from reaching the database.
 */

const SESSION_COOKIE = "entech_session";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Deliberately no "cookie present -> bounce away from /login" branch here:
  // a present cookie can still be stale/revoked, and middleware cannot tell
  // (see file header). /login's own page component already redirects real,
  // validated sessions to /dashboard; doing it here too fought that check on
  // an invalid cookie and produced an infinite redirect loop.

  const response = NextResponse.next();

  // Defence in depth: these also come from next.config.ts headers(), but a
  // middleware-produced response would otherwise skip that pipeline.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except Next internals, the favicon, and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
