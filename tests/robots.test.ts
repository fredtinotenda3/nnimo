import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site-url";

describe("robots.txt", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const rule = rules[0];

  if (!rule) throw new Error("Expected robots rule");

  const disallow = Array.isArray(rule.disallow)
    ? rule.disallow
    : rule.disallow
      ? [rule.disallow]
      : [];

  it("allows the public site", () => {
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
  });

  it.each(["/admin", "/login", "/api/"])("keeps operator surface %s disallowed", (path) => {
    expect(disallow).toContain(path);
  });

  it.each(["/cart", "/checkout", "/orders/"])(
    "disallows private customer surface %s",
    (path) => {
      expect(disallow).toContain(path);
    },
  );

  it("covers the sandbox payment page via the /checkout/ prefix", () => {
    expect(disallow).toContain("/checkout/");
  });

  it("does not disallow the routes the storefront needs indexed", () => {
    for (const path of ["/", "/shop", "/collections", "/products", "/about", "/custom"]) {
      expect(disallow).not.toContain(path);
    }
  });

  it("points the sitemap and host at the validated origin, never a literal", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(result.host).toBe(SITE_URL);
    expect(result.sitemap).not.toContain("//sitemap");
  });
});