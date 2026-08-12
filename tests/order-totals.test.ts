import { describe, expect, it } from "vitest";
import { toCents } from "@/lib/commerce/money";
import { orderTotalFromItems } from "@/lib/commerce/orders";

const money = (value: string) => ({ toString: () => value });

describe("orderTotalFromItems", () => {
  it("sums line totals exactly, in cents", () => {
    const total = orderTotalFromItems(
      [
        { unitPrice: money("150.00"), quantity: 2 },
        { unitPrice: money("99.99"), quantity: 1 },
      ],
      null,
    );
    expect(total).toBe(39999);
  });

  it("adds a quoted delivery fee to the total", () => {
    const total = orderTotalFromItems(
      [{ unitPrice: money("150.00"), quantity: 1 }],
      money("25.00"),
    );
    expect(total).toBe(17500);
  });

  it("treats an unquoted delivery as zero rather than guessing a fee", () => {
    const total = orderTotalFromItems([{ unitPrice: money("150.00"), quantity: 1 }], null);
    expect(total).toBe(15000);
  });

  it("is exact where floating point would not be", () => {
    // Three items at 0.10 would be 0.30000000000000004 as floats.
    const total = orderTotalFromItems(
      [
        { unitPrice: money("0.10"), quantity: 1 },
        { unitPrice: money("0.10"), quantity: 1 },
        { unitPrice: money("0.10"), quantity: 1 },
      ],
      null,
    );
    expect(total).toBe(30);
    expect(total).toBe(toCents("0.30"));
  });

  it("returns zero for an empty order rather than throwing", () => {
    expect(orderTotalFromItems([], null)).toBe(0);
  });
});
