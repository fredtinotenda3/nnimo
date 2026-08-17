import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { formatCents } from "@/lib/commerce/money";
import type { SearchParams } from "@/lib/admin/query";
import { resolveAnalyticsRequest } from "@/lib/analytics/context";
import { getInventoryKpis, getStockWorklists } from "@/lib/analytics/catalogue";
import { formatCoverage } from "@/lib/analytics/compute";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
import {
  AnalyticsTabs,
  DataNotes,
  RangePicker,
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

export const metadata: Metadata = { title: "Inventory analytics" };
export const dynamic = "force-dynamic";

/**
 * Inventory.
 *
 * THIS PAGE REPORTS ON STOCK; IT DOES NOT MANAGE IT. Adjusting quantities
 * remains unbuilt (/admin/inventory, `built: false`), and marking it live
 * because a reporting view exists would promise an editing surface that does
 * not.
 *
 * THE STATE THAT MATTERS MOST HERE IS "UNCOUNTED". Nnino has never counted its
 * studio stock, so the Inventory table is empty and nearly every piece has no
 * record at all. A piece with no record is UNKNOWN, not zero, and the two are
 * shown as separate figures throughout — reporting 369 pieces as out of stock
 * would be a fabricated measurement, and reporting them as in stock would be
 * worse.
 *
 * Stock is a present-tense fact, so the range picker does not filter these
 * figures. It is still rendered, because it carries the operator's chosen
 * period across to the other analytics sections.
 */
export default async function InventoryAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("inventory:read");
  const params = await searchParams;
  const { context, filters } = await resolveAnalyticsRequest(params);

  const [kpis, worklists] = await Promise.all([getInventoryKpis(), getStockWorklists(10)]);

  const notes = [
    {
      id: "point-in-time",
      severity: "info" as const,
      message:
        "Stock is a present-tense figure — these numbers describe now, not the selected period. The period is kept so the other analytics sections stay on it.",
    },
    ...(kpis.productsWithoutRecord > 0
      ? [
          {
            id: "uncounted",
            severity: "info" as const,
            message: `${kpis.productsWithoutRecord} ${
              kpis.productsWithoutRecord === 1 ? "piece has" : "pieces have"
            } no stock record. Those are uncounted, not out of stock, and are excluded from every figure below rather than counted as zero.`,
          },
        ]
      : []),
    ...(kpis.trackedProducts > 0 &&
    kpis.valuationCoverage.covered < kpis.trackedProducts
      ? [
          {
            id: "valuation-coverage",
            severity: "info" as const,
            message: `Stock value covers ${formatCoverage(
              kpis.valuationCoverage,
              "counted pieces",
            )}. A piece with no confirmed price cannot be valued.`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Analytics"
        title="Inventory"
        description="Stock on hand, reserved and available, for pieces the studio has counted."
      />

      <AnalyticsTabs role={user.role} current="/admin/analytics/inventory" filters={filters} />

      <RangePicker
        filters={filters}
        availableCurrencies={context.availableCurrencies}
        basePath="/admin/analytics/inventory"
      />

      <DataNotes notes={notes} />

      {kpis.trackedProducts === 0 ? (
        <EmptyState
          title="No stock has been counted yet"
          description="No piece has an inventory record, so there is nothing to report. Counting stock is a studio task, not a data problem — until it happens, showing zeroes here would be inventing a measurement."
        />
      ) : (
        <>
          <AdminSection title="Stock position">
            <StatGrid>
              <StatTile label="Pieces counted" value={kpis.trackedProducts} />
              <StatTile label="On hand" value={kpis.onHand} />
              <StatTile
                label="Reserved"
                value={kpis.reserved}
                note="Held against unpaid or unfulfilled orders"
              />
              <StatTile
                label="Available"
                value={kpis.available}
                note="On hand minus reserved"
              />
            </StatGrid>

            <StatGrid columns={3}>
              <StatTile
                label="Low stock"
                value={kpis.lowStock}
                tone={kpis.lowStock > 0 ? "attention" : "default"}
              />
              <StatTile
                label="Out of stock"
                value={kpis.outOfStock}
                tone={kpis.outOfStock > 0 ? "attention" : "default"}
              />
              <StatTile
                label="Uncounted pieces"
                value={kpis.productsWithoutRecord}
                note="No stock record — unknown, not empty"
              />
            </StatGrid>
          </AdminSection>

          <AdminSection
            title="Stock value"
            description="Quantity on hand multiplied by the confirmed price, grouped by the currency each piece is priced in."
          >
            {kpis.value.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                None of the counted pieces has a confirmed price, so no value can be
                calculated.
              </p>
            ) : (
              <StatGrid columns={3}>
                {kpis.value.map((total) => (
                  <StatTile
                    key={total.currency}
                    label={`Value (${total.currency})`}
                    value={formatCents(total.cents, total.currency)}
                    note={`${total.count} ${total.count === 1 ? "piece" : "pieces"}`}
                  />
                ))}
              </StatGrid>
            )}
          </AdminSection>

          <AdminSection title="Needs restocking">
            {worklists.lowStock.length === 0 && worklists.outOfStock.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                Nothing is low or out of stock.
              </p>
            ) : (
              <Table>
                <TableCaption className="sr-only">
                  Pieces that are low or out of stock
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Piece</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {worklists.outOfStock.map((row) => (
                    <TableRow key={`out-${row.id}`}>
                      <TableCell>
                        <Link
                          href={`/admin/products/${row.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">Out of stock</TableCell>
                      <TableNumericCell>0</TableNumericCell>
                      <TableNumericCell>—</TableNumericCell>
                    </TableRow>
                  ))}
                  {worklists.lowStock.map((row) => (
                    <TableRow key={`low-${row.id}`}>
                      <TableCell>
                        <Link
                          href={`/admin/products/${row.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">Low stock</TableCell>
                      <TableNumericCell>{row.available}</TableNumericCell>
                      <TableNumericCell>{row.threshold}</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AdminSection>
        </>
      )}
    </div>
  );
}
