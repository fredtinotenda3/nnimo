import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { reserveStockWithin, type InventoryTx } from "@/lib/inventory";
import { recordAudit } from "@/lib/audit";
import {
  centsToDecimalString,
  multiplyCents,
  sumCents,
  toCents,
  type Cents,
} from "@/lib/commerce/money";
import { evaluatePurchasability, PURCHASABILITY_MESSAGE } from "@/lib/commerce/purchasability";
import { canTransitionFulfilment } from "@/lib/commerce/fulfilment";
import type { OrderFulfilmentStatus } from "@/lib/generated/prisma/enums";

export const COMMERCE_CURRENCY = "USD";

// ---------------------------------------------------------------------------
// Checkout input
// ---------------------------------------------------------------------------

export const deliveryAddressSchema = z.object({
  line1: z.string().trim().min(3, "Enter a street address").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter a city").max(120),
  country: z.string().trim().min(2, "Enter a country").max(120),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(160),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
    phone: z.string().trim().min(6, "Enter a contact number").max(40),
    fulfilmentMethod: z.enum(["DELIVERY", "COLLECTION"]),
    line1: z.string().trim().max(200).optional().or(z.literal("")),
    line2: z.string().trim().max(200).optional().or(z.literal("")),
    city: z.string().trim().max(120).optional().or(z.literal("")),
    country: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    marketingConsent: z.union([z.literal("on"), z.literal("")]).optional(),
    website: z.string().max(0).optional().or(z.literal("")), // honeypot
  })
  // An address is required for delivery and meaningless for collection.
  .refine((data) => data.fulfilmentMethod !== "DELIVERY" || Boolean(data.line1?.trim()), {
    message: "Enter a street address for delivery",
    path: ["line1"],
  })
  .refine((data) => data.fulfilmentMethod !== "DELIVERY" || Boolean(data.city?.trim()), {
    message: "Enter a city for delivery",
    path: ["city"],
  })
  .refine((data) => data.fulfilmentMethod !== "DELIVERY" || Boolean(data.country?.trim()), {
    message: "Enter a country for delivery",
    path: ["country"],
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Order number
// ---------------------------------------------------------------------------

/**
 * Order numbers come from a Postgres sequence.
 *
 * A counter row would need a row lock per checkout and would serialise order
 * creation; `nextval` is atomic and contention-free. Gaps are acceptable — a
 * failed checkout burning a number is fine — reuse is not.
 */
export async function nextOrderNumber(
  client: { $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
): Promise<string> {
  const rows = await client.$queryRaw<{ value: bigint }[]>`
    SELECT nextval('nnino_order_number_seq') AS value
  `;
  const value = rows[0]?.value ?? 0n;
  const year = new Date().getUTCFullYear();
  return `NN-${year}-${String(value).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

export class CheckoutValidationError extends Error {
  constructor(
    message: string,
    readonly kind: "EMPTY_CART" | "LINE_BLOCKED" | "PRICE_CHANGED" | "TOTAL_MISMATCH",
  ) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

export type CreatedOrder = {
  id: string;
  orderNumber: string;
  accessToken: string;
  totalCents: Cents;
};

/**
 * Creates an order from a cart, atomically.
 *
 * Everything that matters is re-derived inside the transaction from the products
 * themselves: name, SKU, unit price, line total, subtotal, total. The browser
 * contributes only contact details, a fulfilment method and an address. There is
 * no code path by which a client-submitted price or total can reach the database.
 *
 * Duplicate prevention is the `Order.cartId` unique index rather than a
 * "have we already made one?" query — two simultaneous submits of the same cart
 * both attempt the insert and Postgres rejects the second. An application check
 * would let both pass before either wrote.
 *
 * `expectedSubtotalCents` is what the customer was shown on the review step. If
 * the true subtotal has moved since, the order is refused rather than silently
 * charging a different amount.
 */
export async function createOrderFromCart(params: {
  cartId: string;
  input: CheckoutInput;
  expectedSubtotalCents: Cents;
}): Promise<CreatedOrder> {
  const { cartId, input, expectedSubtotalCents } = params;

  return db.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { id: cartId },
      select: {
        id: true,
        currency: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                currency: true,
                lifecycleStage: true,
                availability: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new CheckoutValidationError("Your cart is empty.", "EMPTY_CART");
    }

    const lines: {
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string | null;
      quantity: number;
      unitPriceCents: Cents;
      lineTotalCents: Cents;
      requiresProduction: boolean;
      reservesStock: boolean;
    }[] = [];

    for (const item of cart.items) {
      const product = item.product;
      if (!product) {
        throw new CheckoutValidationError(
          "A piece in your cart is no longer available.",
          "LINE_BLOCKED",
        );
      }

      const verdict = evaluatePurchasability({
        lifecycleStage: product.lifecycleStage,
        availability: product.availability,
        price: product.price,
      });

      if (!verdict.purchasable || verdict.priceCents === null) {
        throw new CheckoutValidationError(
          `${product.name}: ${PURCHASABILITY_MESSAGE[verdict.reason]}`,
          "LINE_BLOCKED",
        );
      }
      if (product.currency !== cart.currency) {
        throw new CheckoutValidationError(
          `${product.name} is priced in a different currency and cannot be ordered yet.`,
          "LINE_BLOCKED",
        );
      }

      lines.push({
        productId: product.id,
        // Snapshots, so this order still reads correctly in five years even if
        // the product is renamed, repriced or deleted.
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        quantity: item.quantity,
        unitPriceCents: verdict.priceCents,
        lineTotalCents: multiplyCents(verdict.priceCents, item.quantity),
        requiresProduction: product.availability === "MADE_TO_ORDER",
        // Stock-backed lines must reserve physical stock; made-to-order lines
        // have no stock to reserve and must not invent any.
        reservesStock:
          product.availability === "IN_STOCK" || product.availability === "LOW_STOCK",
      });
    }

    const subtotalCents = sumCents(lines.map((line) => line.lineTotalCents));

    if (subtotalCents !== expectedSubtotalCents) {
      throw new CheckoutValidationError(
        "Prices changed while you were checking out. Please review your cart and try again.",
        "PRICE_CHANGED",
      );
    }

    // Delivery is genuinely unknown, so it is zero here AND flagged as pending a
    // quote. The total therefore excludes delivery, which every surface says.
    const isDelivery = input.fulfilmentMethod === "DELIVERY";
    const shippingCents: Cents = 0;
    const totalCents = subtotalCents + shippingCents;

    const orderNumber = await nextOrderNumber(tx as never);
    const accessToken = randomUUID();

    // One Customer per email, upserted. Marketing consent is only ever raised by
    // an explicit tick, never assumed from the act of ordering.
    const customer = await tx.customer.upsert({
      where: { email: input.email },
      create: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        marketingConsent: input.marketingConsent === "on",
      },
      update: {
        name: input.name,
        phone: input.phone,
        ...(input.marketingConsent === "on" ? { marketingConsent: true } : {}),
      },
      select: { id: true },
    });

    const deliveryAddress = isDelivery
      ? {
          version: 1,
          line1: input.line1?.trim() ?? "",
          line2: input.line2?.trim() || null,
          city: input.city?.trim() ?? "",
          country: input.country?.trim() ?? "",
        }
      : null;

    const order = await tx.order.create({
      data: {
        orderNumber,
        accessToken,
        cartId: cart.id,
        customerId: customer.id,
        guestName: input.name,
        guestEmail: input.email,
        guestPhone: input.phone,
        subtotal: centsToDecimalString(subtotalCents),
        shippingTotal: centsToDecimalString(shippingCents),
        total: centsToDecimalString(totalCents),
        currency: cart.currency,
        paymentStatus: "UNPAID",
        fulfilmentStatus: "PENDING",
        fulfilmentMethod: input.fulfilmentMethod,
        deliveryQuoteStatus: isDelivery ? "PENDING_QUOTE" : "NOT_REQUIRED",
        deliveryAddress: deliveryAddress ?? undefined,
        customerNotes: input.notes?.trim() || null,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            skuSnapshot: line.skuSnapshot,
            quantity: line.quantity,
            unitPrice: centsToDecimalString(line.unitPriceCents),
            lineTotal: centsToDecimalString(line.lineTotalCents),
            requiresProduction: line.requiresProduction,
            productionStatus: line.requiresProduction ? "PENDING" : null,
          })),
        },
      },
      select: { id: true, orderNumber: true, accessToken: true },
    });

    // Reserve physical stock for stock-backed lines, inside THIS transaction.
    //
    // reserveStockWithin (not reserveStock) is deliberate: the self-contained
    // version opens its own transaction on another connection, which would let a
    // reservation commit while the order rolled back. Composing it here means the
    // order and its reservations are one atomic unit — if the last piece was sold
    // a millisecond earlier, the conditional UPDATE matches no rows,
    // InsufficientStockError propagates, and the whole order is rolled back.
    //
    // Made-to-order lines are skipped: there is no stock behind them. That is
    // currently every sellable Nnino piece, so in practice this loop does nothing
    // until real stock counts exist — but it must be correct before they do.
    for (const line of lines) {
      if (!line.reservesStock) continue;
      await reserveStockWithin(tx as unknown as InventoryTx, {
        productId: line.productId,
        quantity: line.quantity,
        orderId: order.id,
        reason: `Reserved for order ${order.orderNumber}`,
      });
    }

    // The cart is consumed. Its id survives on the order as the duplicate guard.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      totalCents,
    };
  });
}

// ---------------------------------------------------------------------------
// Fulfilment transitions
// ---------------------------------------------------------------------------

export class FulfilmentTransitionError extends Error {}

/**
 * Moves an order's fulfilment status, refusing impossible transitions and
 * stamping the matching timestamp. Always audited.
 */
export async function transitionFulfilment(params: {
  orderId: string;
  to: OrderFulfilmentStatus;
  userId: string;
  trackingRef?: string | null;
}): Promise<void> {
  const { orderId, to, userId, trackingRef } = params;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      fulfilmentStatus: true,
      paymentStatus: true,
      fulfilmentMethod: true,
    },
  });
  if (!order) throw new FulfilmentTransitionError("Order not found.");

  const from = order.fulfilmentStatus;
  if (from === to) return;

  if (!canTransitionFulfilment(from, to)) {
    throw new FulfilmentTransitionError(
      `An order cannot move from ${from} to ${to}.`,
    );
  }
  if (to === "SHIPPED" && order.fulfilmentMethod !== "DELIVERY") {
    throw new FulfilmentTransitionError("Only delivery orders can be dispatched.");
  }
  if (to === "COLLECTED" && order.fulfilmentMethod !== "COLLECTION") {
    throw new FulfilmentTransitionError("Only collection orders can be marked collected.");
  }

  const now = new Date();
  await db.order.update({
    where: { id: orderId },
    data: {
      fulfilmentStatus: to,
      ...(to === "CONFIRMED" ? { confirmedAt: now } : {}),
      ...(to === "READY" ? { readyAt: now } : {}),
      ...(to === "SHIPPED" ? { shippedAt: now, trackingRef: trackingRef ?? undefined } : {}),
      ...(to === "DELIVERED" || to === "COLLECTED" ? { deliveredAt: now } : {}),
      ...(to === "CANCELLED" ? { cancelledAt: now } : {}),
    },
  });

  await recordAudit({
    userId,
    action: to === "CANCELLED" ? "order.cancel" : "order.status_change",
    entityType: "Order",
    entityId: orderId,
    metadata: {
      orderNumber: order.orderNumber,
      from,
      to,
      // Recorded because starting production before payment clears is a real
      // business choice, and the trail should show it was made knowingly.
      paymentStatusAtTransition: order.paymentStatus,
    },
  });
}

/** Re-derives the total from persisted order items. Used by tests and admin. */
export function orderTotalFromItems(
  items: { unitPrice: { toString(): string }; quantity: number }[],
  shipping: { toString(): string } | null = null,
): Cents {
  const lineTotals = items.map((item) => {
    const unit = toCents(item.unitPrice);
    if (unit === null) throw new Error("Order item is missing a unit price.");
    return multiplyCents(unit, item.quantity);
  });
  return sumCents([...lineTotals, toCents(shipping) ?? 0]);
}
