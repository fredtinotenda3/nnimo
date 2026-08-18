/**
 * The canonical public origin, resolved once and validated.
 *
 * WHY THIS FILE EXISTS (Phase 8, finding H1)
 *
 * Three separate call sites — app/layout.tsx, app/sitemap.ts and app/robots.ts —
 * each did this:
 *
 *   const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
 *
 * Three copies of a fallback that is correct in development and silently wrong in
 * production. If the variable is unset or mistyped on the deployment platform,
 * nothing throws: every canonical link, every OpenGraph URL, every <loc> in
 * sitemap.xml and the `sitemap:` line in robots.txt points at localhost, and the
 * only symptom is that the site indexes badly. A misconfiguration whose only
 * signal is degraded SEO weeks later is exactly the kind that must fail loudly
 * instead.
 *
 * So: one resolver, strict in production, lenient everywhere else.
 *
 * NO IMPORT OF lib/env.ts, DELIBERATELY
 *
 * This module is intentionally dependency-free and side-effect-free apart from
 * the module-level constant. lib/env.ts imports "server-only" and validates the
 * whole environment including DATABASE_URL, which makes it unimportable from a
 * unit test. The relationship runs the other way: lib/env.ts imports
 * `resolveSiteUrl` from here so the production rule lives in one place and is
 * enforced at boot as well as at use.
 */

/** Hosts that can never be the public origin of a production deployment. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export const DEVELOPMENT_SITE_URL = "http://localhost:3000";

export class SiteUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteUrlConfigurationError";
  }
}

/**
 * Validates and normalises the configured public origin.
 *
 * In production the value must be present, parseable, https, and not a loopback
 * host — anything else throws. Outside production a missing value falls back to
 * localhost, because requiring it would make `npm run dev` and `npm run test`
 * depend on configuration they do not need.
 *
 * A present-but-broken value throws in every environment. Development tolerating
 * a missing variable is a convenience; it is not a reason to tolerate a typo.
 *
 * @returns the origin plus path with any trailing slash removed, so callers can
 *          safely template `${siteUrl}/shop` without producing a double slash.
 */
export function resolveSiteUrl(
  raw: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const isProduction = nodeEnv === "production";
  const value = raw?.trim();

  if (!value) {
    if (isProduction) {
      throw new SiteUrlConfigurationError(
        "NEXT_PUBLIC_SITE_URL is required in production. It is the origin used for " +
          "canonical URLs, OpenGraph metadata, sitemap.xml and robots.txt. Without it " +
          "those would all point at http://localhost:3000 and the site would index " +
          "incorrectly. Set it to the public https origin, e.g. https://nnino.vercel.app",
      );
    }
    return DEVELOPMENT_SITE_URL;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SiteUrlConfigurationError(
      `NEXT_PUBLIC_SITE_URL is not a valid absolute URL: ${JSON.stringify(value)}. ` +
        "It must include the scheme, e.g. https://nnino.vercel.app",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SiteUrlConfigurationError(
      `NEXT_PUBLIC_SITE_URL must be an http or https URL, not ${url.protocol}`,
    );
  }

  if (isProduction) {
    if (url.protocol !== "https:") {
      throw new SiteUrlConfigurationError(
        "NEXT_PUBLIC_SITE_URL must use https in production. Canonical URLs and " +
          "OpenGraph metadata served over http are downgraded by crawlers and social " +
          "previews, and Strict-Transport-Security makes the http origin unreachable " +
          "for returning visitors anyway.",
      );
    }
    if (LOOPBACK_HOSTS.has(url.hostname)) {
      throw new SiteUrlConfigurationError(
        `NEXT_PUBLIC_SITE_URL points at the loopback host ${url.hostname} in production. ` +
          "This is the default that Phase 8 removed: it produces a sitemap and canonical " +
          "tags full of localhost URLs. Set the real public origin.",
      );
    }
  }

  // Strip the trailing slash so `${SITE_URL}/shop` cannot become `//shop`, and
  // drop any query or fragment someone has pasted in by accident.
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/**
 * The resolved origin, evaluated at module load.
 *
 * Evaluated eagerly on purpose: app/layout.tsx imports this, so a production
 * deployment with a bad value fails on the first render rather than serving
 * wrong metadata indefinitely.
 */
export const SITE_URL: string = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  if (!path.startsWith("/")) return `${SITE_URL}/${path}`;
  return `${SITE_URL}${path}`;
}
