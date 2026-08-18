import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_SITE_URL,
  SiteUrlConfigurationError,
  resolveSiteUrl,
} from "@/lib/site-url";

/**
 * Regression tests for Phase 8 finding H1.
 *
 * The bug being locked out: three call sites each wrote
 * `process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`, so an unset or
 * mistyped variable in production produced a sitemap, a set of canonical tags and
 * a robots.txt full of localhost URLs — with no error, no log line, and no symptom
 * until a crawler had already indexed the site wrongly.
 *
 * The property under test is therefore specifically that production REFUSES,
 * rather than that it has a good default. A default is what caused this.
 */
describe("resolveSiteUrl", () => {
  describe("in production", () => {
    it("refuses a missing value rather than defaulting", () => {
      expect(() => resolveSiteUrl(undefined, "production")).toThrow(SiteUrlConfigurationError);
      expect(() => resolveSiteUrl("", "production")).toThrow(SiteUrlConfigurationError);
      expect(() => resolveSiteUrl("   ", "production")).toThrow(SiteUrlConfigurationError);
    });

    it("refuses the loopback default that shipped before Phase 8", () => {
      // This exact string was the hard-coded fallback in app/layout.tsx,
      // app/sitemap.ts and app/robots.ts.
      expect(() => resolveSiteUrl("http://localhost:3000", "production")).toThrow(
        SiteUrlConfigurationError,
      );
    });

    it.each(["http://127.0.0.1:3000", "https://localhost", "https://0.0.0.0"])(
      "refuses the loopback host %s",
      (value) => {
        expect(() => resolveSiteUrl(value, "production")).toThrow(SiteUrlConfigurationError);
      },
    );

    it("refuses http, because canonical and OG URLs must not be downgraded", () => {
      expect(() => resolveSiteUrl("http://nnino.example", "production")).toThrow(
        SiteUrlConfigurationError,
      );
    });

    it("accepts a real https origin", () => {
      expect(resolveSiteUrl("https://nnino.vercel.app", "production")).toBe(
        "https://nnino.vercel.app",
      );
    });

    it("names the variable in the error so the fix is obvious from the log", () => {
      expect(() => resolveSiteUrl(undefined, "production")).toThrow(/NEXT_PUBLIC_SITE_URL/);
    });
  });

  describe("outside production", () => {
    it("falls back to localhost when unset, so dev and test need no configuration", () => {
      expect(resolveSiteUrl(undefined, "development")).toBe(DEVELOPMENT_SITE_URL);
      expect(resolveSiteUrl(undefined, "test")).toBe(DEVELOPMENT_SITE_URL);
    });

    it("still rejects a malformed value — tolerating absence is not tolerating a typo", () => {
      expect(() => resolveSiteUrl("nnino.vercel.app", "development")).toThrow(
        SiteUrlConfigurationError,
      );
      expect(() => resolveSiteUrl("https://", "development")).toThrow(SiteUrlConfigurationError);
    });

    it("rejects a non-http scheme", () => {
      expect(() => resolveSiteUrl("ftp://nnino.example", "development")).toThrow(
        SiteUrlConfigurationError,
      );
    });

    it("permits http on a loopback host", () => {
      expect(resolveSiteUrl("http://localhost:3000", "development")).toBe("http://localhost:3000");
    });
  });

  describe("normalisation", () => {
    it("strips a trailing slash so templating cannot produce a double slash", () => {
      const resolved = resolveSiteUrl("https://nnino.vercel.app/", "production");
      expect(resolved).toBe("https://nnino.vercel.app");
      expect(`${resolved}/shop`).toBe("https://nnino.vercel.app/shop");
    });

    it("strips repeated trailing slashes", () => {
      expect(resolveSiteUrl("https://nnino.vercel.app///", "production")).toBe(
        "https://nnino.vercel.app",
      );
    });

    it("discards a query string or fragment pasted in by accident", () => {
      expect(resolveSiteUrl("https://nnino.vercel.app/?utm=x#top", "production")).toBe(
        "https://nnino.vercel.app",
      );
    });

    it("preserves a sub-path deployment", () => {
      expect(resolveSiteUrl("https://example.com/nnino/", "production")).toBe(
        "https://example.com/nnino",
      );
    });

    it("tolerates surrounding whitespace, which is how a dashboard paste arrives", () => {
      expect(resolveSiteUrl("  https://nnino.vercel.app  ", "production")).toBe(
        "https://nnino.vercel.app",
      );
    });
  });
});
