import "server-only";
import { sandboxProvider, SANDBOX_PROVIDER_ID } from "@/lib/payments/sandbox-provider";
import { paynowProvider, PAYNOW_PROVIDER_ID } from "@/lib/payments/paynow-provider";
import { manualProvider, MANUAL_PROVIDER_ID } from "@/lib/payments/manual-provider";
import { testPaymentsAllowed } from "@/lib/payments/environment";
import { logger } from "@/lib/logger";
import {
  PaymentProviderNotConfiguredError,
  settlementModeOf,
  type PaymentProvider,
  type PaymentSettlementMode,
} from "@/lib/payments/types";

/**
 * Provider registry.
 *
 * `Payment.provider` is a string column validated against these keys, which is
 * why adding a provider needs no migration.
 */
const PROVIDERS: Record<string, PaymentProvider> = {
  [SANDBOX_PROVIDER_ID]: sandboxProvider,
  [PAYNOW_PROVIDER_ID]: paynowProvider,
  [MANUAL_PROVIDER_ID]: manualProvider,
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
 * Warn once per process rather than on every checkout — a downgrade is a boot
 * condition, and repeating it per request buries it.
 */
let downgradeLogged = false;

function logDowngradeOnce(requested: string): void {
  if (downgradeLogged) return;
  downgradeLogged = true;
  logger.error("payment.test_provider_downgraded_to_manual", {
    requested,
    resolved: MANUAL_PROVIDER_ID,
    detail:
      "A test payment provider was selected on a production deployment. Checkout stays open, " +
      "but orders will be created UNPAID and must be settled by the studio in the admin. " +
      "Set PAYMENT_PROVIDER=manual to make this explicit, or DEPLOYMENT_ENV=staging if this " +
      "deployment is not the real shop.",
  });
}

/**
 * The id checkout should build callback URLs against.
 *
 * WHY THIS DOWNGRADES RATHER THAN THROWS
 *
 * Before manual settlement existed, a production deployment configured with the
 * sandbox provider refused to boot — and the error message suggested setting
 * PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION to get past it, which is precisely how a
 * real shop ends up with caller-chosen payment outcomes. The failure mode of
 * that design was either "the whole storefront is down" or "test payments settle
 * real orders".
 *
 * With a manual provider available there is a third answer, and it is strictly
 * better than both: resolve to manual settlement, keep cart, checkout and order
 * creation working, and make it impossible for the transaction to be recorded as
 * paid. Falling back here is failing SAFE, not failing open — the fallback is
 * the most conservative provider in the registry, not the most permissive.
 *
 * It is loud: an error-level log at first use, and the admin Settings screen
 * reports the resolved provider rather than the requested one.
 */
export function getActiveProviderId(): string {
  const preferred = process.env.PAYMENT_PROVIDER?.trim();

  if (preferred && isKnownProvider(preferred)) {
    const provider = getProvider(preferred);
    if (provider.kind === "test" && !testPaymentsAllowed()) {
      logDowngradeOnce(preferred);
      return MANUAL_PROVIDER_ID;
    }
    return preferred;
  }

  // Unset or unrecognised. Development gets the sandbox so the full lifecycle is
  // exercisable; anything else gets manual settlement.
  return testPaymentsAllowed() ? SANDBOX_PROVIDER_ID : MANUAL_PROVIDER_ID;
}

/**
 * The provider checkout should use.
 *
 * Resolution and configuration are separate questions, so this defers the first
 * to `getActiveProviderId()` and only checks the second. A selected-but-
 * unconfigured provider still throws rather than quietly becoming something
 * else — that case (Paynow named without credentials) is a genuine
 * misconfiguration the operator has to fix, not a safety fallback.
 */
export function getActiveProvider(): PaymentProvider {
  const id = getActiveProviderId();
  const provider = getProvider(id);

  if (!provider.isConfigured()) {
    throw new PaymentProviderNotConfiguredError(
      `Payment provider "${id}" is selected but not configured.`,
    );
  }

  return provider;
}

export function activeProviderOrNull(): PaymentProvider | null {
  try {
    return getActiveProvider();
  } catch {
    return null;
  }
}

/**
 * How payment settles for this deployment right now.
 *
 * Used by checkout and the confirmation page to decide what to tell the
 * customer. A provider that cannot be resolved at all is treated as manual: no
 * online payment is going to happen, so the studio will be arranging it.
 */
export function activeSettlementMode(): PaymentSettlementMode {
  const provider = activeProviderOrNull();
  return provider ? settlementModeOf(provider) : "manual";
}

/**
 * How an EXISTING order settles, judged by the provider it was placed against.
 *
 * Deliberately derived from the order's own payment history rather than from the
 * current environment: an order placed in development against the sandbox must
 * keep describing itself that way even if the same database is later read by a
 * differently-configured process. Falls back to the active mode for an order
 * with no payment row (provider unavailable at checkout time).
 */
export function settlementModeForProvider(
  providerId: string | null | undefined,
): PaymentSettlementMode {
  if (!providerId || !isKnownProvider(providerId)) return activeSettlementMode();
  return settlementModeOf(getProvider(providerId));
}

export * from "@/lib/payments/types";
