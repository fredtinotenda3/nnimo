import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAMES } from "@/lib/auth.config";
import { buildContentSecurityPolicy, securityHeaders } from "@/lib/security/csp";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy` and requires a
 * named `proxy` export or a default export.
 *
 * TWO RESPONSIBILITIES, AND ONLY TWO
 *
 * 1. Security headers, including a per-request CSP nonce. This has to happen
 *    here: a nonce is by definition per-request, and next.config.ts headers are
 *    static. Applies to every HTML route.
 *
 * 2. A cheap cookie check that bounces anonymous visitors away from /admin so
 *    they get the login page instead of a flash of chrome.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not verify the session token and it does not check roles. A
 * proxy/middleware layer is the wrong place for the only authorisation check —
 * it can be bypassed by request-header manipulation (CVE-2025-29927 was exactly
 * this class of bug), it cannot see current database state, and it runs before
 * the route knows what it is protecting. The authoritative check is
 * lib/session.ts, called by every admin page, route handler and server action.
 * Phase 5 did not move authorisation here and must not.
 *
 * MATCHER SCOPE CHANGED IN PHASE 5
 *
 * Previously /admin only. Now every route except static assets and image
 * optimisation output, because the headers have to reach the public site too —
 * a CSP that only covers /admin protects the least-visited surface. Static
 * assets are excluded because they are served by the CDN edge and carry no HTML
 * to protect, and adding the proxy to them would cost an invocation per file.
 */

/**
 * 128 bits, base64. Web Crypto rather than node:crypto because this file runs in
 * the edge runtime, where node:crypto is not available.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const nonce = generateNonce();

  const csp = buildContentSecurityPolicy({
    nonce,
    isProduction,
    mediaOrigin: process.env.MEDIA_S3_PUBLIC_URL ?? null,
    paymentOrigin: process.env.PAYMENT_REDIRECT_ORIGIN ?? null,
  });

  // Report-only for one deploy is how you tighten a CSP without a blank page.
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  const headers = securityHeaders({ csp, reportOnly, isProduction });

  /**
   * The nonce travels on the REQUEST headers as well as the response.
   *
   * Next.js reads it back from the request to stamp its own inline bootstrap and
   * flight scripts. Without this, Next's scripts have no nonce, `strict-dynamic`
   * refuses them, and the page does not hydrate. Server components can also read
   * `x-nonce` via headers() if they ever need to emit an inline script.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const isAdmin = request.nextUrl.pathname.startsWith("/admin");

  if (isAdmin) {
    const hasSessionCookie = AUTH_COOKIE_NAMES.some(
      (name) => request.cookies.get(name)?.value,
    );

    if (!hasSessionCookie) {
      const loginUrl = new URL("/login", request.url);
      // Only a path is ever echoed back, and login/actions.ts re-validates it,
      // so a crafted ?next= cannot become an open redirect.
      loginUrl.searchParams.set("next", request.nextUrl.pathname);

      const redirect = NextResponse.redirect(loginUrl);
      for (const [key, value] of Object.entries(headers)) redirect.headers.set(key, value);
      return redirect;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);

  return response;
}

export const config = {
  /**
   * Everything except:
   *   _next/static      build output, immutable, no HTML
   *   _next/image       the image optimiser's own responses
   *   favicon / assets  static files served straight from public/
   *
   * `/media` is excluded too: locally-stored uploads are static files under
   * public/media, and running a proxy invocation per thumbnail on a gallery page
   * is pure cost.
   */
  matcher: [
    "/((?!_next/static|_next/image|media/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)",
  ],
};
