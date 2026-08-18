/**
 * Provider-agnostic payment contract.
 *
 * Orders and checkout depend on this interface and never on a provider. Adding
 * Paynow, a card gateway or anything else is a new file implementing
 * PaymentProvider plus one registry entry — no change to cart, order or
 * checkout logic.
 */

export type PaymentIntentRequest = {
  orderId: string;
  orderNumber: string;
  /** Integer cents. Providers convert to their own format. */
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerPhone: string | null;
  /** Where the customer returns after the provider's flow. */
  returnUrl: string;
  /**
   * The order's guest access token.
   *
   * Not a new disclosure: `returnUrl` already embeds it, because the customer
   * has to land back on their own order page. Passing it explicitly means a
   * provider adapter that needs to construct a URL of its own does not have to
   * parse it back out of returnUrl, which is the kind of string surgery that
   * breaks silently when a route changes.
   */
  orderAccessToken: string;
  /** Server-to-server callback. */
  resultUrl: string;
  /** Our key, echoed back so a retry cannot double-charge. */
  idempotencyKey: string;
};

export type PaymentIntent = {
  /** The provider's reference, stored on Payment.providerRef. */
  providerRef: string | null;
  /**
   * Where to send the customer next. Null for providers that complete
   * server-side (mobile-money push, for instance).
   */
  redirectUrl: string | null;
  /** Verbatim provider response, stored for audit. */
  raw: unknown;
};

/** The only statuses the commerce engine understands. */
export type VerifiedPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type PaymentVerification = {
  status: VerifiedPaymentStatus;
  providerRef: string | null;
  /** Integer cents as reported by the provider, when it reports one. */
  amountCents: number | null;
  currency: string | null;
  raw: unknown;
};

export type WebhookParseResult = {
  /**
   * Stable key for this event. Written to PaymentWebhookEvent.idempotencyKey,
   * which is UNIQUE — so a replayed callback is rejected by the database.
   */
  idempotencyKey: string;
  eventType: string;
  /** Our order number, extracted from the payload. */
  orderNumber: string | null;
  providerRef: string | null;
  raw: unknown;
};

export class PaymentProviderNotConfiguredError extends Error {}
export class PaymentVerificationError extends Error {}
export class WebhookSignatureError extends Error {}

/**
 * What kind of thing is on the other end of this adapter?
 *
 *   live   — a real settlement network. Its verification may move money.
 *   test   — the OUTCOME IS CHOSEN BY THE CALLER. Must never settle a real
 *            order; see lib/payments/environment.ts.
 *   manual — nothing settles online at all. The studio confirms receipt out of
 *            band and records it through the admin.
 *
 * Declared on the provider rather than inferred from its id, so the settlement
 * guard in lib/commerce/payment-service.ts is a property check rather than a
 * string comparison that silently stops matching when a provider is renamed.
 */
export type PaymentProviderKind = "live" | "test" | "manual";

/**
 * Automatic: the provider tells us whether payment succeeded, and verification
 * moves the order. Manual: only a human at the studio can, and the order stays
 * UNPAID until they do.
 */
export type PaymentSettlementMode = "automatic" | "manual";

export function settlementModeOf(
  provider: Pick<PaymentProvider, "kind">,
): PaymentSettlementMode {
  return provider.kind === "manual" ? "manual" : "automatic";
}

export interface PaymentProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: PaymentProviderKind;
  /** False until real credentials are present. Checkout refuses to use it. */
  isConfigured(): boolean;
  createPayment(request: PaymentIntentRequest): Promise<PaymentIntent>;
  /**
   * Asks the provider what actually happened. This is the ONLY path that may
   * move an order to PAID — never a browser redirect, never a form field.
   */
  verifyPayment(params: { providerRef: string | null; orderNumber: string }): Promise<PaymentVerification>;
  /**
   * Authenticates and parses an inbound callback. Must throw
   * WebhookSignatureError on anything it cannot authenticate.
   */
  parseWebhook(params: { rawBody: string; headers: Record<string, string> }): Promise<WebhookParseResult>;
}
