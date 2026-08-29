import { describe, expect, it } from "vitest";
import {
  EMPTY_ATTRIBUTION,
  landingPageDefaultAttribution,
  resolveFirstTouchAttribution,
  resolveIncomingAttribution,
  type AttributionData,
} from "@/lib/marketing/utm";

/**
 * These are the rules lib/marketing/attribution.ts's `captureAttribution` and
 * `readAttribution` apply when deciding what actually gets written onto an
 * Order or CustomOrderInquiry at checkout / enquiry submission — see
 * app/(site)/checkout/actions.ts and app/(site)/custom/actions.ts, both of
 * which call `readAttribution()` then `verifiedAttribution()` before passing
 * the result into the create() call. `verifiedAttribution` additionally
 * checks campaignId/landingPageId against the database, so it is not
 * unit-testable here — see tests/integration/landing-pages.integration.test.ts
 * for the database-touching half of this story.
 */

const withSource: AttributionData = {
  ...EMPTY_ATTRIBUTION,
  utmSource: "instagram",
  utmMedium: "social",
};

describe("resolveFirstTouchAttribution", () => {
  it("adopts the incoming attribution when nothing is on record yet", () => {
    const result = resolveFirstTouchAttribution(null, withSource);
    expect(result).toBe(withSource);
  });

  it("keeps the existing attribution when something meaningful is already on record", () => {
    const existing: AttributionData = { ...EMPTY_ATTRIBUTION, utmSource: "facebook" };
    const result = resolveFirstTouchAttribution(existing, withSource);
    expect(result).toBe(existing);
    expect(result.utmSource).toBe("facebook");
  });

  it("does NOT let a later direct visit (no utm params) erase an earlier attributed one", () => {
    const existing: AttributionData = { ...EMPTY_ATTRIBUTION, utmSource: "facebook", utmMedium: "paid" };
    const laterDirectVisit: AttributionData = EMPTY_ATTRIBUTION;

    const result = resolveFirstTouchAttribution(existing, laterDirectVisit);

    expect(result.utmSource).toBe("facebook");
    expect(result.utmMedium).toBe("paid");
  });

  it("treats an empty existing record (all null) as nothing on record — the incoming value wins", () => {
    const result = resolveFirstTouchAttribution(EMPTY_ATTRIBUTION, withSource);
    expect(result).toBe(withSource);
  });

  it("campaignId alone counts as 'something on record', even with no utm fields", () => {
    const existing: AttributionData = { ...EMPTY_ATTRIBUTION, campaignId: "camp_1" };
    const result = resolveFirstTouchAttribution(existing, withSource);
    expect(result).toBe(existing);
  });
});

describe("landingPageDefaultAttribution", () => {
  it("carries the landing page's own defaults, plus its id and campaign id", () => {
    const result = landingPageDefaultAttribution({
      id: "lp_1",
      campaignId: "camp_1",
      defaultUtmSource: "qr-code",
      defaultUtmMedium: "print",
      defaultUtmCampaign: "gallery-launch",
      defaultUtmTerm: null,
      defaultUtmContent: null,
    });

    expect(result).toEqual({
      utmSource: "qr-code",
      utmMedium: "print",
      utmCampaign: "gallery-launch",
      utmTerm: null,
      utmContent: null,
      campaignId: "camp_1",
      landingPageId: "lp_1",
    });
  });
});

describe("resolveIncomingAttribution", () => {
  it("combines URL utm params with the current page's campaign/landing ids", () => {
    const result = resolveIncomingAttribution({
      urlParams: new URLSearchParams("utm_source=whatsapp"),
      campaignId: "camp_1",
      landingPageId: "lp_1",
    });

    expect(result.utmSource).toBe("whatsapp");
    expect(result.campaignId).toBe("camp_1");
    expect(result.landingPageId).toBe("lp_1");
  });

  it("defaults campaignId/landingPageId to null when the page has none", () => {
    const result = resolveIncomingAttribution({ urlParams: new URLSearchParams("") });
    expect(result.campaignId).toBeNull();
    expect(result.landingPageId).toBeNull();
  });
});
