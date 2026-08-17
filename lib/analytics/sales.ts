import "server-only";
import { db } from "@/lib/db";
import { toCents } from "@/lib/commerce/money";
import { FULFILMENT_LABEL, PAYMENT_LABEL } from "@/lib/commerce/fulfilment";
import {
  BUCKET_KEY_FORMAT,
  BUCKET_TRUNC_UNIT,
  alignSeries,
  buildBuckets,
  granularityFor,
  previousRange,
  type Granularity,
  type ResolvedRange,
} from "@/lib/analytics/range";
import {
  averageValue,
  computeMoneyTrend,
  computeTrend,
  emptyTotal,
  rankByCents,
  segmentByCurrency,
  share,
} from "@/lib/analytics/compute";
import {
  SETTLED_PAYMENT_STATUSES,
  type CollectionPerformanceRow,
  type CurrencyTotal,
  type ProductPerformanceRow,
  type SalesKpis,
  type Series,
  type StatusCount,
} from "@/lib/analytics/types";

/**
 * Sales analytics.
 *
 * TWO TIME AXES, NEVER CONFLATED
 *
 * An order has two dates that matter and they answer different questions.
 * `createdAt` is when a customer placed it; `paidAt` is when the money actually
 * settled. Order *volume* is measured on `createdAt` — that is demand. Revenue
 * is measured on `paidAt` — that is income. Charting revenue by `createdAt`
 * attributes February's money to January's checkout, and every page that shows
 * these says out loud which axis it is on.
 *
 * REVENUE BASIS
 *
 * Revenue is `SUM(Order.total)` over orders whose `paymentStatus` is PAID or
 * PARTIALLY_REFUNDED, which is the same definition lib/admin/dashboard.ts and
 * /admin/customers already use. It is exact today because no code path in this
 * repository writes a refund. It becomes GROSS rather than NET the moment one
 * does, so `hasRecordedRefunds()` watches the Payment ledger and the UI says so
 * as soon as the first refund row appears.
 *
 * CURRENCY
 *
 * Nothing here ever sums across currencies. Aggregates group by
 * `Order.currency` and `segmentByCurrency` splits the result; rankings are
 * scoped to one currency, because ordering products by a cross-currency sum is
 * the same invalid arithmetic wearing a table.
 */

const SETTLED = [...SETTLED_PAYMENT_STATUSES];

/** Orders whose money has settled, restricted by when it settled. */
function settledWhere(range: ResolvedRange, currency?: string) {
  return {
    paymentStatus: { in: SETTLED },
    ...(range.start && range.end ? { paidAt: { gte: range.start, lt: range.end } } : {}),
    ...(currency ? { currency } : {}),
  } as const;
}

/** Orders by when they were placed, whatever became of them. */
function placedWhere(range: ResolvedRange) {
  return range.start && range.end
    ? { createdAt: { gte: range.start, lt: range.end } }
    : {};
}

async function revenueByCurrency(
  range: ResolvedRange,
): Promise<CurrencyTotal[]> {
  const groups = await db.order.groupBy({
    by: ["currency"],
    where: settledWhere(range),
    _sum: { total: true },
    _count: { _all: true },
  });

  return groups.map((group) => ({
    currency: group.currency,
    cents: toCents(group._sum.total ?? null) ?? 0,
    count: group._count._all,
  }));
}

export async function getSalesKpis(
  range: ResolvedRange,
  reportingCurrency: string,
): Promise<SalesKpis> {
  const comparison = previousRange(range);

  const [paymentGroups, fulfilmentGroups, currentRevenue, previousRevenue, previousPlaced] =
    await Promise.all([
      db.order.groupBy({
        by: ["paymentStatus"],
        where: placedWhere(range),
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ["fulfilmentStatus"],
        where: placedWhere(range),
        _count: { _all: true },
      }),
      revenueByCurrency(range),
      comparison ? revenueByCurrency(comparison) : Promise.resolve(null),
      comparison ? db.order.count({ where: placedWhere(comparison) }) : Promise.resolve(null),
    ]);

  const paymentCounts = new Map(
    paymentGroups.map((group) => [group.paymentStatus as string, group._count._all]),
  );
  const fulfilmentCounts = new Map(
    fulfilmentGroups.map((group) => [group.fulfilmentStatus as string, group._count._all]),
  );

  const ordersPlaced = paymentGroups.reduce((total, group) => total + group._count._all, 0);
  const revenue = segmentByCurrency(currentRevenue, reportingCurrency);
  const previousSegmented = previousRevenue
    ? segmentByCurrency(previousRevenue, reportingCurrency)
    : null;

  return {
    ordersPlaced,
    // Counted on the payment axis: an order placed last month and paid this one
    // is settled revenue this month but was never a "this month" order.
    ordersSettled: revenue.primary.count + revenue.excludedCount,
    ordersAwaitingPayment: paymentCounts.get("UNPAID") ?? 0,
    ordersPaymentPending: paymentCounts.get("PENDING") ?? 0,
    ordersFailed: paymentCounts.get("FAILED") ?? 0,
    ordersCancelled: fulfilmentCounts.get("CANCELLED") ?? 0,
    revenue,
    averageOrderValue: averageValue(revenue.primary),
    revenueTrend: computeMoneyTrend(revenue.primary, previousSegmented?.primary ?? null),
    ordersTrend: computeTrend(ordersPlaced, previousPlaced),
  };
}

export async function getOrderStatusDistribution(
  range: ResolvedRange,
): Promise<{ payment: StatusCount[]; fulfilment: StatusCount[] }> {
  const [paymentGroups, fulfilmentGroups] = await Promise.all([
    db.order.groupBy({
      by: ["paymentStatus"],
      where: placedWhere(range),
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ["fulfilmentStatus"],
      where: placedWhere(range),
      _count: { _all: true },
    }),
  ]);

  // Every status is listed, including the zeroes: "no cancelled orders" is a
  // fact worth showing, and a distribution that omits its empty categories
  // makes the remaining bars look like the whole picture.
  const payment: StatusCount[] = (
    Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[]
  ).map((status) => ({
    status,
    label: PAYMENT_LABEL[status],
    count: paymentGroups.find((group) => group.paymentStatus === status)?._count._all ?? 0,
  }));

  const fulfilment: StatusCount[] = (
    Object.keys(FULFILMENT_LABEL) as (keyof typeof FULFILMENT_LABEL)[]
  ).map((status) => ({
    status,
    label: FULFILMENT_LABEL[status],
    count:
      fulfilmentGroups.find((group) => group.fulfilmentStatus === status)?._count._all ?? 0,
  }));

  return { payment, fulfilment };
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

/**
 * Raw SQL, because Prisma's `groupBy` cannot express `date_trunc`.
 *
 * Three things are deliberate here:
 *
 *  - `AT TIME ZONE` uses the studio's configured zone, matching the boundaries
 *    lib/analytics/range.ts computed for the `WHERE` clause. Both sides must
 *    agree or a bucket at the edge of the range gains or loses a day's orders.
 *  - The unit and the `to_char` pattern are parameters, but they never come
 *    from the URL — they are derived from a two-value `Granularity` decided in
 *    code, so there is no path from user input to either.
 *  - Money is cast to `text` and parsed by `toCents`, and counts to `int`. That
 *    removes any dependence on how the driver happens to map NUMERIC and BIGINT,
 *    which is the kind of thing that silently changes in a minor release.
 *
 * The nullable-bound predicate (`$1 IS NULL OR ...`) is what lets "all time"
 * share one statement with a bounded range. It costs the planner the chance to
 * use `order_settled_paid_at` on the unbounded path, which is correct — an
 * all-time query reads every settled order anyway.
 */
type SeriesRow = { bucket: string; amount: string; count: number };

async function fetchRevenueSeries(
  range: ResolvedRange,
  granularity: Granularity,
  currency: string,
): Promise<SeriesRow[]> {
  const unit = BUCKET_TRUNC_UNIT[granularity];
  const format = BUCKET_KEY_FORMAT[granularity];

  return db.$queryRaw<SeriesRow[]>`
    SELECT
      to_char(date_trunc(${unit}::text, o."paidAt" AT TIME ZONE ${range.timeZone}::text), ${format}::text) AS bucket,
      COALESCE(SUM(o."total"), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM "Order" o
    WHERE o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
      AND o."paidAt" IS NOT NULL
      AND o."currency" = ${currency}
      AND (${range.start}::timestamptz IS NULL OR o."paidAt" >= ${range.start}::timestamptz)
      AND (${range.end}::timestamptz IS NULL OR o."paidAt" < ${range.end}::timestamptz)
    GROUP BY 1
    ORDER BY 1
  `;
}

async function fetchOrdersPlacedSeries(
  range: ResolvedRange,
  granularity: Granularity,
): Promise<SeriesRow[]> {
  const unit = BUCKET_TRUNC_UNIT[granularity];
  const format = BUCKET_KEY_FORMAT[granularity];

  return db.$queryRaw<SeriesRow[]>`
    SELECT
      to_char(date_trunc(${unit}::text, o."createdAt" AT TIME ZONE ${range.timeZone}::text), ${format}::text) AS bucket,
      '0'::text AS amount,
      COUNT(*)::int AS count
    FROM "Order" o
    WHERE (${range.start}::timestamptz IS NULL OR o."createdAt" >= ${range.start}::timestamptz)
      AND (${range.end}::timestamptz IS NULL OR o."createdAt" < ${range.end}::timestamptz)
    GROUP BY 1
    ORDER BY 1
  `;
}

function toSeries(
  range: ResolvedRange,
  granularity: Granularity,
  currency: string,
  rows: SeriesRow[],
): Series {
  const buckets = buildBuckets(range, granularity);

  // All-time has no start date to enumerate buckets from, so its points are
  // whatever the database returned. Flagged rather than silently different.
  if (buckets.length === 0) {
    return {
      granularity,
      currency,
      ungapped: true,
      points: rows.map((row) => ({
        key: row.bucket,
        label: row.bucket,
        cents: toCents(row.amount) ?? 0,
        count: row.count,
      })),
    };
  }

  return {
    granularity,
    currency,
    ungapped: false,
    points: alignSeries(buckets, rows, (bucket, row) => ({
      key: bucket.key,
      label: bucket.label,
      cents: row ? (toCents(row.amount) ?? 0) : 0,
      count: row?.count ?? 0,
    })),
  };
}

export async function getRevenueSeries(
  range: ResolvedRange,
  currency: string,
): Promise<Series> {
  const granularity = granularityFor(range.days);
  const rows = await fetchRevenueSeries(range, granularity, currency);
  return toSeries(range, granularity, currency, rows);
}

export async function getOrdersPlacedSeries(range: ResolvedRange): Promise<Series> {
  const granularity = granularityFor(range.days);
  const rows = await fetchOrdersPlacedSeries(range, granularity);
  return toSeries(range, granularity, "", rows);
}

// ---------------------------------------------------------------------------
// Revenue breakdowns
// ---------------------------------------------------------------------------

/**
 * Revenue by product, for one currency.
 *
 * Grouped on `OrderItem.productId`, which is nullable: `Product` deletion sets
 * it to null and leaves the name snapshot behind. Those lines are real revenue
 * and are reported as one explicit "removed from the catalogue" row rather than
 * dropped — a missing row would make the shares of everything else wrong.
 */
export async function getProductPerformance(
  range: ResolvedRange,
  currency: string,
  limit = 10,
): Promise<{ rows: ProductPerformanceRow[]; totalCents: number }> {
  const grouped = await db.orderItem.groupBy({
    by: ["productId"],
    where: { order: settledWhere(range, currency) },
    _sum: { quantity: true, lineTotal: true },
  });

  const totalCents = grouped.reduce(
    (total, group) => total + (toCents(group._sum.lineTotal ?? null) ?? 0),
    0,
  );

  const productIds = grouped
    .map((group) => group.productId)
    .filter((id): id is string => id !== null);

  const products =
    productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
  const byId = new Map(products.map((product) => [product.id, product]));

  const rows = grouped.map((group) => {
    const product = group.productId ? byId.get(group.productId) : undefined;
    return {
      productId: group.productId,
      name: product?.name ?? "Pieces no longer in the catalogue",
      slug: product?.slug ?? null,
      quantity: group._sum.quantity ?? 0,
      cents: toCents(group._sum.lineTotal ?? null) ?? 0,
    };
  });

  return { rows: rankByCents(rows, totalCents, limit), totalCents };
}

/**
 * Revenue by collection, for one currency.
 *
 * Raw SQL because the grouping key lives two joins away — `OrderItem` →
 * `Product` → `Collection` — which Prisma's `groupBy` cannot reach. Both joins
 * are LEFT: a sold piece may have been deleted, and a surviving piece may
 * belong to no range. Both cases become their own labelled row.
 */
type CollectionRow = {
  collection_id: string | null;
  collection_name: string | null;
  collection_slug: string | null;
  amount: string;
  quantity: number;
};

export async function getCollectionPerformance(
  range: ResolvedRange,
  currency: string,
  limit = 10,
): Promise<{ rows: CollectionPerformanceRow[]; totalCents: number }> {
  const raw = await db.$queryRaw<CollectionRow[]>`
    SELECT
      p."collectionId" AS collection_id,
      c."name"         AS collection_name,
      c."slug"         AS collection_slug,
      COALESCE(SUM(oi."lineTotal"), 0)::text AS amount,
      COALESCE(SUM(oi."quantity"), 0)::int   AS quantity
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "Product" p ON p."id" = oi."productId"
    LEFT JOIN "Collection" c ON c."id" = p."collectionId"
    WHERE o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
      AND o."currency" = ${currency}
      AND (${range.start}::timestamptz IS NULL OR o."paidAt" >= ${range.start}::timestamptz)
      AND (${range.end}::timestamptz IS NULL OR o."paidAt" < ${range.end}::timestamptz)
    GROUP BY 1, 2, 3
  `;

  const rows = raw.map((row) => ({
    collectionId: row.collection_id,
    name: row.collection_name ?? "Not in a range",
    slug: row.collection_slug,
    quantity: row.quantity,
    cents: toCents(row.amount) ?? 0,
  }));

  const totalCents = rows.reduce((total, row) => total + row.cents, 0);
  return { rows: rankByCents(rows, totalCents, limit), totalCents };
}

/**
 * Whether any refund has ever been recorded in the payment ledger.
 *
 * No code path in this repository writes one yet, which is precisely why this
 * check exists: revenue is `SUM(Order.total)`, and that figure is exact only
 * while no order has been refunded. The day a refund lands, the number becomes
 * gross rather than net, and the dashboard must say so rather than keep
 * presenting it as income.
 */
export async function hasRecordedRefunds(): Promise<boolean> {
  const refund = await db.payment.findFirst({
    where: { status: "REFUNDED" },
    select: { id: true },
  });
  return refund !== null;
}

/** Share of settled revenue a single figure represents. Re-exported for pages. */
export { share as revenueShare };

/** An empty currency total, for panels a role may read but has no data for. */
export { emptyTotal as emptyCurrencyTotal };
