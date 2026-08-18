/**
 * Where is this deployment, for payment-safety purposes?
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 *
 * The single most important payment rule in the application is "a provider whose
 * outcome the caller chooses must never settle a real customer's order". Until
 * now that rule was expressed three times, in three files, each reading
 * `process.env` slightly differently — in `sandbox-provider.isConfigured()`, in
 * `lib/env.ts`'s boot check, and implicitly in the checkout copy. Three copies of
 * a safety predicate is three chances for them to disagree.
 *
 * It is a pure function of an environment bag, with no `server-only` import, so
 * every branch is unit tested in tests/payment-environment.test.ts rather than
 * only reachable by deploying something.
 *
 * WHY NODE_ENV IS NOT ENOUGH
 *
 * `next build` sets NODE_ENV=production for every deployed environment, including
 * Vercel preview builds and any staging deployment. So NODE_ENV cannot tell
 * "the real shop, taking real money" apart from "a staging copy where the team
 * deliberately wants test payments" — and that distinction is exactly what the
 * rule turns on. DEPLOYMENT_ENV states it explicitly instead of inferring it.
 *
 * BACKWARD COMPATIBILITY
 *
 * `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` was the Phase 5 way of saying "this is
 * a staging box". It is still honoured so an existing staging deployment does not
 * change behaviour on this release, but it is deprecated: it reads as a
 * permission to loosen production rather than as a statement about which
 * environment this is, and that framing is how a real shop ends up with test
 * payments switched on. Prefer DEPLOYMENT_ENV.
 */

export type DeploymentEnv = "development" | "staging" | "production";

/** The subset of the environment this module reads. */
export type PaymentEnvSource = {
  NODE_ENV?: string;
  DEPLOYMENT_ENV?: string;
  PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION?: string;
};

function isDeploymentEnv(value: string): value is DeploymentEnv {
  return value === "development" || value === "staging" || value === "production";
}

/**
 * Resolution order, most explicit first:
 *
 *   1. DEPLOYMENT_ENV, when it names a known environment.
 *   2. Anything not built for production is development.
 *   3. The deprecated staging flag.
 *   4. Otherwise: production. The safe default — an unlabelled production build
 *      is treated as the real shop, never as a sandbox.
 */
export function resolveDeploymentEnv(
  source: PaymentEnvSource = process.env,
): DeploymentEnv {
  const declared = source.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (declared && isDeploymentEnv(declared)) return declared;

  if (source.NODE_ENV !== "production") return "development";
  if (source.PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION === "true") return "staging";

  return "production";
}

/**
 * May a test provider — one whose outcome is chosen by whoever is testing —
 * operate here?
 *
 * This is the predicate the whole manual-settlement design rests on. It is
 * consulted in three independent places (provider selection, payment start, and
 * the settlement decision itself) so that no single missed check can let a
 * sandbox transaction mark a production order paid.
 */
export function testPaymentsAllowed(source: PaymentEnvSource = process.env): boolean {
  return resolveDeploymentEnv(source) !== "production";
}

/** True on the real shop, where only a real settlement may move money. */
export function isProductionSettlement(source: PaymentEnvSource = process.env): boolean {
  return !testPaymentsAllowed(source);
}

/** True when the deprecated flag is doing the work, so boot can say so once. */
export function usesDeprecatedSandboxFlag(
  source: PaymentEnvSource = process.env,
): boolean {
  const declared = source.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (declared && isDeploymentEnv(declared)) return false;
  return (
    source.NODE_ENV === "production" &&
    source.PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION === "true"
  );
}
