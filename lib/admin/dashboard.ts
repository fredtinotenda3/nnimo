import "server-only";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/commerce/money";
import { getAnalyticsContext } from "@/lib/analytics/context";
import { getCatalogueComposition } from "@/lib/analytics/catalogue";
import { getSalesKpis } from "@/lib/analytics/sales";
import { resolveRange } from "@/lib/analytics/range";

/**
 * Dashboard figures.
 *
 * PHASE 7 — THIS FILE NOW DELEGATES.
 *
 * Every number here is still a real aggregate the database computed, but the
 * aggregation itself moved to lib/analytics/. The reason is not tidiness: this
 * module and the new analytics section would otherwise each hold their own
 * definition of "revenue", and two definitions is how a dashboard headline and
 * a sales page end up disagreeing by one order while both look authoritative.
 *
 * The exported names and shapes are unchanged, so app/admin/page.tsx and
 * anything else importing them keeps working; what changed is that they are now
 * thin adapters over the shared services.
 *
 * The dashboard remains ALL-TIME on purpose. It answers "where does the
 * business stand", which is a cumulative question; /admin/analytics answers
 * "how did we do in a period", which is the one that needs a date picker.
 *
 * Revenue counts PAID and PARTIALLY_REFUNDED orders only. Counting unpaid
 * orders as revenue is the most common way a dashboard lies: an abandoned
 * checkout is not money.
 */

export type CommerceKpis = {
  ordersTotal: number;
  ordersPaid: number;
  ordersAwaitingPayment: number;
  ordersPaymentPending: number;
  revenueCents: number;
  revenueFormatted: string;
  averageOrderValueCents: number;
  averageOrderValueFormatted: string;
  ordersAwaitingConfirmation: number;
  ordersInProduction: number;
  ordersReady: number;
  ordersRequiringProduction: number;
  currency: string;
  /**
   * Paid orders NOT counted in `revenueCents` because they are denominated in a
   * different currency. Surfaced so an excluded order is visible rather than
   * quietly missing from the total.
   */
  otherCurrencyOrders: number;
};

export type CatalogueKpis = {
  productsPublished: number;
  productsCatalogue: number;
  productsArchived: number;
  productsWithoutPrice: number;
  productsWithoutImages: number;
  productsPublishedWithoutPrice: number;
  collectionsPublished: number;
  collectionsDraft: number;
  collectionsPublishedEmpty: number;
};

export type OperationsFeed = {
  recentOrders: {
    id: string;
    orderNumber: string;
    createdAt: Date;
    total: { toString(): string } | null;
    currency: string;
    paymentStatus: string;
    fulfilmentStatus: string;
    customerName: string;
  }[];
  newInquiries: number;
  openInquiries: number;
  newWholesaleInquiries: number;
  recentCustomers: { id: string; name: string; email: string; createdAt: Date; orderCount: number }[];
};

export async function getCommerceKpis(): Promise<CommerceKpis> {
  const context = await getAnalyticsContext();
  // An unbounded range: the dashboard is a standing position, not a report on a
  // period. `resolveRange` produces null start/end for this, which the query
  // layer reads as "no date predicate at all".
  const allTime = resolveRange({ preset: "all_time", timeZone: context.timeZone });

  const [
    sales,
    ordersTotal,
    ordersAwaitingConfirmation,
    ordersInProduction,
    ordersReady,
    ordersRequiringProduction,
  ] = await Promise.all([
    getSalesKpis(allTime, context.reportingCurrency),
    db.order.count(),
    db.order.count({ where: { fulfilmentStatus: "PENDING" } }),
    db.order.count({ where: { fulfilmentStatus: "IN_PRODUCTION" } }),
    db.order.count({ where: { fulfilmentStatus: "READY" } }),
    // Orders carrying at least one made-to-order line that is not finished.
    // This is the studio's actual production queue, which is not the same as
    // "orders in production" — a confirmed order with unmade pieces belongs
    // here before anyone has moved its status.
    db.order.count({
      where: {
        fulfilmentStatus: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION"] },
        items: { some: { requiresProduction: true, productionStatus: { not: "READY" } } },
      },
    }),
  ]);

  const currency = context.reportingCurrency;
  const revenueCents = sales.revenue.primary.cents;
  const averageOrderValueCents = sales.averageOrderValue.cents;

  return {
    ordersTotal,
    ordersPaid: sales.ordersSettled,
    ordersAwaitingPayment: sales.ordersAwaitingPayment,
    ordersPaymentPending: sales.ordersPaymentPending,
    revenueCents,
    revenueFormatted: formatCents(revenueCents, currency),
    averageOrderValueCents,
    averageOrderValueFormatted: formatCents(averageOrderValueCents, currency),
    ordersAwaitingConfirmation,
    ordersInProduction,
    ordersReady,
    ordersRequiringProduction,
    currency,
    otherCurrencyOrders: sales.revenue.excludedCount,
  };
}

export async function getCatalogueKpis(): Promise<CatalogueKpis> {
  const [composition, collectionsPublished, collectionsDraft, collectionsPublishedEmpty] =
    await Promise.all([
      getCatalogueComposition(),
      db.collection.count({ where: { status: "PUBLISHED" } }),
      db.collection.count({ where: { status: "DRAFT" } }),
      db.collection.count({
        where: { status: "PUBLISHED", products: { none: { lifecycleStage: "PUBLISHED" } } },
      }),
    ]);

  return {
    productsPublished: composition.published,
    productsCatalogue: composition.catalogueOnly,
    productsArchived: composition.archived,
    productsWithoutPrice: composition.priceOnRequest,
    productsWithoutImages: composition.withoutImages,
    productsPublishedWithoutPrice: composition.publishedWithoutPrice,
    collectionsPublished,
    collectionsDraft,
    collectionsPublishedEmpty,
  };
}

export async function getOperationsFeed(): Promise<OperationsFeed> {
  const [recentOrders, newInquiries, openInquiries, newWholesaleInquiries, recentCustomers] =
    await Promise.all([
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          total: true,
          currency: true,
          paymentStatus: true,
          fulfilmentStatus: true,
          guestName: true,
          customer: { select: { name: true } },
        },
      }),
      db.customOrderInquiry.count({ where: { status: "NEW" } }),
      db.customOrderInquiry.count({ where: { status: { notIn: ["CLOSED", "DELIVERED"] } } }),
      db.wholesaleInquiry.count({ where: { status: "NEW" } }),
      db.customer.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
    ]);

  return {
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      total: order.total,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      customerName: order.customer?.name ?? order.guestName ?? "Guest",
    })),
    newInquiries,
    openInquiries,
    newWholesaleInquiries,
    recentCustomers: recentCustomers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      createdAt: customer.createdAt,
      orderCount: customer._count.orders,
    })),
  };
}

/**
 * Whether more than one currency is present across settled orders.
 *
 * Now answered from the shared analytics context, which already establishes the
 * set of currencies in use, rather than by a second groupBy that could drift
 * from it.
 */
export async function hasMixedCurrencies(): Promise<boolean> {
  const context = await getAnalyticsContext();
  return context.availableCurrencies.length > 1;
}
