/**
 * Serialises structured data for embedding in a <script> tag.
 *
 * THE BUG THIS FIXES
 *
 * Phases 2 and 4 embedded JSON-LD as:
 *
 *   dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(...)) }}
 *
 * JSON.stringify does not escape `<`. A product name, description or SEO field
 * containing `</script><script>…` therefore closes our tag and opens the
 * attacker's, on every public page that renders the product. The values come
 * from the admin CMS, so this is not remote-anonymous XSS — but it is a genuine
 * stored-XSS path from a CONTENT_MANAGER (the lowest-privileged role that can
 * edit product copy) to every visitor's browser, which crosses a privilege
 * boundary. That is exactly what CSP-plus-escaping exists to prevent, and the
 * escaping half was missing.
 *
 * WHAT IS ESCAPED, AND WHY EACH ONE
 *
 *   <  →  \u003c   Prevents `</script>` terminating the block. This alone fixes
 *                  the vulnerability; the rest are defence in depth.
 *   >  →  \u003e   Symmetry, and stops `-->` closing an HTML comment if the
 *                  block is ever wrapped in one (a legacy pattern that still
 *                  appears in copied templates).
 *   &  →  \u0026   Stops HTML entity decoding altering the payload before the
 *                  JSON parser sees it.
 *   U+2028 / U+2029  Valid in JSON strings but ILLEGAL as raw line terminators
 *                  in JavaScript source prior to ES2019. Escaping them keeps the
 *                  output parseable by any engine and by strict JSON-LD readers.
 *
 * All five escapes produce a string that is still valid JSON — `\u003c` inside a
 * JSON string decodes back to `<` — so Google's structured-data parser reads
 * exactly the intended value. The SEO output is unchanged; only the transport is
 * made safe.
 */

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * JSON for a <script> tag. Use in place of JSON.stringify everywhere the result
 * is written with dangerouslySetInnerHTML.
 */
export function serialiseJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ESCAPES[character]!);
}

/**
 * Ready-made props for a JSON-LD script tag.
 *
 * Returning the whole prop object rather than just the string means a call site
 * cannot accidentally reach for JSON.stringify again:
 *
 *   <script type="application/ld+json" {...jsonLdProps(productJsonLd(product))} />
 */
export function jsonLdProps(value: unknown): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: serialiseJsonLd(value) },
  };
}
