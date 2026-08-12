import "server-only";
import { sandboxProvider, SANDBOX_PROVIDER_ID } from "@/lib/payments/sandbox-provider";
import { paynowProvider, PAYNOW_PROVIDER_ID } from "@/lib/payments/paynow-provider";
import { PaymentProviderNotConfiguredError, type PaymentProvider } from "@/lib/payments/types";

/**
 * Provider registry.
 *
 * `Payment.provider` is a string column validated against these keys, which is
 * why adding a provider needs no migration.
 */
const PROVIDERS: Record<string, PaymentProvider> = {
  [SANDBOX_PROVIDER_ID]: sandboxProvider,
  [PAYNOW_PROVIDER_ID]: paynowProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function isKnownProvider(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

export function getProvider(id: string): PaymentProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new PaymentProviderNotConfiguredError(`Unknown payment provider "${id}".`);
  }
  return provider;
}

/**
 * The provider checkout should use.
 *
 * Explicit env selection first; otherwise the first configured provider. If none
 * is configured this throws rather than falling back to something that pretends
 * to work.
 */
export function getActiveProvider(): PaymentProvider {
  const preferred = process.env.PAYMENT_PROVIDER?.trim();

  if (preferred) {
    const provider = getProvider(preferred);
    if (!provider.isConfigured()) {
      throw new PaymentProviderNotConfiguredError(
        `Payment provider "${preferred}" is selected but not configured.`,
      );
    }
    return provider;
  }

  const configured = PROVIDER_IDS.map((id) => PROVIDERS[id]!).find((p) => p.isConfigured());
  if (!configured) {
    throw new PaymentProviderNotConfiguredError(
      "No payment provider is configured. Set PAYMENT_PROVIDER=sandbox, or supply Paynow credentials and implement its adapter.",
    );
  }
  return configured;
}

export function activeProviderOrNull(): PaymentProvider | null {
  try {
    return getActiveProvider();
  } catch {
    return null;
  }
}

export * from "@/lib/payments/types";
