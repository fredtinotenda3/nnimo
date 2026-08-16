import { describe, expect, it } from "vitest";
import { evaluateVerification } from "@/lib/commerce/payment-verification";

/**
 * The rule that stands between a forged or mis-scoped settlement and money being
 * treated as received. Every branch is pinned.
 */
const base = {
  reportedStatus: "PAID" as const,
  reportedAmountCents: 12500,
  reportedCurrency: "USD",
  expectedAmountCents: 12500,
  expectedCurrency: "USD",
};

describe("evaluateVerification", () => {
  it("accepts a payment that matches on amount and currency", () => {
    const decision = evaluateVerification(base);
    expect(decision.status).toBe("PAID");
    expect(decision.rejected).toBe(false);
  });

  it("refuses an underpayment", () => {
    const decision = evaluateVerification({ ...base, reportedAmountCents: 12400 });
    expect(decision.status).toBe("FAILED");
    expect(decision.amountMismatch).toBe(true);
  });

  it("refuses an overpayment too — a mismatch is a mismatch", () => {
    const decision = evaluateVerification({ ...base, reportedAmountCents: 99900 });
    expect(decision.status).toBe("FAILED");
    expect(decision.amountMismatch).toBe(true);
  });

  /**
   * PHASE 5 REGRESSION TEST. Currency was not checked at all before.
   *
   * Paynow issues a separate integration per currency, so a misconfigured
   * integration id can settle in ZWG with a numeric amount equal to the USD
   * total. The amount check alone passes it; this is what catches it.
   */
  it("refuses a settlement in the wrong currency even when the amount matches", () => {
    const decision = evaluateVerification({ ...base, reportedCurrency: "ZWG" });
    expect(decision.status).toBe("FAILED");
    expect(decision.currencyMismatch).toBe(true);
    expect(decision.amountMismatch).toBe(false);
  });

  it("compares currency case- and whitespace-insensitively", () => {
    expect(evaluateVerification({ ...base, reportedCurrency: " usd " }).rejected).toBe(false);
  });

  /**
   * Absent is not wrong. The sandbox provider reports neither amount nor
   * currency by design, and treating silence as a mismatch would make every
   * sandbox payment fail.
   */
  it("accepts a provider that reports no amount", () => {
    expect(
      evaluateVerification({ ...base, reportedAmountCents: null }).status,
    ).toBe("PAID");
  });

  it("accepts a provider that reports no currency", () => {
    expect(evaluateVerification({ ...base, reportedCurrency: null }).status).toBe("PAID");
  });

  it("accepts when we ourselves have no expected amount to compare", () => {
    expect(
      evaluateVerification({ ...base, expectedAmountCents: null }).status,
    ).toBe("PAID");
  });

  it("flags both mismatches at once when both are wrong", () => {
    const decision = evaluateVerification({
      ...base,
      reportedAmountCents: 1,
      reportedCurrency: "ZWG",
    });
    expect(decision.amountMismatch).toBe(true);
    expect(decision.currencyMismatch).toBe(true);
    expect(decision.status).toBe("FAILED");
  });

  /**
   * A mismatch only matters on a PAID claim. A provider reporting FAILED with a
   * mismatched amount is still just FAILED — it must not be relabelled or
   * reported as a reconciliation incident.
   */
  it("passes non-PAID statuses through untouched", () => {
    for (const status of ["PENDING", "FAILED", "CANCELLED"] as const) {
      const decision = evaluateVerification({
        ...base,
        reportedStatus: status,
        reportedAmountCents: 1,
        reportedCurrency: "ZWG",
      });
      expect(decision.status).toBe(status);
      expect(decision.rejected).toBe(false);
    }
  });

  it("never turns a rejected claim into PENDING, which would invite a retry", () => {
    expect(evaluateVerification({ ...base, reportedAmountCents: 1 }).status).toBe("FAILED");
  });
});
