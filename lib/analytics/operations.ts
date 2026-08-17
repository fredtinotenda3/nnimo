import "server-only";
import { db } from "@/lib/db";
import { toCents } from "@/lib/commerce/money";
import { productGaps } from "@/lib/admin/completeness";
import type { OperationsWorklist, OrderLine } from "@/lib/analytics/types";

/**
 * Operational worklists — "what needs someone to do something".
 *
 * These are deliberately NOT date-filtered. An order that has been unpaid since
 * March is more urgent than one from yesterday, and hiding it because the
 * operator happens to be looking at "last 7 days" would turn a worklist into a
 * way to lose work. Analytics answers "how are we doing"; this answers "what is
 * waiting", and the second question has no reporting period.
 *
 * Every list is bounded by `take`. Each links to the existing filtered admin
 * views rather than reimplementing them, so the operator lands on a page that
 * can already act on the row.
 *
 * "Products requiring catalogue attention" reuses `productGaps` from
 * lib/admin/completeness.ts rather than restating the rules. If the definition
 * of an incomplete piece changes, it changes in one place and the product list,
 * the edit form and this panel stay in agreement.
 */

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  total: true,
  currency: true,
  paymentStatus: true,
  fulfilmentStatus: true,
  guestName: true,
  customer: { select: { name: true } },
} as const;

type RawOrder = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  total: { toString(): string } | null;
  currency: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  guestName: string | null;
  customer: { name: string } | null;
};

function toOrderLine(order: RawOrder): OrderLine {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer?.name ?? order.guestName ?? "Guest",
    createdAt: order.createdAt,
    cents: toCents(order.total) ?? 0,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
  };
}

export async function getOperationsWorklist(take = 8): Promise<OperationsWorklist> {
  const [unpaid, awaiting, completed, attention] = await Promise.all([
    // Oldest first: the point of this list is the order that has been waiting
    // longest, which a newest-first sort would bury.
    db.order.findMany({
      where: {
        paymentStatus: { in: ["UNPAID", "PENDING"] },
        fulfilmentStatus: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "asc" },
      take,
      select: ORDER_SELECT,
    }),
    db.order.findMany({
      where: {
        paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        fulfilmentStatus: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY"] },
      },
      orderBy: { createdAt: "asc" },
      take,
      select: ORDER_SELECT,
    }),
    db.order.findMany({
      where: { fulfilmentStatus: { in: ["DELIVERED", "COLLECTED"] } },
      orderBy: { updatedAt: "desc" },
      take,
      select: ORDER_SELECT,
    }),
    // Published pieces only. A CATALOGUE-stage piece with no price is the
    // expected state for most of the imported catalogue and is not a defect;
    // a PUBLISHED piece with no price is live on the storefront and unsellable.
    db.product.findMany({
      where: {
        lifecycleStage: "PUBLISHED",
        OR: [{ price: null }, { availability: null }, { images: { none: {} } }],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        lifecycleStage: true,
        availability: true,
        price: true,
        description: true,
        collectionId: true,
        images: { select: { isPrimary: true } },
      },
    }),
  ]);

  return {
    unpaidOrders: unpaid.map(toOrderLine),
    awaitingFulfilment: awaiting.map(toOrderLine),
    recentlyCompleted: completed.map(toOrderLine),
    productsNeedingAttention: attention.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      issues: productGaps({
        lifecycleStage: product.lifecycleStage,
        availability: product.availability,
        price: product.price,
        description: product.description,
        collectionId: product.collectionId,
        imageCount: product.images.length,
        hasPrimaryImage: product.images.some((image) => image.isPrimary),
      })
        .filter((gap) => gap.severity === "blocking")
        .map((gap) => gap.label),
    })),
  };
}
