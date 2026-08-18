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
 * The sentence a customer is shown when their order is settled by hand.
 *
 * Exported as a constant rather than written inline so the confirmation page and
 * the confirmation email cannot drift apart — the customer reading both must not
 * be told two different things about the same order.
 */
export const MANUAL_SETTLEMENT_MESSAGE =
  "Your order has been received. The studio will confirm availability, delivery, and payment with you.";

/**
 * How payment settles for a given order.
 *
 * Mirrors PaymentSettlementMode from lib/payments/types.ts, restated here as a
 * plain union so this module stays free of `server-only` imports and remains
 * unit testable. The two are asserted equal in tests/manual-settlement.test.ts.
 */
export type SettlementMode = "automatic" | "manual";

/**
 * Payment label, aware of how the order settles.
 *
 * "Unpaid" is accurate but reads as a reproach when the customer has not been
 * asked for money yet and cannot pay online even if they wanted to. Under manual
 * settlement the same state is "the studio has not confirmed receipt", which is
 * what is actually true.
 *
 * Only the LABEL changes. The stored status is untouched, so admin filters,
 * analytics and the fulfilment rules all continue to read `UNPAID`.
 */
export function paymentStatusLabel(
  status: OrderPaymentStatus,
  settlement: SettlementMode = "automatic",
): string {
  if (settlement === "manual" && (status === "UNPAID" || status === "PENDING")) {
    return "Awaiting studio confirmation";
  }
  return PAYMENT_LABEL[status];
}

/**
 * One customer-facing status derived from the two internal columns.
 *
 * The model stays split; only the presentation is combined.
 *
 * Under manual settlement the payment-derived phrasing is replaced entirely:
 * "Awaiting payment" invites the customer to go and pay something, and there is
 * nothing for them to pay. The fulfilment states are unaffected — once the
 * studio has confirmed receipt, an order in production reads as "In production"
 * regardless of how it settled.
 */
export function customerFacingStatus(
  order: {
    paymentStatus: OrderPaymentStatus;
    fulfilmentStatus: OrderFulfilmentStatus;
  },
  settlement: SettlementMode = "automatic",
): string {
  if (order.fulfilmentStatus === "CANCELLED") return "Cancelled";
  if (order.paymentStatus === "REFUNDED") return "Refunded";

  if (settlement === "manual") {
    if (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING") {
      return MANUAL_SETTLEMENT_MESSAGE;
    }
    // A FAILED status cannot arise from the manual provider, which never reports
    // an outcome — but an order may have been started against another provider
    // before falling back, so the state is still handled rather than assumed away.
    if (order.paymentStatus === "FAILED") return MANUAL_SETTLEMENT_MESSAGE;
    return FULFILMENT_LABEL[order.fulfilmentStatus];
  }

  if (order.paymentStatus === "FAILED") return "Payment failed";
  if (order.paymentStatus === "UNPAID") return "Awaiting payment";
  if (order.paymentStatus === "PENDING") return "Payment processing";
  return FULFILMENT_LABEL[order.fulfilmentStatus];
}
