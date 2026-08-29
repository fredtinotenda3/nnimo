import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import { getCampaignPerformance } from "@/lib/analytics/marketing";
import { formatCents } from "@/lib/commerce/money";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import { AnalyticsTabs, DataNotes, RangePicker, RangeSummary } from "@/components/admin/analytics-shell";
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
import { CAMPAIGN_STATUS_LABEL } from "@/lib/admin/schemas";

export const metadata: Metadata = { title: "Campaign analytics" };
export const dynamic = "force-dynamic";

/**
 * Campaign performance.
 *
 * Two tables, deliberately. The first is per-campaign — every real campaign in
 * the system, whether or not it has converted yet. The second is the honest
 * fallback the brief asks for: orders that carry UTM parameters but no
 * campaign link, grouped by their raw source/medium, so traffic that never
 * went through a formal campaign is still visible rather than silently
 * dropped from the report.
 *
 * See lib/analytics/marketing.ts for the revenue basis (paidAt, settled
 * orders only) and lib/analytics/marketing-compute.ts for why nothing here is
 * ever estimated.
 */
export default async function CampaignAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("campaign:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);
  const { range } = filters;

  const performance = await getCampaignPerformance(range);

  const notes = [
    {
      id: "revenue-basis",
      severity: "info" as const,
      message:
        "Revenue is measured when payment settled, not when the order was placed, and only counts orders marked Paid or Partially refunded — the same basis as the Sales tab. Enquiry counts are measured by when the enquiry was received.",
    },
    {
      id: "no-fabrication",
      severity: "info" as const,
      message:
        "Every figure below comes from a real order or enquiry already in the database. A campaign with no orders or enquiries in the selected period shows zero.",
    },
  ];

  const totalCampaignRevenue = performance.rows.reduce(
    (sum, row) => sum + row.revenueByCurrency.reduce((s, r) => s + r.cents, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Analytics" title="Campaigns" description={<RangeSummary range={range} />} />

      <AnalyticsTabs role={user.role} current="/admin/analytics/campaigns" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/campaigns"
      />

      <DataNotes notes={notes} />

      <AdminSection title="In this period">
        <StatGrid columns={3}>
          <StatTile label="Campaigns" value={performance.rows.length} href="/admin/campaigns" />
          <StatTile
            label="Settled orders, any campaign"
            value={performance.totalSettledOrders}
            note="Paid or partially refunded"
          />
          <StatTile label="Commission enquiries, any campaign" value={performance.totalEnquiries} />
        </StatGrid>
      </AdminSection>

      <AdminSection
        title="By campaign"
        description="Every campaign, whether or not it has converted in this period."
      >
        {performance.rows.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to start tracking its orders and enquiries here."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">Campaign performance for the selected period</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Enquiries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.rows.map((row) => (
                <TableRow key={row.campaignId}>
                  <TableCell>
                    <Link href={`/admin/campaigns/${row.campaignId}`} className="font-medium hover:text-primary">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CAMPAIGN_STATUS_LABEL[row.status as keyof typeof CAMPAIGN_STATUS_LABEL]}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{row.orderCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.revenueByCurrency.length === 0
                      ? "—"
                      : row.revenueByCurrency
                          .map((r) => formatCents(r.cents, r.currency))
                          .join(" + ")}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.enquiryCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalCampaignRevenue === 0 && performance.rows.length > 0 ? (
          <p className="text-metadata mt-4 text-muted-foreground">
            No campaign-attributed revenue has settled yet in this period.
          </p>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Orders without a campaign, by source and medium"
        description="Traffic carrying UTM parameters that was never linked to a specific campaign."
      >
        {performance.sourceMedium.length === 0 ? (
          <EmptyState
            title="No unattributed traffic in this period"
            description="Settled orders with utm_source/utm_medium but no campaign link will be grouped here."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">Orders by source and medium, outside any campaign</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.sourceMedium.map((row) => (
                <TableRow key={`${row.source}-${row.medium}`}>
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell className="text-muted-foreground">{row.medium}</TableCell>
                  <TableCell className="tabular-nums">{row.orderCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.revenueByCurrency.map((r) => formatCents(r.cents, r.currency)).join(" + ")}
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
