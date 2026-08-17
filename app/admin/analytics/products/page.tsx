import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { formatCents } from "@/lib/commerce/money";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import { getProductPerformance } from "@/lib/analytics/sales";
import { getCatalogueComposition, getUnsoldProductCount } from "@/lib/analytics/catalogue";
import { formatCoverage, formatShare } from "@/lib/analytics/compute";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  DataNotes,
  RangePicker,
  RangeSummary,
} from "@/components/admin/analytics-shell";
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

export const metadata: Metadata = { title: "Product analytics" };
export const dynamic = "force-dynamic";

/**
 * Products.
 *
 * "Demand" here means UNITS SOLD and nothing else. There is no view tracking,
 * no cart-abandonment record and no wishlist in this schema, so any other
 * demand signal would be invented. A best-seller table built from order lines
 * is a measurement; a "most viewed" table would not be.
 *
 * Catalogue composition is deliberately shown alongside the sales table,
 * because on this catalogue the two are inseparable: most pieces have no
 * confirmed price, cannot be bought, and therefore cannot appear in a revenue
 * ranking at all. Reading the ranking without the coverage figure would suggest
 * a long tail of poor sellers where there is really a long tail of pieces the
 * studio has never priced.
 */
export default async function ProductAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("product:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);
  const { range, currency } = filters;

  const [performance, composition, unsold] = await Promise.all([
    getProductPerformance(range, currency, 15),
    getCatalogueComposition(),
    getUnsoldProductCount(range),
  ]);

  const notes = [
    {
      id: "price-coverage",
      severity: "info" as const,
      message: `${formatCoverage(composition.pricedCoverage, "pieces")} have a confirmed price. Pieces without one are enquiry-only, cannot generate revenue, and are therefore absent from the ranking below rather than shown as zero.`,
    },
    ...(context.availableCurrencies.length > 1
      ? [
          {
            id: "currency-scope",
            severity: "warning" as const,
            message: `Sales figures below are scoped to ${currency}. Ranking pieces by a total that added two currencies together would not be a meaningful order.`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Products"
        description={<RangeSummary range={range} />}
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics/products" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/products"
      />

      <DataNotes notes={notes} />

      <AdminSection title="Catalogue composition" description="All pieces, whatever the period.">
        <StatGrid>
          <StatTile
            label="Published"
            value={composition.published}
            href="/admin/products?stage=PUBLISHED"
          />
          <StatTile
            label="Catalogue only"
            value={composition.catalogueOnly}
            note="Known to exist, not on the site"
            href="/admin/products?stage=CATALOGUE"
          />
          <StatTile label="Archived" value={composition.archived} />
          <StatTile label="Total pieces" value={composition.total} />
        </StatGrid>

        <StatGrid>
          <StatTile label="With a confirmed price" value={composition.priced} />
          <StatTile
            label="Price on request"
            value={composition.priceOnRequest}
            note="Cannot be purchased"
          />
          <StatTile
            label="Published, not purchasable"
            value={composition.publishedWithoutPrice}
            tone={composition.publishedWithoutPrice > 0 ? "attention" : "default"}
            href="/admin/products?needs=unsellable"
          />
          <StatTile
            label="Without a photograph"
            value={composition.withoutImages}
            href="/admin/products?needs=needs_image"
          />
        </StatGrid>
      </AdminSection>

      <AdminSection
        title="Sales in this period"
        description="Counted from settled orders only. A piece is 'sold' when the payment for it cleared."
      >
        <StatGrid columns={3}>
          <StatTile label="Pieces that sold" value={unsold.sold} />
          <StatTile
            label="Published pieces with no sales"
            value={unsold.publishedUnsold}
            note="Live on the site, nothing sold in this period"
          />
          <StatTile
            label="All pieces with no sales"
            value={unsold.unsold}
            note="Includes catalogue-only and unpriced pieces"
          />
        </StatGrid>
      </AdminSection>

      <AdminSection
        title={`Best sellers (${currency})`}
        description="By settled revenue. Shares are of all settled revenue in this period, not of the rows shown."
      >
        {performance.rows.length === 0 ? (
          <EmptyState
            title="Nothing sold in this period"
            description="Once an order's payment clears, the pieces on it appear here ranked by revenue."
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Pieces by settled revenue, highest first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Piece</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.rows.map((row) => (
                <TableRow key={row.productId ?? "removed"}>
                  <TableCell>
                    {row.productId ? (
                      <Link
                        href={`/admin/products/${row.productId}`}
                        className="font-medium hover:text-primary"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {row.name}
                        <span className="text-metadata mt-1 block">
                          Revenue from pieces deleted after they were sold. Kept so the
                          shares above remain correct.
                        </span>
                      </span>
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
