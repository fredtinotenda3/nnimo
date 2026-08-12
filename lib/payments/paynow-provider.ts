import {
  PaymentProviderNotConfiguredError,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentVerification,
  type WebhookParseResult,
} from "@/lib/payments/types";

export const PAYNOW_PROVIDER_ID = "paynow";

/**
 * Paynow adapter boundary — intentionally unimplemented.
 *
 * Paynow (Webdev) is the agreed Zimbabwe provider, fronting EcoCash, OneMoney,
 * ZIPIT and card. Every method below throws until real credentials exist, and
 * `isConfigured()` returns false so checkout will not offer it. Writing a
 * speculative implementation would mean shipping request signing and a hash
 * scheme that has never been executed against the real endpoint, which is worse
 * than shipping nothing: it looks finished.
 *
 * TO IMPLEMENT, THE FOLLOWING IS STILL NEEDED FROM THE BUSINESS
 *   1. Integration ID and Integration Key. Paynow issues these per integration,
 *      and USD and ZWG require SEPARATE integrations. Commerce is USD-only for
 *      now, so one USD integration is enough.
 *   2. Integration style: hosted redirect, or Express Checkout where the payment
 *      is initiated server-side and approved on the customer's handset. These
 *      are different flows and different UX.
 *   3. A production domain, for the Return URL and Result URL.
 *   4. Confirmation of refund handling. Paynow has no automated refund API, so
 *      `order:refund` will record a reconciliation rather than call anything.
 *
 * WHEN IMPLEMENTING
 *   - Paynow authenticates with a concatenated-field SHA512 hash, not an HMAC
 *     header. `parseWebhook` must recompute and compare it, and throw
 *     WebhookSignatureError on mismatch.
 *   - Treat the status in the callback as a hint only. Always call the poll URL
 *     from `verifyPayment` server-side before moving an order to PAID.
 */
function notConfigured(): never {
  throw new PaymentProviderNotConfiguredError(
    "Paynow is not configured. Supply PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY and implement lib/payments/paynow-provider.ts.",
  );
}

export const paynowProvider: PaymentProvider = {
  id: PAYNOW_PROVIDER_ID,
  displayName: "Paynow (EcoCash, OneMoney, card)",

  isConfigured() {
    // Credentials alone are not enough — the methods below are still stubs, so
    // this stays false until they are actually written and tested.
    return false;
  },

  async createPayment(): Promise<PaymentIntent> {
    notConfigured();
  },
  async verifyPayment(): Promise<PaymentVerification> {
    notConfigured();
  },
  async parseWebhook(): Promise<WebhookParseResult> {
    notConfigured();
  },
};
