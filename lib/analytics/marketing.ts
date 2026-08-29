import "server-only";
import { db } from "@/lib/db";
import { toCents } from "@/lib/commerce/money";
import { SETTLED_PAYMENT_STATUSES } from "@/lib/analytics/types";
import type { ResolvedRange } from "@/lib/analytics/range";
import {
  summarizeCampaignPerformance,
  summarizeSourceMediumBreakdown,
  type CampaignOrderInput,
  type CampaignPerformanceRow,
  type SourceMediumRow,
} from "@/lib/analytics/marketing-compute";

export type CampaignPerformanceResult = {
  rows: CampaignPerformanceRow[];
  sourceMedium: SourceMediumRow[];
  totalSettledOrders: number;
  totalEnquiries: number;
};

/**
 * Campaign performance.
 *
 * REVENUE BASIS: same rule as lib/analytics/sales.ts — revenue is measured on
 * `paidAt`, not `createdAt`, and only for orders whose paymentStatus is PAID
 * or PARTIALLY_REFUNDED. Using `createdAt` here would attribute a payment that
 * settled in a later period back onto the campaign that drove the click,
 * which disagrees with what every other revenue figure in this admin means by
 * "revenue in this period". The predicate matches the partial index
 * `order_settled_paid_at` from the Phase 7 migration, so this query is served
 * by an index-only scan rather than a sequential one.
 *
 * ENQUIRY BASIS: `CustomOrderInquiry` has no equivalent settled/paid concept —
 * an enquiry is either received or it is not — so enquiries are windowed on
 * `createdAt`, the same axis lib/analytics/audience.ts already uses for
 * enquiry volume.
 *
 * NOTHING IS FABRICATED. Every figure here is a real count or a real sum over
 * rows that exist. A campaign with no orders or enquiries in the period
 * reports zero — see lib/analytics/marketing-compute.ts.
 */
export async function getCampaignPerformance(range: ResolvedRange): Promise<CampaignPerformanceResult> {
  const paidWhere = range.start && range.end ? { paidAt: { gte: range.start, lt: range.end } } : {};
  const createdWhere = range.start && range.end ? { createdAt: { gte: range.start, lt: range.end } } : {};

  const [campaigns, settledOrders, enquiries] = await Promise.all([
    db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, status: true },
    }),
    db.order.findMany({
      where: { ...paidWhere, paymentStatus: { in: [...SETTLED_PAYMENT_STATUSES] } },
      select: { campaignId: true, utmSource: true, utmMedium: true, total: true, currency: true },
    }),
    db.customOrderInquiry.findMany({
      where: createdWhere,
      select: { campaignId: true },
    }),
  ]);

  const orderInputs: CampaignOrderInput[] = settledOrders.map((order) => ({
    campaignId: order.campaignId,
    utmSource: order.utmSource,
    utmMedium: order.utmMedium,
    totalCents: toCents(order.total) ?? 0,
    currency: order.currency,
  }));

  return {
    rows: summarizeCampaignPerformance(campaigns, orderInputs, enquiries),
    sourceMedium: summarizeSourceMediumBreakdown(orderInputs),
    totalSettledOrders: settledOrders.length,
    totalEnquiries: enquiries.length,
  };
}
