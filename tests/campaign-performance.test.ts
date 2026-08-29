import { describe, expect, it } from "vitest";
import {
  summarizeCampaignPerformance,
  summarizeSourceMediumBreakdown,
} from "@/lib/analytics/marketing-compute";

const campaigns = [
  { id: "camp_a", name: "Zebra launch", slug: "zebra-launch", status: "ACTIVE" },
  { id: "camp_b", name: "Winter gifting", slug: "winter-gifting", status: "ENDED" },
];

describe("summarizeCampaignPerformance", () => {
  it("reports zero orders and zero enquiries for a campaign with no rows — never fabricated", () => {
    const [row] = summarizeCampaignPerformance(
      [{ id: "camp_new", name: "New push", slug: "new-push", status: "DRAFT" }],
      [],
      [],
    );

    if (!row) throw new Error("Expected a campaign performance row");

    expect(row.orderCount).toBe(0);
    expect(row.revenueByCurrency).toEqual([]);
    expect(row.enquiryCount).toBe(0);
  });

  it("attributes orders and enquiries only to their own campaign", () => {
    const orders = [
      { campaignId: "camp_a", utmSource: null, utmMedium: null, totalCents: 15000, currency: "USD" },
      { campaignId: "camp_a", utmSource: null, utmMedium: null, totalCents: 5000, currency: "USD" },
      { campaignId: "camp_b", utmSource: null, utmMedium: null, totalCents: 20000, currency: "USD" },
      { campaignId: null, utmSource: "google", utmMedium: "cpc", totalCents: 9999, currency: "USD" },
    ];
    const enquiries = [{ campaignId: "camp_a" }, { campaignId: "camp_a" }, { campaignId: null }];

    const rows = summarizeCampaignPerformance(campaigns, orders, enquiries);
    const a = rows.find((r) => r.campaignId === "camp_a");
    const b = rows.find((r) => r.campaignId === "camp_b");

    if (!a || !b) throw new Error("Expected both campaigns to be present");

    expect(a.orderCount).toBe(2);
    expect(a.revenueByCurrency).toEqual([{ currency: "USD", cents: 20000 }]);
    expect(a.enquiryCount).toBe(2);

    expect(b.orderCount).toBe(1);
    expect(b.revenueByCurrency).toEqual([{ currency: "USD", cents: 20000 }]);
    expect(b.enquiryCount).toBe(0);
  });

  it("keeps revenue split by currency rather than summed across currencies", () => {
    const orders = [
      { campaignId: "camp_a", utmSource: null, utmMedium: null, totalCents: 10000, currency: "USD" },
      { campaignId: "camp_a", utmSource: null, utmMedium: null, totalCents: 8000, currency: "ZAR" },
    ];

    const firstCampaign = campaigns[0];
    if (!firstCampaign) throw new Error("Expected a campaign");

    const [row] = summarizeCampaignPerformance([firstCampaign], orders, []);

    if (!row) throw new Error("Expected a campaign performance row");

    expect(row.revenueByCurrency).toEqual([
      { currency: "USD", cents: 10000 },
      { currency: "ZAR", cents: 8000 },
    ]);
  });

  it("includes every real campaign even at zero conversions — an empty row, not a dropped one", () => {
    const rows = summarizeCampaignPerformance(campaigns, [], []);
    expect(rows.map((r) => r.campaignId).sort()).toEqual(["camp_a", "camp_b"]);
  });
});

describe("summarizeSourceMediumBreakdown", () => {
  it("only includes orders with no campaign link", () => {
    const orders = [
      { campaignId: "camp_a", utmSource: "instagram", utmMedium: "social", totalCents: 5000, currency: "USD" },
      { campaignId: null, utmSource: "instagram", utmMedium: "social", totalCents: 3000, currency: "USD" },
    ];

    const rows = summarizeSourceMediumBreakdown(orders);

    expect(rows).toHaveLength(1);

    const row = rows[0];
    if (!row) throw new Error("Expected a source/medium row");

    expect(row.orderCount).toBe(1);
    expect(row.revenueByCurrency).toEqual([{ currency: "USD", cents: 3000 }]);
  });

  it("groups a campaign-less order with no utm values at all under direct/none, honestly labelled", () => {
    const orders = [{ campaignId: null, utmSource: null, utmMedium: null, totalCents: 4000, currency: "USD" }];

    const rows = summarizeSourceMediumBreakdown(orders);

    expect(rows).toEqual([
      { source: "direct", medium: "none", orderCount: 1, revenueByCurrency: [{ currency: "USD", cents: 4000 }] },
    ]);
  });

  it("sorts groups by order count, descending", () => {
    const orders = [
      { campaignId: null, utmSource: "a", utmMedium: "m", totalCents: 100, currency: "USD" },
      { campaignId: null, utmSource: "b", utmMedium: "m", totalCents: 100, currency: "USD" },
      { campaignId: null, utmSource: "b", utmMedium: "m", totalCents: 100, currency: "USD" },
      { campaignId: null, utmSource: "b", utmMedium: "m", totalCents: 100, currency: "USD" },
    ];

    const rows = summarizeSourceMediumBreakdown(orders);

    const first = rows[0];
    const second = rows[1];

    if (!first || !second) throw new Error("Expected at least two source/medium rows");

    expect(first.source).toBe("b");
    expect(first.orderCount).toBe(3);
    expect(second.source).toBe("a");
  });

  it("returns an empty array, not a fabricated row, when there is no unattributed traffic", () => {
    const orders = [{ campaignId: "camp_a", utmSource: null, utmMedium: null, totalCents: 100, currency: "USD" }];
    expect(summarizeSourceMediumBreakdown(orders)).toEqual([]);
  });
});