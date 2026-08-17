import "server-only";
import { getSalesKpis, getRevenueSeries, hasRecordedRefunds } from "@/lib/analytics/sales";
import { getCatalogueComposition, getInventoryKpis } from "@/lib/analytics/catalogue";
import { getCustomerKpis, getEnquiryKpis } from "@/lib/analytics/audience";
import { getOperationsWorklist } from "@/lib/analytics/operations";
import type { ResolvedRange } from "@/lib/analytics/range";
import { formatCoverage } from "@/lib/analytics/compute";
import type {
  CatalogueComposition,
  CustomerKpis,
  DataNote,
  EnquiryKpis,
  InventoryKpis,
  OperationsWorklist,
  SalesKpis,
  Series,
} from "@/lib/analytics/types";

/**
 * The executive summary.
 *
 * One composition point for the four questions the studio owner actually asks:
 * how is the business performing, what is selling, what are customers doing,
 * and what needs attention. Each section is fetched only if the caller asked
 * for it, because the dashboard gates panels on permission and a MARKETING
 * MANAGER should not be running the revenue query at all — least privilege is
 * cheaper as well as safer.
 *
 * `notes` is where the honesty lives. Rather than hard-coding caveats into JSX
 * — where they drift, get copied inconsistently, and outlive the condition they
 * describe — every limitation is derived from the data that was just fetched
 * and disappears on its own when the underlying gap closes.
 */

export type OverviewSections = {
  sales?: SalesKpis;
  revenueSeries?: Series;
  catalogue?: CatalogueComposition;
  inventory?: InventoryKpis;
  customers?: CustomerKpis;
  enquiries?: EnquiryKpis;
  operations?: OperationsWorklist;
  notes: DataNote[];
};

export type OverviewRequest = {
  range: ResolvedRange;
  currency: string;
  reportingCurrency: string;
  include: {
    sales: boolean;
    catalogue: boolean;
    inventory: boolean;
    customers: boolean;
    enquiries: boolean;
    operations: boolean;
  };
};

export async function getOverview(request: OverviewRequest): Promise<OverviewSections> {
  const { range, currency, reportingCurrency, include } = request;

  const [sales, revenueSeries, refundsExist, catalogue, inventory, customers, enquiries, operations] =
    await Promise.all([
      include.sales ? getSalesKpis(range, reportingCurrency) : undefined,
      include.sales ? getRevenueSeries(range, currency) : undefined,
      include.sales ? hasRecordedRefunds() : false,
      include.catalogue ? getCatalogueComposition() : undefined,
      include.inventory ? getInventoryKpis() : undefined,
      include.customers ? getCustomerKpis(range, currency) : undefined,
      include.enquiries ? getEnquiryKpis(range) : undefined,
      include.operations ? getOperationsWorklist() : undefined,
    ]);

  return {
    sales,
    revenueSeries,
    catalogue,
    inventory,
    customers,
    enquiries,
    operations,
    notes: buildNotes({ sales, catalogue, inventory, customers, refundsExist, range }),
  };
}

/**
 * Derives the caveats that apply to THIS data, right now.
 *
 * Each note states a limitation the figures above it genuinely have. None is
 * unconditional: when the studio counts its stock, prices its catalogue or
 * starts trading in one currency, the corresponding note stops rendering
 * without anyone editing a page.
 */
function buildNotes(input: {
  sales?: SalesKpis;
  catalogue?: CatalogueComposition;
  inventory?: InventoryKpis;
  customers?: CustomerKpis;
  refundsExist: boolean;
  range: ResolvedRange;
}): DataNote[] {
  const notes: DataNote[] = [];

  if (input.sales?.revenue.isMixed) {
    const excluded = input.sales.revenue.excludedCount;
    notes.push({
      id: "mixed-currency",
      severity: "warning",
      message:
        `Settled orders exist in more than one currency. Revenue figures count ` +
        `${input.sales.revenue.reportingCurrency} only — currencies are never added together, ` +
        `because the result would not be money in any currency. ` +
        `${excluded} settled ${excluded === 1 ? "order is" : "orders are"} excluded and shown separately.`,
    });
  }

  if (input.refundsExist) {
    notes.push({
      id: "refunds-recorded",
      severity: "warning",
      message:
        "A refund has been recorded in the payment ledger. Revenue here is the sum of order " +
        "totals, which is gross rather than net of refunds — treat these figures as an upper bound " +
        "until net revenue is reported from the payment ledger.",
    });
  }

  if (input.catalogue && input.catalogue.pricedCoverage.covered < input.catalogue.total) {
    notes.push({
      id: "price-coverage",
      severity: "info",
      message:
        `${formatCoverage(input.catalogue.pricedCoverage, "pieces")} have a confirmed price. ` +
        `Pieces without one are enquiry-only and cannot generate revenue, so they are absent from ` +
        `every sales figure rather than counted as zero.`,
    });
  }

  if (input.inventory && input.inventory.trackedProducts === 0) {
    notes.push({
      id: "inventory-uncounted",
      severity: "info",
      message:
        "No stock has been counted yet, so there are no inventory figures to report. This is " +
        "different from having nothing in stock — pieces with no stock record are uncounted, not empty.",
    });
  } else if (input.inventory && input.inventory.valuationCoverage.covered < input.inventory.trackedProducts) {
    notes.push({
      id: "valuation-coverage",
      severity: "info",
      message:
        `Stock is valued across ${formatCoverage(input.inventory.valuationCoverage, "counted pieces")}. ` +
        `Pieces without a confirmed price cannot be valued and are excluded.`,
    });
  }

  if (input.customers && input.customers.ordersWithoutCustomer > 0) {
    const count = input.customers.ordersWithoutCustomer;
    notes.push({
      id: "orphan-orders",
      severity: "info",
      message:
        `${count} settled ${count === 1 ? "order has" : "orders have"} no customer record — the ` +
        `record was deleted after the order was placed. Those orders count towards revenue but not ` +
        `towards per-customer figures.`,
    });
  }

  if (input.range.preset === "all_time") {
    notes.push({
      id: "all-time-series",
      severity: "info",
      message:
        "Over all time, charts show only the periods that contain activity — empty periods are not " +
        "filled in, because there is no start date to count them from.",
    });
  }

  return notes;
}
