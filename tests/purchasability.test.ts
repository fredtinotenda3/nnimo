import { describe, expect, it } from "vitest";
import {
  MAX_QUANTITY_PER_LINE,
  evaluatePurchasability,
  isPurchasable,
  normaliseQuantity,
} from "@/lib/commerce/purchasability";

const base = {
  lifecycleStage: "PUBLISHED" as const,
  availability: "MADE_TO_ORDER" as const,
  price: { toString: () => "150.00" },
  inventory: null,
};

describe("evaluatePurchasability", () => {
  it("allows a published, priced, made-to-order piece", () => {
    const result = evaluatePurchasability(base);
    expect(result.purchasable).toBe(true);
    expect(result.reason).toBe("PURCHASABLE");
  });

  it("refuses a piece with no verified price", () => {
    // The core Phase 3 rule: unpriced catalogue pieces stay browsable but can
    // never be bought.
    const result = evaluatePurchasability({ ...base, price: null });
    expect(result.purchasable).toBe(false);
    expect(result.reason).toBe("NO_VERIFIED_PRICE");
  });

  it("refuses a price of zero as unverified rather than free", () => {
    const result = evaluatePurchasability({ ...base, price: { toString: () => "0.00" } });
    expect(result.purchasable).toBe(false);
  });

  it("refuses anything not published", () => {
    for (const stage of ["CATALOGUE", "ARCHIVED"] as const) {
      expect(isPurchasable({ ...base, lifecycleStage: stage })).toBe(false);
    }
  });

  it("refuses when availability has not been set", () => {
    const result = evaluatePurchasability({ ...base, availability: null });
    expect(result.purchasable).toBe(false);
    expect(result.reason).toBe("NO_AVAILABILITY_SET");
  });

  it("refuses out of stock, coming soon and commission-only pieces", () => {
    const cases = {
      OUT_OF_STOCK: "OUT_OF_STOCK",
      COMING_SOON: "COMING_SOON",
      CUSTOM_ONLY: "COMMISSION_ONLY",
    } as const;
    for (const [availability, reason] of Object.entries(cases)) {
      const result = evaluatePurchasability({
        ...base,
        availability: availability as never,
      });
      expect(result.purchasable).toBe(false);
      expect(result.reason).toBe(reason);
    }
  });

  it("refuses stock-backed pieces with no stock record rather than inventing stock", () => {
    const result = evaluatePurchasability({
      ...base,
      availability: "IN_STOCK",
      inventory: null,
    });
    expect(result.purchasable).toBe(false);
    expect(result.reason).toBe("NO_STOCK_RECORD");
  });

  it("does not stock-check a made-to-order piece", () => {
    // Made to order has no stock by definition; requiring a stock row would
    // block the only thing Nnino currently sells.
    const result = evaluatePurchasability({ ...base, inventory: null });
    expect(result.purchasable).toBe(true);
    expect(result.maxQuantity).toBeUndefined();
  });

  it("caps quantity at the available stock for stock-backed pieces", () => {
    const result = evaluatePurchasability({
      ...base,
      availability: "IN_STOCK",
      inventory: { onHand: 3, reserved: 1 },
    });
    expect(result.purchasable).toBe(true);
    expect(result.maxQuantity).toBe(2);
  });

  it("refuses when everything is already reserved", () => {
    const result = evaluatePurchasability({
      ...base,
      availability: "IN_STOCK",
      inventory: { onHand: 2, reserved: 2 },
    });
    expect(result.purchasable).toBe(false);
  });
});

describe("normaliseQuantity", () => {
  it("accepts whole numbers within range", () => {
    expect(normaliseQuantity("1")).toBe(1);
    expect(normaliseQuantity(3)).toBe(3);
  });

  it("rejects zero, negatives, fractions and nonsense", () => {
    for (const value of [0, -1, 1.5, "abc", "", null, undefined, Number.NaN]) {
      expect(normaliseQuantity(value)).toBeNull();
    }
  });

  it("rejects quantities beyond the per-line ceiling", () => {
    expect(normaliseQuantity(MAX_QUANTITY_PER_LINE)).toBe(MAX_QUANTITY_PER_LINE);
    expect(normaliseQuantity(MAX_QUANTITY_PER_LINE + 1)).toBeNull();
  });
});
