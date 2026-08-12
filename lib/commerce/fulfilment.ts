import type {
  OrderFulfilmentStatus,
  OrderPaymentStatus,
} from "@/lib/generated/prisma/enums";

/**
 * Fulfilment state machine.
 *
 * Stored values keep the Phase 1 names. `SHIPPED` is presented as "Dispatched"
 * in the UI — renaming an in-use enum value would be a destructive migration for
 * a wording preference, and the label belongs in the presentation layer anyway.
 */
export const FULFILMENT_TRANSITIONS: Record<
  OrderFulfilmentStatus,
  OrderFulfilmentStatus[]
> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "READY", "CANCELLED"],
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["SHIPPED", "COLLECTED", "CANCELLED"],
  // Terminal. A problem after dispatch is a return, which is a separate
  // inventory movement, not a reverse transition.
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  COLLECTED: [],
  CANCELLED: [],
};

export function canTransitionFulfilment(
  from: OrderFulfilmentStatus,
  to: OrderFulfilmentStatus,
): boolean {
  return FULFILMENT_TRANSITIONS[from].includes(to);
}

/**
 * Whether payment allows fulfilment to leave PENDING.
 *
 * Nnino may well decide to start producing before payment clears for a trusted
 * buyer, so this is not a hard block — it is what the admin UI warns on, and
 * what gets recorded in the audit metadata when overridden.
 */
export function requiresPaymentBefore(to: OrderFulfilmentStatus): boolean {
  return to !== "CANCELLED" && to !== "PENDING";
}

export function isPaid(status: OrderPaymentStatus): boolean {
  return status === "PAID" || status === "PARTIALLY_REFUNDED";
}

export const FULFILMENT_LABEL: Record<OrderFulfilmentStatus, string> = {
  PENDING: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  READY: "Ready",
  SHIPPED: "Dispatched",
  DELIVERED: "Delivered",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
};

export const PAYMENT_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Payment processing",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

/**
 * One customer-facing status derived from the two internal columns.
 *
 * The model stays split; only the presentation is combined.
 */
export function customerFacingStatus(order: {
  paymentStatus: OrderPaymentStatus;
  fulfilmentStatus: OrderFulfilmentStatus;
}): string {
  if (order.fulfilmentStatus === "CANCELLED") return "Cancelled";
  if (order.paymentStatus === "REFUNDED") return "Refunded";
  if (order.paymentStatus === "FAILED") return "Payment failed";
  if (order.paymentStatus === "UNPAID") return "Awaiting payment";
  if (order.paymentStatus === "PENDING") return "Payment processing";
  return FULFILMENT_LABEL[order.fulfilmentStatus];
}
