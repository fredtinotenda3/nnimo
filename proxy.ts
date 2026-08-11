import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAMES } from "@/lib/auth.config";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy` and requires a
 * named `proxy` export or a default export.
 *
 * Scope, deliberately narrow: this only bounces visitors with no session cookie
 * away from /admin so they get the login page instead of a flash of chrome. It
 * does NOT verify the token and it does NOT check roles.
 *
 * Reason: a proxy/middleware layer is the wrong place for the only
 * authorisation check — it can be bypassed by request-header manipulation
 * (CVE-2025-29927 was exactly this class of bug), it cannot see the current
 * database state, and it runs before the route knows what it is protecting.
 * The authoritative check is lib/session.ts, called by every admin page,
 * route handler and server action.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = AUTH_COOKIE_NAMES.some(
    (name) => request.cookies.get(name)?.value,
  );

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Only /admin. Static assets, the auth endpoints and the public site are all
  // excluded so nothing else pays the cost.
  matcher: ["/admin", "/admin/:path*"],
};
