import "server-only";
import { sandboxProvider, SANDBOX_PROVIDER_ID } from "@/lib/payments/sandbox-provider";
import { paynowProvider, PAYNOW_PROVIDER_ID } from "@/lib/payments/paynow-provider";
import type { PaymentProvider } from "@/lib/payments/types";

const PROVIDERS: Record<string, PaymentProvider> = {
  [SANDBOX_PROVIDER_ID]: sandboxProvider,
  [PAYNOW_PROVIDER_ID]: paynowProvider,
};

export const ALLOWED_PAYMENT_PROVIDER_IDS = Object.keys(PROVIDERS);

export function isKnownPaymentProvider(id: string): boolean {
  return id in PROVIDERS;
}

export function getPaymentProvider(id: string): PaymentProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown payment provider "${id}".`);
  return provider;
}

export function getDefaultPaymentProviderId(): string {
  const requested = process.env.PAYMENT_PROVIDER?.trim();
  if (requested && isKnownPaymentProvider(requested)) return requested;
  return SANDBOX_PROVIDER_ID;
}

/** The provider checkout should actually use — never an unconfigured one. */
export function getCheckoutPaymentProvider(): PaymentProvider {
  const provider = getPaymentProvider(getDefaultPaymentProviderId());
  if (provider.isConfigured()) return provider;   // ← fixed: was provider.configured
  return sandboxProvider;
}

export * from "@/lib/payments/types";