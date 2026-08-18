"use client";

/**
 * PHASE 8 (finding H2). Last resort: an error thrown by the root layout itself.
 *
 * This boundary REPLACES app/layout.tsx rather than rendering inside it, which is
 * why it declares its own <html> and <body>. That has two consequences worth
 * stating, because both look like mistakes otherwise:
 *
 *   1. The next/font variables are defined in the root layout that just failed, so
 *      --font-playfair and friends do not exist here. Reaching for them would give
 *      an unstyled fallback in an unpredictable face. A deliberate system-font
 *      stack is more presentable than a broken brand font.
 *
 *   2. globals.css is imported by the root layout too, so no Tailwind utility class
 *      is available. Everything below is therefore an inline style attribute. This
 *      is compatible with the CSP: `style-src` carries 'unsafe-inline' (see
 *      lib/security/csp.ts), and this file contains no inline <script>, which is
 *      the directive that is actually locked down.
 *
 * The brand hex values are inlined for the same reason — the custom properties they
 * normally come from live in the stylesheet that did not load. They are the exact
 * palette values from app/globals.css.
 *
 * WHEN THIS ACTUALLY FIRES: essentially only a failure in the root layout, which in
 * this application means lib/site-url.ts refusing a bad NEXT_PUBLIC_SITE_URL, a
 * next/font fetch failure at build, or an env validation throw. All three are
 * misconfiguration rather than traffic-dependent bugs — so this page's real job is
 * to be legible to whoever just deployed, not to be beautiful.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-ZW">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#faf7f2",
          color: "#2c2c2c",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          lineHeight: 1.65,
        }}
      >
        <main style={{ maxWidth: "32rem", width: "100%" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6b6157",
            }}
          >
            Nnino Ceramics
          </p>

          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1.75rem",
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            The site could not be loaded
          </h1>

          <div
            style={{
              marginTop: "1.5rem",
              borderLeft: "2px solid #d4a96a",
              paddingLeft: "1rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.9375rem", color: "#6b6157" }}>
              Something failed before the page could be built. This is a problem on
              our side. Please try again in a few minutes.
            </p>
          </div>

          <div style={{ marginTop: "2rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                backgroundColor: "#b85c3a",
                color: "#ffffff",
                font: "inherit",
                fontSize: "0.875rem",
                padding: "0.75rem 1.25rem",
                borderRadius: "2px",
              }}
            >
              Try again
            </button>
          </div>

          <p
            style={{
              marginTop: "2.5rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid #e7dfd4",
              fontSize: "0.75rem",
              color: "#6b6157",
            }}
          >
            {/* Digest only — never error.message. See app/(site)/error.tsx for the
                full reasoning; it applies identically here. */}
            Reference:{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {error.digest ?? "not available"}
            </span>
          </p>
        </main>
      </body>
    </html>
  );
}
