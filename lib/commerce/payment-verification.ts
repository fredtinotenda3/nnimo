import type { VerifiedPaymentStatus } from "@/lib/payments/types";

/**
 * The decision "may this verification move the order to PAID?", as a pure
 * function.
 *
 * Extracted from payment-service.ts in Phase 5 for one reason: it is the single
 * most consequential rule in the application — it is what stands between a
 * forged or mis-scoped settlement and money being treated as received — and
 * while it lived inline in a module that imports Prisma, it could only be
 * exercised by an integration test against a real database. Now it is unit
 * testable, and tests/payment-verification.test.ts pins every branch.
 *
 * No database, no provider, no clock. Same inputs, same answer, always.
 */

export type VerificationDecision = {
  /** What the order's payment status should become. */
  status: VerifiedPaymentStatus;
  /** True when the provider claimed PAID and we refused it. */
  rejected: boolean;
  amountMismatch: boolean;
  currencyMismatch: boolean;
};

export function evaluateVerification(params: {
  reportedStatus: VerifiedPaymentStatus;
  /** Integer cents the provider says were paid, or null if it does not say. */
  reportedAmountCents: number | null;
  /** Currency the provider says it settled in, or null if it does not say. */
  reportedCurrency: string | null;
  /** Integer cents we expect, from the order total. */
  expectedAmountCents: number | null;
  expectedCurrency: string;
}): VerificationDecision {
  const isPaidClaim = params.reportedStatus === "PAID";

  /**
   * Amount must match when the provider states one.
   *
   * Underpayment is not payment. A provider that does not report an amount is
   * not treated as a mismatch — absent is not wrong, and the sandbox provider is
   * deliberately in that category.
   */
  const amountMismatch =
    isPaidClaim &&
    params.reportedAmountCents !== null &&
    params.expectedAmountCents !== null &&
    params.reportedAmountCents !== params.expectedAmountCents;

  /**
   * Currency must match too.
   *
   * Paynow issues a SEPARATE integration per currency, so a misconfigured
   * integration id can return a settlement in ZWG whose numeric amount happens
   * to equal the USD total — and an amount-only check passes it as paid. This is
   * the specific failure mode that makes the currency comparison necessary
   * rather than decorative.
   */
  const currencyMismatch =
    isPaidClaim &&
    params.reportedCurrency !== null &&
    params.reportedCurrency.trim().toUpperCase() !==
      params.expectedCurrency.trim().toUpperCase();

  const rejected = amountMismatch || currencyMismatch;

  return {
    // A rejected claim becomes FAILED, never PENDING: leaving it pending would
    // invite a retry that re-presents the same bad settlement.
    status: rejected ? "FAILED" : params.reportedStatus,
    rejected,
    amountMismatch,
    currencyMismatch,
  };
}
