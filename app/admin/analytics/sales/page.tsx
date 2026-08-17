import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { formatCents } from "@/lib/commerce/money";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import {
  getCollectionPerformance,
  getOrderStatusDistribution,
  getOrdersPlacedSeries,
  getRevenueSeries,
  getSalesKpis,
  hasRecordedRefunds,
} from "@/lib/analytics/sales";
import { formatShare, formatTrend } from "@/lib/analytics/compute";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  CurrencyBreakdown,
  DataNotes,
  RangePicker,
  RangeSummary,
} from "@/components/admin/analytics-shell";
import { DistributionBars, SeriesChart } from "@/components/admin/analytics-charts";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Sales analytics" };
export const dynamic = "force-dynamic";

/**
 * Sales.
 *
 * The two charts on this page are on DIFFERENT time axes and say so: revenue is
 * plotted on the date payment settled, order volume on the date the order was
 * placed. They are not two views of one number, and presenting them as if they
 * were is how a studio concludes that half its orders vanished when in fact
 * they were paid in the following month.
 */
export default async function SalesAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("order:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);
  const { range, currency } = filters;

  const [kpis, revenueSeries, ordersSeries, distribution, collections, refundsExist] =
    await Promise.all([
      getSalesKpis(range, context.reportingCurrency),
      getRevenueSeries(range, currency),
      getOrdersPlacedSeries(range),
      getOrderStatusDistribution(range),
      getCollectionPerformance(range, currency),
      hasRecordedRefunds(),
    ]);

  const notes = [
    ...(kpis.revenue.isMixed
      ? [
          {
            id: "mixed-currency",
            severity: "warning" as const,
            message: `Settled orders exist in more than one currency. Headline revenue counts ${kpis.revenue.reportingCurrency} only, and the breakdowns below are scoped to ${currency}. Currencies are never added together.`,
          },
        ]
      : []),
    ...(refundsExist
      ? [
          {
            id: "refunds-recorded",
            severity: "warning" as const,
            message:
              "A refund exists in the payment ledger. Revenue here is the sum of order totals, which is gross rather than net of refunds.",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Sales"
        description={<RangeSummary range={range} />}
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics/sales" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/sales"
      />

      <DataNotes notes={notes} />

      <AdminSection title="Headline figures">
        <StatGrid>
          <StatTile
            label="Revenue"
            value={formatCents(kpis.revenue.primary.cents, kpis.revenue.reportingCurrency)}
            trend={{ label: formatTrend(kpis.revenueTrend), direction: kpis.revenueTrend.direction }}
            note="Settled payments, by date paid"
          />
          <StatTile
            label="Average order"
            value={formatCents(kpis.averageOrderValue.cents, kpis.averageOrderValue.currency)}
            note={kpis.averageOrderValue.count === 0 ? "No settled orders" : undefined}
          />
          <StatTile
            label="Orders placed"
            value={kpis.ordersPlaced}
            trend={{ label: formatTrend(kpis.ordersTrend), direction: kpis.ordersTrend.direction }}
            note="By date placed"
          />
          <StatTile
            label="Orders settled"
            value={kpis.ordersSettled}
            tone={kpis.ordersSettled > 0 ? "positive" : "default"}
          />
        </StatGrid>

        <StatGrid>
          <StatTile
            label="Awaiting payment"
            value={kpis.ordersAwaitingPayment}
            tone={kpis.ordersAwaitingPayment > 0 ? "attention" : "default"}
            href="/admin/orders?payment=UNPAID"
          />
          <StatTile
            label="Payment processing"
            value={kpis.ordersPaymentPending}
            href="/admin/orders?payment=PENDING"
          />
          <StatTile
            label="Payment failed"
            value={kpis.ordersFailed}
            tone={kpis.ordersFailed > 0 ? "attention" : "default"}
            href="/admin/orders?payment=FAILED"
          />
          <StatTile
            label="Cancelled"
            value={kpis.ordersCancelled}
            href="/admin/orders?fulfilment=CANCELLED"
          />
        </StatGrid>

        <CurrencyBreakdown segmentation={kpis.revenue} />
      </AdminSection>

      <AdminSection
        title={`Revenue over time (${currency})`}
        description="Plotted on the date each payment settled — this is income, not demand."
      >
        <SeriesChart
          series={revenueSeries}
          mode="money"
          title={`Revenue by ${revenueSeries.granularity}, ${currency}`}
          emptyTitle="No settled revenue in this period"
          emptyDescription="Revenue appears once a payment clears. Widen the period, or check the orders awaiting payment above."
        />
      </AdminSection>

      <AdminSection
        title="Orders over time"
        description="Plotted on the date each order was placed, whatever became of it — this is demand, not income."
      >
        <SeriesChart
          series={ordersSeries}
          mode="count"
          title={`Orders placed by ${ordersSeries.granularity}`}
          emptyTitle="No orders placed in this period"
          emptyDescription="Orders placed through the storefront appear here."
        />
      </AdminSection>

      <AdminSection
        title="Order status"
        description="Every order placed in this period, by where it currently stands. Payment and fulfilment are separate lifecycles that can legitimately disagree."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="text-heading-3">Payment</h3>
            <DistributionBars
              rows={distribution.payment}
              emptyLabel="No orders placed in this period."
            />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-heading-3">Fulfilment</h3>
            <DistributionBars
              rows={distribution.fulfilment}
              emptyLabel="No orders placed in this period."
            />
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title={`Revenue by range (${currency})`}
        description="Settled revenue attributed to the range each piece belongs to."
      >
        {collections.rows.length === 0 ? (
          <EmptyState
            title="No settled sales in this period"
            description="Revenue by range fills in once pieces sell and their payments clear."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Settled revenue by collection, highest first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Range</TableHead>
                <TableHead className="text-right">Pieces sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.rows.map((row) => (
                <TableRow key={row.collectionId ?? "unassigned"}>
                  <TableCell>
                    {row.collectionId ? (
                      <Link
                        href={`/admin/collections/${row.collectionId}`}
                        className="font-medium hover:text-primary"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{row.name}</span>
                    )}
                  </TableCell>
                  <TableNumericCell>{row.quantity}</TableNumericCell>
                  <TableNumericCell>{formatCents(row.cents, currency)}</TableNumericCell>
                  <TableNumericCell>{formatShare(row.share)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminSection>
    </div>
  );
}
