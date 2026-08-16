import { describe, expect, it } from "vitest";
import { timingSafeEqualString } from "@/lib/security/tokens";

/**
 * Guards the comparison used for the guest order access token, the sandbox
 * payment token and provider webhook signatures.
 */
describe("timingSafeEqualString", () => {
  it("matches identical strings", () => {
    const token = "9f1c2b7e-2f5a-4a3e-9b1d-77c2a1e4f8d2";
    expect(timingSafeEqualString(token, token)).toBe(true);
  });

  it("rejects a token that differs by a single character", () => {
    expect(
      timingSafeEqualString(
        "9f1c2b7e-2f5a-4a3e-9b1d-77c2a1e4f8d2",
        "9f1c2b7e-2f5a-4a3e-9b1d-77c2a1e4f8d3",
      ),
    ).toBe(false);
  });

  /**
   * crypto.timingSafeEqual throws on differing buffer lengths, which is why both
   * sides are hashed to a fixed width first. If that ever regressed, this test
   * would throw rather than fail.
   */
  it("handles differing lengths without throwing", () => {
    expect(() => timingSafeEqualString("short", "considerably-longer-value")).not.toThrow();
    expect(timingSafeEqualString("short", "considerably-longer-value")).toBe(false);
  });

  it("rejects an empty supplied token against a real one", () => {
    expect(timingSafeEqualString("", "9f1c2b7e-2f5a-4a3e-9b1d-77c2a1e4f8d2")).toBe(false);
  });

  it("treats two empty strings as equal, leaving the empty check to the caller", () => {
    // Call sites reject an empty token BEFORE comparing — see the sandbox page.
    expect(timingSafeEqualString("", "")).toBe(true);
  });

  it("is not fooled by unicode that normalises to the same glyph", () => {
    expect(timingSafeEqualString("café", "cafe\u0301")).toBe(false);
  });
});
