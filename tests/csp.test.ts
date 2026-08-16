import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  originOf,
  securityHeaders,
} from "@/lib/security/csp";

function directive(policy: string, name: string): string {
  const found = policy.split("; ").find((part) => part.startsWith(`${name} `));
  return found ?? "";
}

describe("buildContentSecurityPolicy", () => {
  const base = { nonce: "abc123", isProduction: true } as const;

  it("carries the request nonce into script-src", () => {
    expect(directive(buildContentSecurityPolicy(base), "script-src")).toContain("'nonce-abc123'");
  });

  /**
   * The whole point of a strict policy. If either of these ever reappears in
   * script-src the policy stops being worth having, so this test is the guard.
   */
  it("never allows unsafe-inline or unsafe-eval for scripts in production", () => {
    const scriptSrc = directive(buildContentSecurityPolicy(base), "script-src");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval for scripts only outside production, for the dev overlay", () => {
    const dev = buildContentSecurityPolicy({ ...base, isProduction: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  /**
   * Documented exception, asserted so it is a deliberate decision rather than
   * something that drifts. Next.js and next/font emit inline <style> that cannot
   * take a nonce; a nonce on style-src would disable the inline allowance and
   * break the fonts.
   */
  it("allows unsafe-inline for styles, which Next.js and next/font require", () => {
    expect(directive(buildContentSecurityPolicy(base), "style-src")).toContain("'unsafe-inline'");
  });

  it("denies framing, objects and stray base tags", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
  });

  it("adds the media CDN origin to img-src only when one is configured", () => {
    const without = buildContentSecurityPolicy(base);
    expect(directive(without, "img-src")).not.toContain("cdn.example.com");

    const with_ = buildContentSecurityPolicy({
      ...base,
      mediaOrigin: "https://cdn.example.com/nnino/",
    });
    expect(directive(with_, "img-src")).toContain("https://cdn.example.com");
  });

  it("adds the payment origin to form-action so a hosted redirect can post back", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      paymentOrigin: "https://www.paynow.co.zw/interface",
    });
    expect(directive(policy, "form-action")).toContain("https://www.paynow.co.zw");
  });

  it("never allows a websocket connection in production", () => {
    expect(directive(buildContentSecurityPolicy(base), "connect-src")).not.toContain("ws:");
    expect(
      directive(buildContentSecurityPolicy({ ...base, isProduction: false }), "connect-src"),
    ).toContain("ws:");
  });

  it("upgrades insecure requests only in production", () => {
    expect(buildContentSecurityPolicy(base)).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ ...base, isProduction: false })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("originOf", () => {
  it("reduces a URL to a bare origin", () => {
    expect(originOf("https://cdn.example.com/path/deep")).toBe("https://cdn.example.com");
  });

  it("returns null for anything unusable rather than throwing", () => {
    expect(originOf(null)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

describe("securityHeaders", () => {
  it("sends HSTS only in production", () => {
    const prod = securityHeaders({ csp: "x", reportOnly: false, isProduction: true });
    expect(prod["Strict-Transport-Security"]).toContain("max-age=63072000");

    const dev = securityHeaders({ csp: "x", reportOnly: false, isProduction: false });
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });

  it("uses the report-only header name when asked", () => {
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");

    const headers = securityHeaders({ csp: "x", reportOnly: true, isProduction: true });
    expect(headers["Content-Security-Policy-Report-Only"]).toBe("x");
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("denies the browser features the storefront does not use", () => {
    const headers = securityHeaders({ csp: "x", reportOnly: false, isProduction: true });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("payment=()");
  });
});
