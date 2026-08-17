import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatCents } from "@/lib/commerce/money";
import { FULFILMENT_LABEL, PAYMENT_LABEL } from "@/lib/commerce/fulfilment";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import { getOverview } from "@/lib/analytics/overview";
import { formatCoverage, formatTrend } from "@/lib/analytics/compute";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  CurrencyBreakdown,
  DataNotes,
  RangePicker,
  RangeSummary,
} from "@/components/admin/analytics-shell";
import { SeriesChart } from "@/components/admin/analytics-charts";
import { Badge } from "@/components/ui/badge";
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

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * The executive overview.
 *
 * Four questions, in the order a studio owner asks them: how is the business
 * performing, what is selling, what are customers doing, and what needs
 * attention. Nothing here is a chart for the sake of having one — every panel
 * answers one of those four.
 *
 * Panels are gated on the reader's permissions, and the gate decides what is
 * QUERIED, not just what is rendered. A MARKETING_MANAGER never runs the revenue
 * aggregate at all: hiding a fetched figure in CSS is a slower page and a wider
 * disclosure surface for no benefit.
 */
export default async function AnalyticsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("dashboard:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);

  const showSales = can(user.role, "order:read");
  const showCatalogue = can(user.role, "product:read");
  const showInventory = can(user.role, "inventory:read");
  const showCustomers = can(user.role, "customer:read");
  const showEnquiries = can(user.role, "custom_order:read");

  const overview = await getOverview({
    range: filters.range,
    currency: filters.currency,
    reportingCurrency: context.reportingCurrency,
    include: {
      sales: showSales,
      catalogue: showCatalogue,
      inventory: showInventory,
      customers: showCustomers,
      enquiries: showEnquiries,
      operations: showSales || showCatalogue,
    },
  });

  const { sales, catalogue, inventory, customers, enquiries, operations } = overview;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Business overview"
        description={<RangeSummary range={filters.range} />}
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics"
      />

      <DataNotes notes={overview.notes} />

      {sales ? (
        <AdminSection
          title="How the business is performing"
          description={`Revenue counts settled payments, measured on the date payment cleared, in ${sales.revenue.reportingCurrency}. Order counts are measured on the date the order was placed.`}
        >
          <StatGrid>
            <StatTile
              label="Revenue"
              value={formatCents(sales.revenue.primary.cents, sales.revenue.reportingCurrency)}
              trend={{
                label: formatTrend(sales.revenueTrend),
                direction: sales.revenueTrend.direction,
              }}
              note="Settled payments only"
            />
            <StatTile
              label="Orders placed"
              value={sales.ordersPlaced}
              trend={{ label: formatTrend(sales.ordersTrend), direction: sales.ordersTrend.direction }}
              href="/admin/orders"
            />
            <StatTile
              label="Orders settled"
              value={sales.ordersSettled}
              tone={sales.ordersSettled > 0 ? "positive" : "default"}
              href="/admin/orders?payment=PAID"
            />
            <StatTile
              label="Average order"
              value={formatCents(
                sales.averageOrderValue.cents,
                sales.averageOrderValue.currency,
              )}
              note={sales.averageOrderValue.count === 0 ? "No settled orders yet" : undefined}
            />
          </StatGrid>

          <CurrencyBreakdown segmentation={sales.revenue} />

          {overview.revenueSeries ? (
            <SeriesChart
              series={overview.revenueSeries}
              mode="money"
              title={`Revenue by ${overview.revenueSeries.granularity}, ${filters.currency}`}
              emptyTitle="No settled revenue in this period"
              emptyDescription="Revenue appears here once a payment clears. Try a wider period, or check orders awaiting payment below."
            />
          ) : null}
        </AdminSection>
      ) : null}

      {catalogue ? (
        <AdminSection
          title="What is sellable"
          description="A piece being in the catalogue does not make it purchasable. These counts show the gap."
        >
          <StatGrid>
            <StatTile
              label="Published pieces"
              value={catalogue.published}
              href="/admin/products?stage=PUBLISHED"
            />
            <StatTile
              label="With a confirmed price"
              value={catalogue.priced}
              note={formatCoverage(catalogue.pricedCoverage, "pieces")}
            />
            <StatTile
              label="Price on request"
              value={catalogue.priceOnRequest}
              note="Enquiry-only, cannot generate revenue"
            />
            <StatTile
              label="Published, not purchasable"
              value={catalogue.publishedWithoutPrice}
              tone={catalogue.publishedWithoutPrice > 0 ? "attention" : "default"}
              href="/admin/products?needs=unsellable"
            />
          </StatGrid>
        </AdminSection>
      ) : null}

      {customers ? (
        <AdminSection title="What customers are doing">
          <StatGrid>
            <StatTile label="Customers" value={customers.totalCustomers} href="/admin/customers" />
            <StatTile label="New this period" value={customers.newCustomers} />
            <StatTile
              label="Returning"
              value={customers.returningCustomers}
              note="Two or more settled orders"
            />
            <StatTile
              label="Average customer value"
              value={formatCents(
                customers.averageCustomerValue.cents,
                customers.averageCustomerValue.currency,
              )}
              note={
                customers.averageCustomerValue.count === 0
                  ? "No settled orders in this period"
                  : undefined
              }
            />
          </StatGrid>
        </AdminSection>
      ) : null}

      {enquiries ? (
        <AdminSection
          title="Enquiries"
          description="Commission and wholesale enquiries received in this period."
        >
          <StatGrid>
            <StatTile
              label="Commission enquiries"
              value={enquiries.totalCustomOrders}
              href="/admin/inquiries"
            />
            <StatTile
              label="New"
              value={enquiries.newCustomOrders}
              tone={enquiries.newCustomOrders > 0 ? "attention" : "default"}
              href="/admin/inquiries?status=NEW"
            />
            <StatTile
              label="Progressed past quote"
              value={enquiries.progressedCustomOrders}
              note="Approved or further"
            />
            <StatTile label="Wholesale enquiries" value={enquiries.totalWholesale} />
          </StatGrid>
        </AdminSection>
      ) : null}

      {inventory ? (
        <AdminSection
          title="Stock"
          description="Stock on hand, where the studio has counted it."
        >
          {inventory.trackedProducts === 0 ? (
            <EmptyState
              title="No stock counted yet"
              description="No piece has an inventory record, so there is nothing to report. This is not the same as having nothing in stock — an uncounted piece is unknown, not empty."
            />
          ) : (
            <StatGrid>
              <StatTile label="Pieces counted" value={inventory.trackedProducts} />
              <StatTile label="Available" value={inventory.available} />
              <StatTile
                label="Low stock"
                value={inventory.lowStock}
                tone={inventory.lowStock > 0 ? "attention" : "default"}
              />
              <StatTile
                label="Out of stock"
                value={inventory.outOfStock}
                tone={inventory.outOfStock > 0 ? "attention" : "default"}
              />
            </StatGrid>
          )}
        </AdminSection>
      ) : null}

      {operations ? (
        <AdminSection
          title="What needs attention"
          description="Not filtered by the period above — an order that has been waiting since March is more urgent than one from yesterday, not less visible."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <WorklistTable
              title="Awaiting payment"
              orders={operations.unpaidOrders}
              emptyLabel="Nothing awaiting payment."
              href="/admin/orders?payment=UNPAID"
            />
            <WorklistTable
              title="Paid, awaiting fulfilment"
              orders={operations.awaitingFulfilment}
              emptyLabel="Nothing waiting to be made or dispatched."
              href="/admin/orders?fulfilment=CONFIRMED"
            />
          </div>

          {operations.productsNeedingAttention.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-heading-3">Published pieces that cannot be bought</h3>
              <ul className="divide-y divide-border border-y border-border">
                {operations.productsNeedingAttention.map((product) => (
                  <li
                    key={product.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="text-body-sm font-medium hover:text-primary"
                    >
                      {product.name}
                    </Link>
                    <span className="flex flex-wrap gap-2">
                      {product.issues.map((issue) => (
                        <Badge key={issue} variant="outline">
                          {issue}
                        </Badge>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </AdminSection>
      ) : null}
    </div>
  );
}

function WorklistTable({
  title,
  orders,
  emptyLabel,
  href,
}: {
  title: string;
  orders: {
    id: string;
    orderNumber: string;
    customerName: string;
    createdAt: Date;
    cents: number;
    currency: string;
    paymentStatus: string;
    fulfilmentStatus: string;
  }[];
  emptyLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-heading-3">{title}</h3>
        <Link href={href} className="text-nav text-primary hover:underline">
          Open list
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">{title}, oldest first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-body-sm font-medium tabular-nums hover:text-primary"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="text-metadata mt-1 block text-muted-foreground">
                    {order.createdAt.toISOString().slice(0, 10)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                <TableCell>
                  <Badge variant="neutral">
                    {PAYMENT_LABEL[order.paymentStatus as keyof typeof PAYMENT_LABEL] ??
                      FULFILMENT_LABEL[
                        order.fulfilmentStatus as keyof typeof FULFILMENT_LABEL
                      ]}
                  </Badge>
                </TableCell>
                <TableNumericCell>{formatCents(order.cents, order.currency)}</TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
