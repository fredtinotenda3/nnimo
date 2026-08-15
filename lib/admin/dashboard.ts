import "server-only";
import { db } from "@/lib/db";
import { formatCents, toCents } from "@/lib/commerce/money";

/**
 * Dashboard figures.
 *
 * Every number here is an aggregate the database actually computed. There is no
 * sample data, no projection, no "last month" comparison invented from a single
 * data point, and no chart drawn from an empty table — with no orders yet, the
 * honest answer is zero, and zero is what this returns.
 *
 * Revenue counts PAID and PARTIALLY_REFUNDED orders only. Counting unpaid orders
 * as revenue is the most common way a dashboard lies: an abandoned checkout is
 * not money. Refunds are netted at the payment level rather than estimated.
 *
 * All of it is one round trip. Fifteen sequential counts would make the
 * dashboard the slowest page in the admin; a single Promise.all issues them
 * concurrently over the pooled connection.
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

/**
 * The reporting currency.
 *
 * Read from the `commerce.currency` setting rather than hard-coded, so the
 * totals are labelled with whatever the studio has configured. Orders each carry
 * their own currency, so a genuinely multi-currency shop would need per-currency
 * totals — flagged in the Phase 4 report rather than silently summed, because
 * adding two currencies together produces a number that means nothing.
 */
async function reportingCurrency(): Promise<string> {
  const setting = await db.setting.findUnique({
    where: { key: "commerce.currency" },
    select: { value: true },
  });
  const value = setting?.value?.trim().toUpperCase();
  return value && /^[A-Z]{3}$/.test(value) ? value : "USD";
}

export async function getCommerceKpis(): Promise<CommerceKpis> {
  const PAID_STATUSES = ["PAID", "PARTIALLY_REFUNDED"] as const;

  const [
    currency,
    ordersTotal,
    ordersPaid,
    ordersAwaitingPayment,
    ordersPaymentPending,
    paidAggregate,
    ordersAwaitingConfirmation,
    ordersInProduction,
    ordersReady,
    ordersRequiringProduction,
  ] = await Promise.all([
    reportingCurrency(),
    db.order.count(),
    db.order.count({ where: { paymentStatus: { in: [...PAID_STATUSES] } } }),
    db.order.count({ where: { paymentStatus: "UNPAID", fulfilmentStatus: { not: "CANCELLED" } } }),
    db.order.count({ where: { paymentStatus: "PENDING" } }),
    db.order.aggregate({
      where: { paymentStatus: { in: [...PAID_STATUSES] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.order.count({ where: { fulfilmentStatus: "PENDING" } }),
    db.order.count({ where: { fulfilmentStatus: "IN_PRODUCTION" } }),
    db.order.count({ where: { fulfilmentStatus: "READY" } }),
    // Orders carrying at least one made-to-order line that is not finished. This
    // is the studio's actual production queue, which is not the same as
    // "orders in production" — a confirmed order with unmade pieces belongs here
    // before anyone has moved its status.
    db.order.count({
      where: {
        fulfilmentStatus: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION"] },
        items: { some: { requiresProduction: true, productionStatus: { not: "READY" } } },
      },
    }),
  ]);

  const revenueCents = toCents(paidAggregate._sum.total ?? null) ?? 0;
  const paidCount = paidAggregate._count._all;
  const averageOrderValueCents = paidCount > 0 ? Math.round(revenueCents / paidCount) : 0;

  return {
    ordersTotal,
    ordersPaid,
    ordersAwaitingPayment,
    ordersPaymentPending,
    revenueCents,
    revenueFormatted: formatCents(revenueCents, currency),
    averageOrderValueCents,
    averageOrderValueFormatted: formatCents(averageOrderValueCents, currency),
    ordersAwaitingConfirmation,
    ordersInProduction,
    ordersReady,
    ordersRequiringProduction,
    currency,
  };
}

export async function getCatalogueKpis(): Promise<CatalogueKpis> {
  const [
    productsPublished,
    productsCatalogue,
    productsArchived,
    productsWithoutPrice,
    productsWithoutImages,
    productsPublishedWithoutPrice,
    collectionsPublished,
    collectionsDraft,
    collectionsPublishedEmpty,
  ] = await Promise.all([
    db.product.count({ where: { lifecycleStage: "PUBLISHED" } }),
    db.product.count({ where: { lifecycleStage: "CATALOGUE" } }),
    db.product.count({ where: { lifecycleStage: "ARCHIVED" } }),
    db.product.count({ where: { price: null } }),
    db.product.count({ where: { images: { none: {} } } }),
    // The one that matters operationally: live on the storefront, but nothing
    // can be bought because no price was ever confirmed.
    db.product.count({ where: { lifecycleStage: "PUBLISHED", price: null } }),
    db.collection.count({ where: { status: "PUBLISHED" } }),
    db.collection.count({ where: { status: "DRAFT" } }),
    db.collection.count({
      where: { status: "PUBLISHED", products: { none: { lifecycleStage: "PUBLISHED" } } },
    }),
  ]);

  return {
    productsPublished,
    productsCatalogue,
    productsArchived,
    productsWithoutPrice,
    productsWithoutImages,
    productsPublishedWithoutPrice,
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
 * Whether more than one currency is present across paid orders.
 *
 * Summing across currencies would produce a meaningless total, so the dashboard
 * says so rather than quietly adding dollars to rand. Cheap to check and it can
 * only become true once the business actually starts selling abroad.
 */
export async function hasMixedCurrencies(): Promise<boolean> {
  const groups = await db.order.groupBy({
    by: ["currency"],
    where: { paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    _count: { _all: true },
  });
  return groups.length > 1;
}
