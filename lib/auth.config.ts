import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js configuration.
 *
 * This file must not import Prisma or bcrypt: it is the piece that can run in
 * the edge runtime. The Credentials provider (which needs both) lives in
 * lib/auth.ts and is merged on top.
 */
export const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * PHASE 8 (finding L2). Cookie behaviour is now stated rather than inherited.
 *
 * These values are the Auth.js v5 defaults. Nothing about the runtime behaviour
 * changes by writing them down — which is the point: the previous configuration
 * was correct only for as long as those defaults stayed the same, and a silent
 * upstream change to `sameSite` or `httpOnly` on an admin session cookie is not
 * something that should be discoverable only by reading a changelog.
 *
 * WHY THE NAME MATTERS MORE THAN THE FLAGS
 *
 * proxy.ts checks AUTH_COOKIE_NAMES to decide whether to bounce an anonymous
 * visitor away from /admin. If Auth.js ever renamed its cookie, that check would
 * match nothing, every admin request would look anonymous, and every operator
 * would be redirected to /login in a loop — with no error anywhere, because the
 * proxy is behaving exactly as written. Naming the cookie here and asserting the
 * two agree (tests/auth-cookies.test.ts) turns that from a production incident
 * into a failing test.
 *
 * THE NAME IS DELIBERATELY UNCHANGED, so existing sessions survive this deploy.
 * Renaming it would sign every operator out on release; there is no reason to.
 *
 * `useSecureCookies` is left to Auth.js, which derives it from the resolved URL:
 * https → the `__Secure-` prefix and `secure: true`, http → the bare name. Both
 * spellings are in AUTH_COOKIE_NAMES for exactly that reason. Hard-coding
 * `secure: true` here would break local development over http.
 */
const SESSION_COOKIE_NAME = "authjs.session-token";

/** `sameSite: "lax"` and not `"strict"`, deliberately.
 *
 * "strict" would drop the session cookie on any cross-site navigation INTO the
 * admin — following a link from an email to /admin/orders/[id] would land on the
 * login page. "lax" still withholds the cookie from cross-site POSTs, which is
 * the CSRF-relevant case, and Next.js server actions independently verify the
 * Origin against the Host. */
export const AUTH_COOKIE_OPTIONS = {
  sessionToken: {
    name: SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },
} as const;

export const authConfig = {
  // JWT sessions, not database sessions. We deliberately do not install an
  // Auth.js adapter in Phase 1: admin identity lives in our own `User` table,
  // and the adapter's Account/Session/VerificationToken tables are only needed
  // once customers can log in with OAuth (Phase 3).
  //
  // The trade-off of JWT is that a token stays valid until it expires, so
  // deactivating a user would not take effect immediately. lib/session.ts
  // therefore re-reads the User row on every admin request and treats the
  // database — never the token — as authoritative for role and isActive.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login", error: "/login" },
  cookies: AUTH_COOKIE_OPTIONS,
  /**
   * PHASE 8 (finding L2). Vercel is auto-detected by Auth.js, so this changes
   * nothing on the current deployment — but off Vercel, an unset AUTH_URL with no
   * trustHost makes Auth.js refuse to infer the origin, and sign-in fails with an
   * UntrustedHost error that reads like a credentials problem. Stating it means
   * the app is portable to any host that terminates TLS in front of it.
   *
   * Safe because this application is only ever reached through one origin: the
   * platform's own domain. There is no multi-tenant host header to spoof.
   */
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
