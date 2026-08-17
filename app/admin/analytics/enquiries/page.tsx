import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import {
  CUSTOM_ORDER_STATUS_LABEL,
  getEnquiryKpis,
  getEnquirySeries,
  getRecentEnquiries,
} from "@/lib/analytics/audience";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  DataNotes,
  RangePicker,
  RangeSummary,
} from "@/components/admin/analytics-shell";
import { DistributionBars, SeriesChart } from "@/components/admin/analytics-charts";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomOrderStatus } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = { title: "Enquiry analytics" };
export const dynamic = "force-dynamic";

/**
 * Enquiries.
 *
 * THERE IS NO CONVERSION RATE HERE, and its absence is deliberate.
 * `CustomOrderInquiry` carries no foreign key to `Order` and shares no key with
 * it; the only way to link the two would be to match on email address, which
 * would credit a commission enquiry with a shop order the same person happened
 * to place, and miss every commission that was quoted and paid for by an
 * organisation. That is a guess, and a guess rendered as a percentage is
 * indistinguishable from a measurement once it is on a dashboard.
 *
 * What the schema DOES support is the enquiry's own progression: how many
 * reached a quote, and how many went past one. That is reported instead, and
 * labelled for what it is.
 */
export default async function EnquiryAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("custom_order:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);
  const { range } = filters;

  const [kpis, series, recent] = await Promise.all([
    getEnquiryKpis(range),
    getEnquirySeries(range),
    getRecentEnquiries(8),
  ]);

  const notes = [
    {
      id: "no-conversion",
      severity: "info" as const,
      message:
        "Enquiry-to-order conversion is not reported. Commission enquiries are not linked to orders in the database, and matching them by email address would be a guess. The pipeline progression below is what the data actually supports.",
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Enquiries"
        description={<RangeSummary range={range} />}
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics/enquiries" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/enquiries"
      />

      <DataNotes notes={notes} />

      <AdminSection title="Received in this period">
        <StatGrid>
          <StatTile
            label="Commission enquiries"
            value={kpis.totalCustomOrders}
            href="/admin/inquiries"
          />
          <StatTile
            label="New, unanswered"
            value={kpis.newCustomOrders}
            tone={kpis.newCustomOrders > 0 ? "attention" : "default"}
            href="/admin/inquiries?status=NEW"
          />
          <StatTile
            label="Quoted"
            value={kpis.quotedCustomOrders}
            note="Awaiting the customer's decision"
          />
          <StatTile
            label="Progressed past quote"
            value={kpis.progressedCustomOrders}
            note="Approved or further"
          />
        </StatGrid>

        <StatGrid columns={3}>
          <StatTile label="Still open" value={kpis.openCustomOrders} />
          <StatTile label="Wholesale enquiries" value={kpis.totalWholesale} />
          <StatTile
            label="New wholesale"
            value={kpis.newWholesale}
            tone={kpis.newWholesale > 0 ? "attention" : "default"}
          />
        </StatGrid>
      </AdminSection>

      <AdminSection
        title="Enquiries over time"
        description="Commission enquiries, by the date they were received."
      >
        <SeriesChart
          series={series}
          mode="count"
          title={`Commission enquiries by ${series.granularity}`}
          emptyTitle="No enquiries in this period"
          emptyDescription="Commission enquiries submitted through the custom-order form appear here."
        />
      </AdminSection>

      <AdminSection
        title="Pipeline"
        description="Where every enquiry received in this period currently stands."
      >
        <DistributionBars
          rows={kpis.statusDistribution}
          emptyLabel="No enquiries received in this period."
        />
      </AdminSection>

      <AdminSection
        title="Most recent enquiries"
        description="The latest enquiries received, whatever the selected period."
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No enquiries yet"
            description="Enquiries from the custom commission form will appear here."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">The most recent enquiries</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Enquiry</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((enquiry) => (
                <TableRow key={enquiry.id}>
                  <TableCell>
                    <Link
                      href={`/admin/inquiries/${enquiry.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {enquiry.customerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{enquiry.requestType}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {enquiry.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CUSTOM_ORDER_STATUS_LABEL[enquiry.status as CustomOrderStatus]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminSection>
    </div>
  );
}
