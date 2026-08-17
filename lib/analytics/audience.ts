import "server-only";
import { db } from "@/lib/db";
import { toCents } from "@/lib/commerce/money";
import {
  BUCKET_KEY_FORMAT,
  BUCKET_TRUNC_UNIT,
  alignSeries,
  buildBuckets,
  granularityFor,
  type Granularity,
  type ResolvedRange,
} from "@/lib/analytics/range";
import { averageValue, ratePerUnit } from "@/lib/analytics/compute";
import {
  SETTLED_PAYMENT_STATUSES,
  type CustomerKpis,
  type CustomerRow,
  type EnquiryKpis,
  type Series,
  type StatusCount,
} from "@/lib/analytics/types";
import { CustomOrderStatus } from "@/lib/generated/prisma/enums";

/**
 * Customer and enquiry analytics.
 *
 * WHAT "CUSTOMER" MEANS HERE
 *
 * Checkout upserts one `Customer` per email address before it writes the order
 * (lib/commerce/orders.ts), so there is no separate population of anonymous
 * guests to reconcile — `Order.customerId` is set on every order the storefront
 * creates. The one gap is deletion: `customerId` is `SetNull`, so an order can
 * outlive its customer. Those orders are counted in `ordersWithoutCustomer`
 * rather than dropped, so per-customer figures are visibly incomplete rather
 * than quietly so.
 *
 * WHAT IS NOT COMPUTED
 *
 * No demographic is inferred. The schema records a name, an email, a phone
 * number and a marketing-consent flag; anything beyond that — location, age,
 * segment, lifetime-value projection — would be invented, so none of it appears.
 *
 * Enquiry-to-order conversion is likewise absent. `CustomOrderInquiry` has no
 * foreign key to `Order` and shares no key with it; matching on email address
 * would be a guess presented as a rate. What IS reported is the enquiry
 * pipeline's own progression, which the status column genuinely supports.
 */

const SETTLED = [...SETTLED_PAYMENT_STATUSES];

function settledWhere(range: ResolvedRange, currency?: string) {
  return {
    paymentStatus: { in: SETTLED },
    ...(range.start && range.end ? { paidAt: { gte: range.start, lt: range.end } } : {}),
    ...(currency ? { currency } : {}),
  } as const;
}

function createdWhere(range: ResolvedRange) {
  return range.start && range.end
    ? { createdAt: { gte: range.start, lt: range.end } }
    : {};
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Returning customers.
 *
 * Raw SQL because the question is "how many customers have two or more settled
 * orders", which is a HAVING over a grouped set — Prisma's `count` cannot
 * express it, and pulling every customer's order count into memory to filter it
 * in JavaScript would be the version that stops working at scale.
 *
 * Counted on settled orders only. Two abandoned checkouts is not a returning
 * customer.
 */
type RepeatRow = { customers: number; repeat_customers: number };

async function fetchRepeatCounts(range: ResolvedRange): Promise<RepeatRow> {
  const rows = await db.$queryRaw<RepeatRow[]>`
    WITH per_customer AS (
      SELECT o."customerId" AS customer_id, COUNT(*)::int AS orders
      FROM "Order" o
      WHERE o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
        AND o."customerId" IS NOT NULL
        AND (${range.start}::timestamptz IS NULL OR o."paidAt" >= ${range.start}::timestamptz)
        AND (${range.end}::timestamptz IS NULL OR o."paidAt" < ${range.end}::timestamptz)
      GROUP BY 1
    )
    SELECT
      COUNT(*)::int                                AS customers,
      COUNT(*) FILTER (WHERE orders >= 2)::int     AS repeat_customers
    FROM per_customer
  `;
  return rows[0] ?? { customers: 0, repeat_customers: 0 };
}

export async function getCustomerKpis(
  range: ResolvedRange,
  currency: string,
): Promise<CustomerKpis> {
  const [totalCustomers, newCustomers, repeats, revenueAggregate, ordersWithoutCustomer] =
    await Promise.all([
      db.customer.count(),
      db.customer.count({ where: createdWhere(range) }),
      fetchRepeatCounts(range),
      db.order.aggregate({
        where: { ...settledWhere(range, currency), customerId: { not: null } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.order.count({ where: { ...settledWhere(range), customerId: null } }),
    ]);

  const settledCents = toCents(revenueAggregate._sum.total ?? null) ?? 0;

  return {
    totalCustomers,
    newCustomers,
    customersWithSettledOrders: repeats.customers,
    returningCustomers: repeats.repeat_customers,
    ordersPerCustomer: ratePerUnit(revenueAggregate._count._all, repeats.customers),
    averageCustomerValue: averageValue({
      currency,
      cents: settledCents,
      count: repeats.customers,
    }),
    ordersWithoutCustomer,
  };
}

/**
 * Highest-spending customers, in one currency.
 *
 * Aggregated in Postgres and then hydrated with names in a single bounded
 * `findMany` — one query for the ranking and one for the labels, never one
 * lookup per row.
 */
export async function getTopCustomers(
  range: ResolvedRange,
  currency: string,
  limit = 10,
): Promise<CustomerRow[]> {
  const grouped = await db.order.groupBy({
    by: ["customerId"],
    where: { ...settledWhere(range, currency), customerId: { not: null } },
    _sum: { total: true },
    _count: { _all: true },
  });

  const ranked = grouped
    .map((group) => ({
      customerId: group.customerId,
      orders: group._count._all,
      cents: toCents(group._sum.total ?? null) ?? 0,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, limit);

  const ids = ranked
    .map((row) => row.customerId)
    .filter((id): id is string => id !== null);

  const customers =
    ids.length > 0
      ? await db.customer.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  return ranked.map((row) => {
    const customer = row.customerId ? byId.get(row.customerId) : undefined;
    return {
      customerId: row.customerId,
      name: customer?.name ?? "Customer record removed",
      email: customer?.email ?? null,
      orders: row.orders,
      cents: row.cents,
    };
  });
}

// ---------------------------------------------------------------------------
// Series shared by customers and enquiries
// ---------------------------------------------------------------------------

type CountRow = { bucket: string; count: number };

function toCountSeries(
  range: ResolvedRange,
  granularity: Granularity,
  rows: CountRow[],
): Series {
  const buckets = buildBuckets(range, granularity);

  if (buckets.length === 0) {
    return {
      granularity,
      currency: "",
      ungapped: true,
      points: rows.map((row) => ({
        key: row.bucket,
        label: row.bucket,
        cents: 0,
        count: row.count,
      })),
    };
  }

  return {
    granularity,
    currency: "",
    ungapped: false,
    points: alignSeries(buckets, rows, (bucket, row) => ({
      key: bucket.key,
      label: bucket.label,
      cents: 0,
      count: row?.count ?? 0,
    })),
  };
}

export async function getNewCustomerSeries(range: ResolvedRange): Promise<Series> {
  const granularity = granularityFor(range.days);
  const unit = BUCKET_TRUNC_UNIT[granularity];
  const format = BUCKET_KEY_FORMAT[granularity];

  const rows = await db.$queryRaw<CountRow[]>`
    SELECT
      to_char(date_trunc(${unit}::text, c."createdAt" AT TIME ZONE ${range.timeZone}::text), ${format}::text) AS bucket,
      COUNT(*)::int AS count
    FROM "Customer" c
    WHERE (${range.start}::timestamptz IS NULL OR c."createdAt" >= ${range.start}::timestamptz)
      AND (${range.end}::timestamptz IS NULL OR c."createdAt" < ${range.end}::timestamptz)
    GROUP BY 1
    ORDER BY 1
  `;

  return toCountSeries(range, granularity, rows);
}

export async function getEnquirySeries(range: ResolvedRange): Promise<Series> {
  const granularity = granularityFor(range.days);
  const unit = BUCKET_TRUNC_UNIT[granularity];
  const format = BUCKET_KEY_FORMAT[granularity];

  const rows = await db.$queryRaw<CountRow[]>`
    SELECT
      to_char(date_trunc(${unit}::text, i."createdAt" AT TIME ZONE ${range.timeZone}::text), ${format}::text) AS bucket,
      COUNT(*)::int AS count
    FROM "CustomOrderInquiry" i
    WHERE (${range.start}::timestamptz IS NULL OR i."createdAt" >= ${range.start}::timestamptz)
      AND (${range.end}::timestamptz IS NULL OR i."createdAt" < ${range.end}::timestamptz)
    GROUP BY 1
    ORDER BY 1
  `;

  return toCountSeries(range, granularity, rows);
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export const CUSTOM_ORDER_STATUS_LABEL: Record<CustomOrderStatus, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  PAYMENT: "Awaiting payment",
  IN_PRODUCTION: "In production",
  COMPLETED: "Completed",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
};

/** Statuses that mean the enquiry got past a quote — the honest substitute for
 *  a conversion rate, which this schema cannot support. */
const PROGRESSED: CustomOrderStatus[] = [
  CustomOrderStatus.APPROVED,
  CustomOrderStatus.PAYMENT,
  CustomOrderStatus.IN_PRODUCTION,
  CustomOrderStatus.COMPLETED,
  CustomOrderStatus.DELIVERED,
];

export async function getEnquiryKpis(range: ResolvedRange): Promise<EnquiryKpis> {
  const [statusGroups, totalWholesale, newWholesale] = await Promise.all([
    db.customOrderInquiry.groupBy({
      by: ["status"],
      where: createdWhere(range),
      _count: { _all: true },
    }),
    db.wholesaleInquiry.count({ where: createdWhere(range) }),
    db.wholesaleInquiry.count({ where: { ...createdWhere(range), status: "NEW" } }),
  ]);

  const counts = new Map(
    statusGroups.map((group) => [group.status as CustomOrderStatus, group._count._all]),
  );
  const at = (status: CustomOrderStatus) => counts.get(status) ?? 0;

  const statusDistribution: StatusCount[] = (
    Object.keys(CUSTOM_ORDER_STATUS_LABEL) as CustomOrderStatus[]
  ).map((status) => ({
    status,
    label: CUSTOM_ORDER_STATUS_LABEL[status],
    count: at(status),
  }));

  return {
    totalCustomOrders: statusDistribution.reduce((total, row) => total + row.count, 0),
    newCustomOrders: at(CustomOrderStatus.NEW),
    openCustomOrders: statusDistribution
      .filter(
        (row) =>
          row.status !== CustomOrderStatus.CLOSED &&
          row.status !== CustomOrderStatus.DELIVERED,
      )
      .reduce((total, row) => total + row.count, 0),
    quotedCustomOrders: at(CustomOrderStatus.QUOTED),
    progressedCustomOrders: PROGRESSED.reduce((total, status) => total + at(status), 0),
    totalWholesale,
    newWholesale,
    statusDistribution,
  };
}

export async function getRecentEnquiries(take = 8) {
  return db.customOrderInquiry.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      customerName: true,
      requestType: true,
      status: true,
      createdAt: true,
    },
  });
}
