/**
 * Content-Security-Policy, derived from what this application actually loads.
 *
 * Not a copied template. Each directive below is justified by something in the
 * repository, and anything the app does not use is denied rather than left open
 * "just in case".
 *
 * WHAT THE APP ACTUALLY LOADS
 *
 *   scripts   Next.js runtime + React hydration (inline bootstrap and flight
 *             payloads), plus the JSON-LD <script type="application/ld+json">
 *             blocks on the public pages. No third-party analytics, no tag
 *             manager, no embedded widgets — verified by grepping for <script>
 *             and for any external src across app/ and components/.
 *   styles    Tailwind v4 compiled to a stylesheet, plus the inline custom
 *             properties next/font emits for the three self-hosted families.
 *   fonts     next/font/google self-hosts at build time (see app/layout.tsx), so
 *             fonts are served from our own origin. fonts.gstatic.com is NOT
 *             needed and is therefore not allowed.
 *   images    our own origin, data: URIs (Next's blur placeholders), and the
 *             media CDN host when MEDIA_S3_PUBLIC_URL is configured.
 *   connect   our own origin for server-action POSTs. The rate limiter's Upstash
 *             calls are server-side and never leave the browser, so its host is
 *             deliberately absent.
 *   forms     our own origin plus the payment provider, which is where a hosted
 *             redirect flow posts.
 *
 * NONCES, AND WHY THEY COST NOTHING HERE
 *
 * A nonce-based policy normally forces every page to render dynamically, since
 * the nonce cannot be baked into static HTML. That would usually be a real
 * trade-off against a fast catalogue. It is not one here: every page under
 * app/(site) and app/admin already declares `export const dynamic =
 * "force-dynamic"`, and the site layout reads cookies() for the cart badge,
 * which makes the whole tree dynamic regardless. So the strict policy is free.
 *
 * 'strict-dynamic' is included so scripts loaded BY a nonced script (Next's
 * chunk loader pulling in route chunks) inherit trust without each chunk needing
 * its own nonce. Browsers that understand it ignore the host allow-list that
 * follows, which is exactly the intent; older browsers fall back to 'self'.
 *
 * WHAT IS NOT AVOIDABLE
 *
 * `style-src` needs 'unsafe-inline'. Next.js injects inline <style> for
 * critical CSS and next/font emits an inline block defining --font-* custom
 * properties, and neither accepts a nonce in Next 16. Nonces and 'unsafe-inline'
 * are mutually exclusive in CSP — a nonce on style-src would DISABLE the
 * inline allowance and break the fonts. This is documented rather than papered
 * over. The residual risk is CSS injection, which is materially less severe than
 * script injection and is separately mitigated: there is no user-controlled
 * style anywhere in the app.
 *
 * `script-src` does NOT need 'unsafe-inline' or 'unsafe-eval'. Both are absent.
 */

export type CspOptions = {
  nonce: string;
  /** Public base URL of the media CDN, when one is configured. */
  mediaOrigin?: string | null;
  /** Origin the active payment provider redirects to / posts back from. */
  paymentOrigin?: string | null;
  /**
   * Report-only mode. Useful for one deploy when tightening the policy, so a
   * mistake surfaces as a console report rather than a blank page.
   */
  reportOnly?: boolean;
  isProduction: boolean;
};

/** Extracts a bare origin from a URL, or null when the value is unusable. */
export function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const { nonce, isProduction } = options;

  const mediaOrigin = originOf(options.mediaOrigin);
  const paymentOrigin = originOf(options.paymentOrigin);

  const imgSrc = ["'self'", "data:", "blob:"];
  if (mediaOrigin) imgSrc.push(mediaOrigin);

  const formAction = ["'self'"];
  if (paymentOrigin) formAction.push(paymentOrigin);

  const connectSrc = ["'self'"];
  if (mediaOrigin) connectSrc.push(mediaOrigin);
  // React Refresh and the Next dev overlay use a websocket back to the dev
  // server. Production has no such connection and must not allow one.
  if (!isProduction) connectSrc.push("ws:", "wss:");

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Ignored by browsers that honour strict-dynamic; a fallback for those that
    // do not, so the site is not scriptless on an old browser.
    "https:",
  ];
  // The Next dev overlay and Fast Refresh evaluate code at runtime. Production
  // does not, so 'unsafe-eval' never reaches a real user.
  if (!isProduction) scriptSrc.push("'unsafe-eval'");

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    // See the note above: 'unsafe-inline' here is a Next.js/next-font
    // requirement, not an oversight.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", imgSrc],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["form-action", formAction],
    // Clickjacking. frame-ancestors is the modern control; X-Frame-Options is
    // still sent alongside it for browsers that predate CSP Level 2.
    ["frame-ancestors", ["'none'"]],
    // Nothing in this application embeds an iframe or loads a plugin.
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["media-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    // Stops an injected <base> rewriting every relative URL on the page.
    ["base-uri", ["'self'"]],
  ];

  const policy = directives
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  // Only meaningful over HTTPS, and it would break local development.
  return isProduction ? `${policy}; upgrade-insecure-requests` : policy;
}

export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/**
 * Headers applied to every response.
 *
 * These live here rather than in next.config.ts because the CSP needs a
 * per-request nonce, and a config-level header is static by definition. Keeping
 * the whole set together means there is one place to read the security posture
 * rather than two that can drift.
 */
export function securityHeaders(options: {
  csp: string;
  reportOnly: boolean;
  isProduction: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    [cspHeaderName(options.reportOnly)]: options.csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    // Deny by default. Every feature the storefront does not use is switched
    // off, so a compromised script cannot reach for the camera or a payment
    // handler.
    "Permissions-Policy": [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
    // Isolates this origin from cross-origin window references.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };

  if (options.isProduction) {
    // Two years, subdomains included, preload-eligible. Only sent over HTTPS —
    // sending it in development would pin localhost to https in the browser and
    // is a genuinely annoying thing to undo.
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}
