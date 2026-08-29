/**
 * Campaign performance — pure aggregation only.
 *
 * Same split as lib/marketing/utm.ts against lib/marketing/attribution.ts:
 * this file takes plain arrays already fetched from the database and reduces
 * them to a report; lib/analytics/marketing.ts does the fetching. No `db`
 * import here means this is testable under vitest.config.ts's unit-test
 * aliasing, which stubs `@/lib/db` to throw on any access.
 *
 * EVERYTHING HERE IS DERIVED FROM REAL ROWS PASSED IN. There is no synthetic
 * or estimated figure anywhere in this file — a campaign with no matching
 * orders reports zero, honestly, rather than an interpolated or placeholder
 * number (per the brief's "do not fabricate attribution").
 */

export type CampaignPerformanceInput = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type CampaignOrderInput = {
  campaignId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  totalCents: number;
  currency: string;
};

export type CampaignEnquiryInput = {
  campaignId: string | null;
};

export type CurrencyAmount = { currency: string; cents: number };

export type CampaignPerformanceRow = {
  campaignId: string;
  name: string;
  slug: string;
  status: string;
  orderCount: number;
  revenueByCurrency: CurrencyAmount[];
  enquiryCount: number;
};

function sumByCurrency(orders: { totalCents: number; currency: string }[]): CurrencyAmount[] {
  const byCurrency = new Map<string, number>();
  for (const order of orders) {
    byCurrency.set(order.currency, (byCurrency.get(order.currency) ?? 0) + order.totalCents);
  }
  return [...byCurrency.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * One row per campaign: how many settled orders and commission enquiries in
 * the period link to it, and what those orders were worth (never summed
 * across currencies — see lib/analytics/sales.ts for why).
 *
 * Every real campaign is included even at zero orders and zero enquiries —
 * an empty row is the honest report for a campaign that has not converted
 * yet, and dropping it would make "no data" look like "no campaign".
 */
export function summarizeCampaignPerformance(
  campaigns: CampaignPerformanceInput[],
  orders: CampaignOrderInput[],
  enquiries: CampaignEnquiryInput[],
): CampaignPerformanceRow[] {
  return campaigns.map((campaign) => {
    const campaignOrders = orders.filter((order) => order.campaignId === campaign.id);
    const campaignEnquiries = enquiries.filter((enquiry) => enquiry.campaignId === campaign.id);

    return {
      campaignId: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      status: campaign.status,
      orderCount: campaignOrders.length,
      revenueByCurrency: sumByCurrency(campaignOrders),
      enquiryCount: campaignEnquiries.length,
    };
  });
}

export type SourceMediumRow = {
  source: string;
  medium: string;
  orderCount: number;
  revenueByCurrency: CurrencyAmount[];
};

/**
 * Orders with no linked campaign, grouped by their raw utm_source / utm_medium.
 *
 * This is the honest fallback the brief asks for: "show source/medium
 * breakdown using real orders" when there is no campaign link. An order with
 * neither a campaign nor any UTM value groups under source "direct", medium
 * "none" — a real and common case (a customer who typed the URL in directly),
 * not an error state, so it is labelled plainly rather than hidden.
 */
export function summarizeSourceMediumBreakdown(orders: CampaignOrderInput[]): SourceMediumRow[] {
  const unattributed = orders.filter((order) => !order.campaignId);

  const groups = new Map<
    string,
    { source: string; medium: string; orders: { totalCents: number; currency: string }[] }
  >();

  for (const order of unattributed) {
    const source = order.utmSource ?? "direct";
    const medium = order.utmMedium ?? "none";
    const key = `${source}\u0000${medium}`;
    const group = groups.get(key) ?? { source, medium, orders: [] };
    group.orders.push({ totalCents: order.totalCents, currency: order.currency });
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      source: group.source,
      medium: group.medium,
      orderCount: group.orders.length,
      revenueByCurrency: sumByCurrency(group.orders),
    }))
    .sort((a, b) => b.orderCount - a.orderCount);
}
