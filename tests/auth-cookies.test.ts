import { describe, expect, it } from "vitest";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_OPTIONS, authConfig } from "@/lib/auth.config";

/**
 * Regression tests for Phase 8 finding L2.
 *
 * THE FAILURE MODE THIS EXISTS TO CATCH
 *
 * proxy.ts decides whether a visitor to /admin is anonymous by looking for one of
 * AUTH_COOKIE_NAMES. Auth.js decides what to actually name the cookie. Those were
 * two independent sources of truth: if the Auth.js default were ever renamed, the
 * proxy's check would match nothing, every admin request would look anonymous, and
 * every operator would be redirected to /login forever — with nothing logged
 * anywhere, because the proxy would be doing precisely what it was written to do.
 *
 * Phase 8 made the name explicit in `authConfig.cookies` instead of inherited. The
 * assertions below are what make the two halves stay in agreement.
 *
 * Note what is NOT asserted: `secure`. Auth.js derives it from the resolved URL so
 * that local development over http still works, which is why both the bare and
 * `__Secure-`-prefixed spellings appear in AUTH_COOKIE_NAMES.
 */
describe("auth cookie configuration", () => {
  it("configures the session cookie explicitly rather than inheriting the default", () => {
    expect(authConfig.cookies).toBe(AUTH_COOKIE_OPTIONS);
    expect(AUTH_COOKIE_OPTIONS.sessionToken.name).toBeTruthy();
  });

  it("keeps the configured cookie name in AUTH_COOKIE_NAMES, which proxy.ts checks", () => {
    const configured = AUTH_COOKIE_OPTIONS.sessionToken.name;
    expect(AUTH_COOKIE_NAMES).toContain(configured);
  });

  it("also lists the __Secure- prefixed spelling used over https", () => {
    const configured = AUTH_COOKIE_OPTIONS.sessionToken.name;
    expect(AUTH_COOKIE_NAMES).toContain(`__Secure-${configured}`);
  });

  it("keeps the name unchanged from the pre-Phase-8 value, so no operator is signed out", () => {
    // Changing this string is a deliberate act that signs out every existing
    // session on deploy. If this test fails, that is the question to answer.
    expect(AUTH_COOKIE_OPTIONS.sessionToken.name).toBe("authjs.session-token");
  });

  it("marks the session cookie HttpOnly", () => {
    // A session token readable from document.cookie turns any XSS into full
    // account takeover.
    expect(AUTH_COOKIE_OPTIONS.sessionToken.options.httpOnly).toBe(true);
  });

  it("uses SameSite=Lax", () => {
    // Withholds the cookie from cross-site POSTs without breaking a cross-site
    // navigation into /admin from an email link. "strict" would break the latter.
    expect(AUTH_COOKIE_OPTIONS.sessionToken.options.sameSite).toBe("lax");
  });

  it("scopes the cookie to the whole origin", () => {
    expect(AUTH_COOKIE_OPTIONS.sessionToken.options.path).toBe("/");
  });

  it("trusts the platform host so sign-in works without AUTH_URL off Vercel", () => {
    expect(authConfig.trustHost).toBe(true);
  });

  it("keeps JWT sessions bounded to a working day", () => {
    // Deactivation is handled by lib/session.ts re-reading the User row, so this
    // is a backstop rather than the control — but an unbounded admin session is
    // still not something to inherit silently.
    expect(authConfig.session?.maxAge).toBe(60 * 60 * 8);
  });

  it("installs no OAuth providers in the edge-safe half", () => {
    // The Credentials provider is merged in lib/auth.ts, which imports Prisma and
    // bcrypt and therefore cannot run at the edge. If a provider appears here,
    // that separation has been broken.
    expect(authConfig.providers).toHaveLength(0);
  });
});
