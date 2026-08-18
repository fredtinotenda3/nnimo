import { randomUUID } from "node:crypto";
import {
  WebhookSignatureError,
  type PaymentIntent,
  type PaymentIntentRequest,
  type PaymentProvider,
  type PaymentVerification,
  type WebhookParseResult,
} from "@/lib/payments/types";

export const MANUAL_PROVIDER_ID = "manual";

/**
 * Manual settlement — the honest production position until Paynow is live.
 *
 * WHAT IT IS FOR
 *
 * Nnino has no payment credentials yet, but the studio still wants orders. The
 * only other options were both bad: disable checkout (no orders at all), or run
 * the sandbox provider in production (an order marked PAID when no money moved).
 * This provider takes the third path — the order is real, the payment is
 * explicitly outstanding, and a person at the studio records receipt when the
 * money actually arrives.
 *
 * THE DESIGN POINT
 *
 * `verifyPayment` cannot return PAID. Not "does not currently", not "returns
 * PENDING unless configured" — there is no code path through this file that
 * produces a PAID verification. That makes the safety property structural rather
 * than conditional: no environment variable, no forged callback and no mistaken
 * call site can turn this provider into a settlement. Money is recognised in
 * exactly one place, `settlePaymentManually()` in
 * lib/commerce/payment-service.ts, which requires an authenticated operator with
 * the `order:settle` permission and writes an audit entry naming them.
 *
 * `parseWebhook` throws for the same reason. There is no upstream system that
 * could legitimately call it, so anything arriving at
 * /api/payments/manual/callback is either a mistake or an attempt, and both
 * deserve the same rejection.
 *
 * WHEN PAYNOW ARRIVES
 *
 * This provider does not go away. It stays as the record of every payment taken
 * by bank transfer, cash on collection, or any other channel that never passes
 * through a gateway — which for a studio selling handmade work is not an edge
 * case.
 */
export const manualProvider: PaymentProvider = {
  id: MANUAL_PROVIDER_ID,
  displayName: "Payment arranged with the studio",
  kind: "manual",

  /**
   * Always available. It needs no credentials, which is the whole point: it is
   * the fallback that keeps checkout working when nothing else is configured.
   */
  isConfigured() {
    return true;
  },

  async createPayment(request: PaymentIntentRequest): Promise<PaymentIntent> {
    // No redirect: there is no hosted page to send the customer to. Checkout
    // takes them straight to their order, which states the position plainly.
    return {
      providerRef: `man_${randomUUID()}`,
      redirectUrl: null,
      raw: {
        provider: MANUAL_PROVIDER_ID,
        settlement: "manual",
        orderNumber: request.orderNumber,
        amountCents: request.amountCents,
        currency: request.currency,
        idempotencyKey: request.idempotencyKey,
        note: "Recorded as an outstanding balance. Settled only by a studio operator.",
      },
    };
  },

  /**
   * Structurally incapable of reporting payment.
   *
   * PENDING here means "still outstanding", and the order stays UNPAID as a
   * result — `startPayment` does not move an order to PENDING under manual
   * settlement, because "payment processing" would be a lie about a payment
   * nobody has started.
   */
  async verifyPayment({ providerRef }): Promise<PaymentVerification> {
    return {
      status: "PENDING",
      providerRef,
      amountCents: null,
      currency: null,
      raw: {
        provider: MANUAL_PROVIDER_ID,
        settlement: "manual",
        note: "Manual settlement never reports payment. The studio confirms receipt in the admin.",
      },
    };
  },

  async parseWebhook(): Promise<WebhookParseResult> {
    // Nothing upstream can authenticate to this provider, so nothing may be
    // accepted by it. The callback route turns this into a 400 without
    // explaining why.
    throw new WebhookSignatureError(
      "The manual settlement provider accepts no callbacks.",
    );
  },
};
