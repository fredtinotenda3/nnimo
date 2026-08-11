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
