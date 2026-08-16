import { createHash, randomUUID } from "node:crypto";
import {
  PaymentVerificationError,
  type PaymentIntent,
  type PaymentIntentRequest,
  type PaymentProvider,
  type PaymentVerification,
  type VerifiedPaymentStatus,
  type WebhookParseResult,
} from "@/lib/payments/types";

/**
 * Sandbox provider — the whole commerce lifecycle, exercised without a real
 * gateway.
 *
 * It does not fake a *production* payment: it is explicitly a test provider, it
 * refuses to load outside development unless deliberately enabled, and the
 * outcome is chosen by whoever is testing rather than assumed to be success.
 *
 * The point is that when the real Paynow credentials arrive, the only new code is
 * the Paynow adapter — the order lifecycle, verification path and webhook
 * handling will already have been proven end to end.
 */
const outcomes = new Map<string, VerifiedPaymentStatus>();

export const SANDBOX_PROVIDER_ID = "sandbox";

export const sandboxProvider: PaymentProvider = {
  id: SANDBOX_PROVIDER_ID,
  displayName: "Sandbox (test payments)",

  isConfigured() {
    // Never silently active in production. Turning it on there takes a
    // deliberate environment variable, and it is named to be obvious in a log.
    return (
      process.env.NODE_ENV !== "production" ||
      process.env.PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION === "true"
    );
  },

  async createPayment(request: PaymentIntentRequest): Promise<PaymentIntent> {
    const providerRef = `sbx_${randomUUID()}`;
    outcomes.set(request.orderNumber, "PENDING");

    return {
      providerRef,
      // A local page standing in for the gateway's hosted form.
      //
      // The access token is carried in the query string because the sandbox page
      // now REQUIRES it (Phase 5 fix): the page used to look an order up by its
      // sequential number and hand out the token, which let anyone walk the
      // sequence and read every customer's details. The token is a secret the
      // caller must already hold, not one the page will disclose.
      redirectUrl:
        `/checkout/sandbox/${encodeURIComponent(request.orderNumber)}` +
        `?token=${encodeURIComponent(request.orderAccessToken)}&ref=${encodeURIComponent(providerRef)}`,
      raw: {
        provider: SANDBOX_PROVIDER_ID,
        providerRef,
        amountCents: request.amountCents,
        currency: request.currency,
        idempotencyKey: request.idempotencyKey,
      },
    };
  },

  async verifyPayment({ providerRef, orderNumber }): Promise<PaymentVerification> {
    const status = outcomes.get(orderNumber);
    if (!status) {
      // In-memory, so a server restart loses the record. Surfaced as an error
      // rather than defaulting to PAID or FAILED — guessing here is exactly the
      // habit that causes real payment bugs.
      throw new PaymentVerificationError(
        `No sandbox payment recorded for ${orderNumber}. The dev server may have restarted; start the payment again.`,
      );
    }

    return {
      status,
      providerRef,
      amountCents: null,
      currency: null,
      raw: { provider: SANDBOX_PROVIDER_ID, orderNumber, status },
    };
  },

  async parseWebhook({ rawBody }): Promise<WebhookParseResult> {
    const payload = JSON.parse(rawBody) as {
      orderNumber?: string;
      status?: string;
      providerRef?: string;
    };

    const orderNumber = payload.orderNumber ?? null;
    const status = (payload.status ?? "PENDING").toUpperCase();

    // Deterministic key: the same callback replayed produces the same key, and
    // PaymentWebhookEvent.idempotencyKey is UNIQUE, so the replay is rejected by
    // the database rather than by application logic.
    const idempotencyKey = createHash("sha256")
      .update(`${SANDBOX_PROVIDER_ID}:${orderNumber}:${status}:${payload.providerRef ?? ""}`)
      .digest("hex");

    return {
      idempotencyKey,
      eventType: `sandbox.payment.${status.toLowerCase()}`,
      orderNumber,
      providerRef: payload.providerRef ?? null,
      raw: payload,
    };
  },
};

/** Test-only: records the outcome the tester chose on the sandbox page. */
export function setSandboxOutcome(orderNumber: string, status: VerifiedPaymentStatus): void {
  outcomes.set(orderNumber, status);
}
