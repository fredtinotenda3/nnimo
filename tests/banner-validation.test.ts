import { describe, expect, it } from "vitest";
import { bannerSchema } from "@/lib/admin/schemas";

describe("bannerSchema", () => {
  it("accepts a minimal valid banner: enabled with just text", () => {
    const result = bannerSchema.safeParse({ enabled: "on", text: "Free delivery this week" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.text).toBe("Free delivery this week");
      expect(result.data.linkUrl).toBeNull();
    }
  });

  it("treats an absent enabled checkbox as false, not an error — same convention as every other admin checkbox", () => {
    // `enabled: undefined` explicitly, not the key omitted entirely — see
    // tests/admin-validation.test.ts's productBase, which does the same for
    // `featured`. Zod's object parsing treats a genuinely absent key
    // differently from a present key valued `undefined`.
    const result = bannerSchema.safeParse({ text: "Some text", enabled: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });

  it("requires text — an enabled banner with nothing to show is not a valid banner", () => {
    const result = bannerSchema.safeParse({ enabled: "on", text: "" });
    expect(result.success).toBe(false);
  });

  it("accepts an optional link and link label together", () => {
    const result = bannerSchema.safeParse({
      enabled: "on",
      text: "New arrivals",
      linkUrl: "/shop",
      linkLabel: "Shop now",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkUrl).toBe("/shop");
      expect(result.data.linkLabel).toBe("Shop now");
    }
  });

  it("caps banner text at 200 characters", () => {
    const result = bannerSchema.safeParse({ enabled: "on", text: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});
