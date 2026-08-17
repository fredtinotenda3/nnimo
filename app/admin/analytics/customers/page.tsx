import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { formatCents } from "@/lib/commerce/money";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import {
  getCustomerKpis,
  getNewCustomerSeries,
  getTopCustomers,
} from "@/lib/analytics/audience";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  DataNotes,
  RangePicker,
  RangeSummary,
} from "@/components/admin/analytics-shell";
import { SeriesChart } from "@/components/admin/analytics-charts";
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

export const metadata: Metadata = { title: "Customer analytics" };
export const dynamic = "force-dynamic";

/**
 * Customers.
 *
 * NO DEMOGRAPHICS. The schema records a name, an email address, a phone number
 * and a marketing-consent flag. Location, age, segment and lifetime-value
 * projections are not in it, so they are not on this page — inferring them from
 * an email domain or a delivery address would be a guess presented as a fact.
 *
 * "Returning" means two or more SETTLED orders. Two abandoned checkouts is not
 * a returning customer, and counting them as one would flatter the number that
 * the studio would most want to act on.
 */
export default async function CustomerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("customer:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);
  const { range, currency } = filters;

  const [kpis, series, top] = await Promise.all([
    getCustomerKpis(range, currency),
    getNewCustomerSeries(range),
    getTopCustomers(range, currency, 10),
  ]);

  const notes = [
    {
      id: "no-demographics",
      severity: "info" as const,
      message:
        "Customer records hold a name, email, phone number and marketing consent. No location, age or segment is stored, so none is reported here.",
    },
    ...(kpis.ordersWithoutCustomer > 0
      ? [
          {
            id: "orphan-orders",
            severity: "info" as const,
            message: `${kpis.ordersWithoutCustomer} settled ${
              kpis.ordersWithoutCustomer === 1 ? "order has" : "orders have"
            } no customer record — the record was deleted after the order was placed. Those orders count towards revenue but not towards the per-customer figures below.`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Customers"
        description={<RangeSummary range={range} />}
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics/customers" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/customers"
      />

      <DataNotes notes={notes} />

      <AdminSection title="Headline figures">
        <StatGrid>
          <StatTile
            label="Customers, all time"
            value={kpis.totalCustomers}
            href="/admin/customers"
          />
          <StatTile label="New in this period" value={kpis.newCustomers} />
          <StatTile
            label="Bought in this period"
            value={kpis.customersWithSettledOrders}
            note="At least one settled order"
          />
          <StatTile
            label="Returning"
            value={kpis.returningCustomers}
            note="Two or more settled orders in this period"
          />
        </StatGrid>

        <StatGrid columns={3}>
          <StatTile
            label="Orders per buying customer"
            value={kpis.ordersPerCustomer === null ? "—" : kpis.ordersPerCustomer.toFixed(2)}
            note={kpis.ordersPerCustomer === null ? "Nobody bought in this period" : undefined}
          />
          <StatTile
            label={`Average customer value (${currency})`}
            value={formatCents(
              kpis.averageCustomerValue.cents,
              kpis.averageCustomerValue.currency,
            )}
            note={
              kpis.averageCustomerValue.count === 0 ? "No settled orders in this period" : undefined
            }
          />
          <StatTile
            label="Orders without a customer record"
            value={kpis.ordersWithoutCustomer}
            tone={kpis.ordersWithoutCustomer > 0 ? "attention" : "default"}
          />
        </StatGrid>
      </AdminSection>

      <AdminSection
        title="New customers over time"
        description="By the date each customer record was first created, which is the first time they checked out."
      >
        <SeriesChart
          series={series}
          mode="count"
          title={`New customers by ${series.granularity}`}
          emptyTitle="No new customers in this period"
          emptyDescription="A customer record is created the first time someone completes checkout."
        />
      </AdminSection>

      <AdminSection
        title={`Highest-spending customers (${currency})`}
        description="By settled revenue in this period."
      >
        {top.length === 0 ? (
          <EmptyState
            title="No settled orders in this period"
            description="Once a payment clears, the customer who placed it appears here."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Customers by settled revenue, highest first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((row) => (
                <TableRow key={row.customerId ?? "removed"}>
                  <TableCell>
                    {row.customerId ? (
                      <Link
                        href={`/admin/customers/${row.customerId}`}
                        className="font-medium hover:text-primary"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{row.name}</span>
                    )}
                    {row.email ? (
                      <span className="text-metadata mt-1 block break-all text-muted-foreground">
                        {row.email}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableNumericCell>{row.orders}</TableNumericCell>
                  <TableNumericCell>{formatCents(row.cents, currency)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminSection>
    </div>
  );
}
