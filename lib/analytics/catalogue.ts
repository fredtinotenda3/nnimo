import "server-only";
import { db } from "@/lib/db";
import { toCents } from "@/lib/commerce/money";
import { coverage } from "@/lib/analytics/compute";
import type { ResolvedRange } from "@/lib/analytics/range";
import {
  SETTLED_PAYMENT_STATUSES,
  type CatalogueComposition,
  type CurrencyTotal,
  type InventoryKpis,
} from "@/lib/analytics/types";

/**
 * Catalogue and inventory analytics.
 *
 * WHAT THIS FILE REFUSES TO DO
 *
 * Nnino imported 369 pieces from a brochure and a catalogue PDF. Nine of them
 * have a price the business has actually confirmed, and the Inventory table has
 * no rows at all because the studio's stock has never been counted. Both facts
 * are reported as facts:
 *
 *  - Catalogue composition carries a `pricedCoverage`, so "revenue potential"
 *    is never implied across pieces that have no price.
 *  - `productsWithoutRecord` is a separate figure from `outOfStock`. A piece
 *    with no Inventory row is UNCOUNTED, not empty, and rendering it as zero on
 *    hand would be an invented measurement.
 *  - Stock valuation covers only rows that have both a quantity and a price,
 *    and returns the coverage alongside the amount so the UI can qualify it.
 */

const SETTLED = [...SETTLED_PAYMENT_STATUSES];

function settledOrderFilter(range: ResolvedRange) {
  return {
    paymentStatus: { in: SETTLED },
    ...(range.start && range.end ? { paidAt: { gte: range.start, lt: range.end } } : {}),
  } as const;
}

export async function getCatalogueComposition(): Promise<CatalogueComposition> {
  const [
    published,
    catalogueOnly,
    archived,
    priced,
    publishedWithoutPrice,
    withoutImages,
    total,
  ] = await Promise.all([
    db.product.count({ where: { lifecycleStage: "PUBLISHED" } }),
    db.product.count({ where: { lifecycleStage: "CATALOGUE" } }),
    db.product.count({ where: { lifecycleStage: "ARCHIVED" } }),
    db.product.count({ where: { price: { not: null } } }),
    db.product.count({ where: { lifecycleStage: "PUBLISHED", price: null } }),
    db.product.count({ where: { images: { none: {} } } }),
    db.product.count(),
  ]);

  return {
    published,
    catalogueOnly,
    archived,
    priced,
    priceOnRequest: total - priced,
    publishedWithoutPrice,
    withoutImages,
    total,
    pricedCoverage: coverage(priced, total),
  };
}

/**
 * Pieces that have never sold in the period.
 *
 * Not scoped to a currency: "did this sell at all" is a catalogue question, and
 * a piece sold once in rand has still sold. The revenue tables are the ones
 * that must stay single-currency.
 */
export async function getUnsoldProductCount(range: ResolvedRange): Promise<{
  unsold: number;
  publishedUnsold: number;
  sold: number;
}> {
  const soldFilter = { some: { order: settledOrderFilter(range) } } as const;
  const unsoldFilter = { none: { order: settledOrderFilter(range) } } as const;

  const [unsold, publishedUnsold, sold] = await Promise.all([
    db.product.count({ where: { orderItems: unsoldFilter } }),
    db.product.count({ where: { lifecycleStage: "PUBLISHED", orderItems: unsoldFilter } }),
    db.product.count({ where: { orderItems: soldFilter } }),
  ]);

  return { unsold, publishedUnsold, sold };
}

/**
 * Stock, in the three states it can actually be in.
 *
 * `available` is derived here exactly as lib/inventory.ts derives it — onHand
 * minus reserved — rather than read from a column, because there is no such
 * column by design. The FILTER clauses reproduce `isLowStock`'s rule in SQL:
 * low stock means some stock remains and it is at or below the threshold, which
 * is a different row from out of stock.
 */
type InventoryRow = {
  tracked: number;
  on_hand: number;
  reserved: number;
  low_stock: number;
  out_of_stock: number;
};

type ValuationRow = { currency: string; amount: string; valued: number };

export async function getInventoryKpis(): Promise<InventoryKpis> {
  const [snapshotRows, valuationRows, productsWithoutRecord] = await Promise.all([
    db.$queryRaw<InventoryRow[]>`
      SELECT
        COUNT(*)::int                                   AS tracked,
        COALESCE(SUM("onHand"), 0)::int                 AS on_hand,
        COALESCE(SUM("reserved"), 0)::int               AS reserved,
        COUNT(*) FILTER (
          WHERE "onHand" - "reserved" > 0
            AND "onHand" - "reserved" <= "lowStockThreshold"
        )::int                                          AS low_stock,
        COUNT(*) FILTER (WHERE "onHand" - "reserved" <= 0)::int AS out_of_stock
      FROM "Inventory"
    `,
    // Valuation joins to Product for the price AND the currency: a piece priced
    // in one currency must never be added to a piece priced in another, so the
    // result is grouped rather than totalled.
    db.$queryRaw<ValuationRow[]>`
      SELECT
        p."currency" AS currency,
        COALESCE(SUM(i."onHand" * p."price"), 0)::text AS amount,
        COUNT(*)::int AS valued
      FROM "Inventory" i
      JOIN "Product" p ON p."id" = i."productId"
      WHERE p."price" IS NOT NULL
        AND i."onHand" > 0
      GROUP BY 1
    `,
    db.product.count({ where: { inventory: { is: null } } }),
  ]);

  const snapshot = snapshotRows[0] ?? {
    tracked: 0,
    on_hand: 0,
    reserved: 0,
    low_stock: 0,
    out_of_stock: 0,
  };

  const value: CurrencyTotal[] = valuationRows.map((row) => ({
    currency: row.currency,
    cents: toCents(row.amount) ?? 0,
    count: row.valued,
  }));

  const valuedRows = value.reduce((total, row) => total + row.count, 0);

  return {
    trackedProducts: snapshot.tracked,
    productsWithoutRecord,
    onHand: snapshot.on_hand,
    reserved: snapshot.reserved,
    available: Math.max(0, snapshot.on_hand - snapshot.reserved),
    lowStock: snapshot.low_stock,
    outOfStock: snapshot.out_of_stock,
    value,
    valuationCoverage: coverage(valuedRows, snapshot.tracked),
  };
}

/**
 * The low-stock and out-of-stock worklists.
 *
 * Bounded by `take` and driven by the `inventory_low_stock` partial index added
 * in Phase 5, which is exactly this predicate. Returns nothing at all today,
 * because there is nothing to count yet.
 */
export async function getStockWorklists(take = 10): Promise<{
  lowStock: { id: string; name: string; slug: string; available: number; threshold: number }[];
  outOfStock: { id: string; name: string; slug: string }[];
}> {
  const rows = await db.inventory.findMany({
    select: {
      onHand: true,
      reserved: true,
      lowStockThreshold: true,
      product: { select: { id: true, name: true, slug: true } },
    },
    // Bounded: the partial index keeps this to the rows that are actually low,
    // but the studio should still never render an unbounded list.
    take: take * 4,
    orderBy: { updatedAt: "desc" },
  });

  const lowStock: {
    id: string;
    name: string;
    slug: string;
    available: number;
    threshold: number;
  }[] = [];
  const outOfStock: { id: string; name: string; slug: string }[] = [];

  for (const row of rows) {
    const available = Math.max(0, row.onHand - row.reserved);
    if (available <= 0) {
      if (outOfStock.length < take) {
        outOfStock.push({
          id: row.product.id,
          name: row.product.name,
          slug: row.product.slug,
        });
      }
    } else if (available <= row.lowStockThreshold && lowStock.length < take) {
      lowStock.push({
        id: row.product.id,
        name: row.product.name,
        slug: row.product.slug,
        available,
        threshold: row.lowStockThreshold,
      });
    }
  }

  return { lowStock, outOfStock };
}
