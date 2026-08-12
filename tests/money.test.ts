import { describe, expect, it } from "vitest";
import {
  MoneyParseError,
  centsToDecimalString,
  formatCents,
  multiplyCents,
  requireCents,
  sumCents,
  toCents,
} from "@/lib/commerce/money";

describe("toCents", () => {
  it("parses Prisma Decimal-like objects via their string form", () => {
    expect(toCents({ toString: () => "150.00" })).toBe(15000);
    expect(toCents({ toString: () => "150" })).toBe(15000);
    expect(toCents({ toString: () => "0.05" })).toBe(5);
  });

  it("treats null and undefined as 'no verified price', not zero", () => {
    // This distinction is the whole basis of the unpriced-product rule: a null
    // price must never collapse into a free product.
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
  });

  it("rejects values that are not money", () => {
    expect(() => requireCents("abc")).toThrow(MoneyParseError);
    expect(() => requireCents(Number.NaN)).toThrow(MoneyParseError);
    expect(() => requireCents(Number.POSITIVE_INFINITY)).toThrow(MoneyParseError);
  });

  it("carries a sign rather than rejecting it", () => {
    // Negative amounts are meaningful for refunds and adjustments, so the parser
    // preserves them. Guarding prices is purchasability's job, not the parser's
    // — see the purchasability suite, where a non-positive price is refused.
    expect(requireCents("-1.00")).toBe(-100);
    expect(centsToDecimalString(-100)).toBe("-1.00");
  });

  it("does not lose the third decimal silently", () => {
    // 0.005 would round to a cent under float maths; money must refuse it.
    expect(() => requireCents("0.005")).toThrow(MoneyParseError);
  });
});

describe("integer arithmetic", () => {
  it("avoids the classic float error", () => {
    // 0.1 + 0.2 !== 0.3 in floating point. In cents it is exact.
    expect(sumCents([toCents("0.10")!, toCents("0.20")!])).toBe(30);
    expect(centsToDecimalString(sumCents([10, 20]))).toBe("0.30");
  });

  it("multiplies without drift across a large quantity", () => {
    expect(multiplyCents(15000, 7)).toBe(105000);
    expect(centsToDecimalString(multiplyCents(15000, 7))).toBe("1050.00");
  });

  it("round-trips through the Decimal string form Prisma stores", () => {
    for (const value of ["0.01", "9.99", "150.00", "1234.56"]) {
      expect(centsToDecimalString(toCents(value)!)).toBe(
        value.includes(".") ? value : `${value}.00`,
      );
    }
  });

  it("rejects non-integer or negative quantities in multiplication", () => {
    expect(() => multiplyCents(100, 1.5)).toThrow();
    expect(() => multiplyCents(100, -1)).toThrow();
  });
});

describe("formatCents", () => {
  it("renders USD amounts", () => {
    expect(formatCents(15000, "USD")).toContain("150");
    expect(formatCents(0, "USD")).toContain("0");
  });
});
