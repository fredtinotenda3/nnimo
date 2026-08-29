import { describe, expect, it } from "vitest";
import { hasAttribution, hasUtmValues, parseUtmParams } from "@/lib/marketing/utm";

describe("parseUtmParams", () => {
  it("reads all five standard parameters from URLSearchParams", () => {
    const params = new URLSearchParams(
      "utm_source=instagram&utm_medium=social&utm_campaign=zebra-launch&utm_term=ceramics&utm_content=story-link",
    );

    expect(parseUtmParams(params)).toEqual({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "zebra-launch",
      utmTerm: "ceramics",
      utmContent: "story-link",
    });
  });

  it("reads from a plain searchParams-style object, taking the first value of an array", () => {
    const result = parseUtmParams({
      utm_source: "facebook",
      utm_medium: ["paid", "ignored"],
      utm_campaign: undefined,
    });

    expect(result.utmSource).toBe("facebook");
    expect(result.utmMedium).toBe("paid");
    expect(result.utmCampaign).toBeNull();
  });

  it("returns all-null values when nothing is present", () => {
    expect(parseUtmParams(new URLSearchParams(""))).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    });
  });

  it("trims whitespace and treats an empty/whitespace-only value as absent", () => {
    const params = new URLSearchParams();
    params.set("utm_source", "  whatsapp  ");
    params.set("utm_medium", "   ");

    const result = parseUtmParams(params);
    expect(result.utmSource).toBe("whatsapp");
    expect(result.utmMedium).toBeNull();
  });

  it("caps a value at 150 characters — utm_* is attacker-reachable, unbounded input never reaches storage", () => {
    const long = "a".repeat(500);
    const params = new URLSearchParams();
    params.set("utm_campaign", long);

    const result = parseUtmParams(params);
    expect(result.utmCampaign).toHaveLength(150);
  });
});

describe("hasUtmValues / hasAttribution", () => {
  it("is false when every field is null", () => {
    expect(
      hasUtmValues({ utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null }),
    ).toBe(false);
  });

  it("is true when any single field is set", () => {
    expect(
      hasUtmValues({ utmSource: "google", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null }),
    ).toBe(true);
  });

  it("hasAttribution is true from a campaignId alone, with no utm values at all", () => {
    expect(
      hasAttribution({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmTerm: null,
        utmContent: null,
        campaignId: "camp_123",
        landingPageId: null,
      }),
    ).toBe(true);
  });

  it("hasAttribution is false when nothing at all is set", () => {
    expect(
      hasAttribution({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmTerm: null,
        utmContent: null,
        campaignId: null,
        landingPageId: null,
      }),
    ).toBe(false);
  });
});
