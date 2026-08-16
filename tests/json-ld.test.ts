import { describe, expect, it } from "vitest";
import { serialiseJsonLd, jsonLdProps } from "@/lib/security/json-ld";

/**
 * Regression tests for the Phase 5 JSON-LD escaping fix.
 *
 * The vulnerability: JSON.stringify does not escape `<`, so a product name
 * containing `</script>` closed the JSON-LD block and everything after it was
 * parsed as HTML. Product copy is admin-authored, which makes this a stored-XSS
 * path from a CONTENT_MANAGER to every visitor.
 */
describe("serialiseJsonLd", () => {
  it("escapes a script-closing sequence so it cannot break out of the tag", () => {
    const payload = { name: "Vase</script><script>alert(1)</script>" };
    const output = serialiseJsonLd(payload);

    expect(output).not.toContain("</script>");
    expect(output).not.toContain("<");
    expect(output).toContain("\\u003c");
  });

  it("escapes the exact characters that matter and no others", () => {
    expect(serialiseJsonLd("<")).toBe('"\\u003c"');
    expect(serialiseJsonLd(">")).toBe('"\\u003e"');
    expect(serialiseJsonLd("&")).toBe('"\\u0026"');
    expect(serialiseJsonLd("\u2028")).toBe('"\\u2028"');
    expect(serialiseJsonLd("\u2029")).toBe('"\\u2029"');
  });

  it("leaves ordinary product copy untouched", () => {
    const description = "Hand sculptured, hand painted and signed in Bulawayo.";
    expect(serialiseJsonLd({ description })).toBe(JSON.stringify({ description }));
  });

  /**
   * The escaping must not change what a structured-data parser sees, or the fix
   * would trade an XSS for an SEO regression. \u003c inside a JSON string
   * decodes back to `<`.
   */
  it("round-trips to the original value, so SEO output is unchanged", () => {
    const original = {
      name: "Bowl <Large> & Deep",
      description: "A piece\u2028with a line separator",
    };
    expect(JSON.parse(serialiseJsonLd(original))).toEqual(original);
  });

  it("escapes inside nested structures, not just at the top level", () => {
    const payload = { offers: { seller: { name: "</script>" } } };
    expect(serialiseJsonLd(payload)).not.toContain("</script>");
  });

  it("jsonLdProps produces a ready-to-spread script prop", () => {
    const props = jsonLdProps({ name: "<x>" });
    expect(props.type).toBe("application/ld+json");
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("<");
  });
});
