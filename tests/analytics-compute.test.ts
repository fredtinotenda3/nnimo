import { describe, expect, it } from "vitest";
import {
  averageValue,
  computeMoneyTrend,
  computeTrend,
  coverage,
  emptyTotal,
  formatCoverage,
  formatShare,
  formatTrend,
  rankByCents,
  ratePerUnit,
  segmentByCurrency,
  seriesCountPeak,
  seriesPeak,
  share,
  sumSeries,
} from "@/lib/analytics/compute";

/**
 * The analytics arithmetic.
 *
 * These tests are mostly about what the code REFUSES to compute: no cross-
 * currency sums, no percentage change from a base of zero, no share of an empty
 * total rendered as 0%. Each of those would produce a number that looks like a
 * measurement, which is the specific failure mode the phase brief calls out.
 */

const usd = (cents: number, count: number) => ({ currency: "USD", cents, count });
const zwg = (cents: number, count: number) => ({ currency: "ZWG", cents, count });

describe("currency segmentation", () => {
  it("returns a zeroed primary total when there is nothing at all", () => {
    const result = segmentByCurrency([], "USD");
    expect(result.primary).toEqual(emptyTotal("USD"));
    expect(result.isMixed).toBe(false);
    expect(result.excludedCount).toBe(0);
  });

  it("reports a single-currency studio as not mixed", () => {
    const result = segmentByCurrency([usd(150_00, 3)], "USD");
    expect(result.primary).toEqual(usd(150_00, 3));
    expect(result.others).toEqual([]);
    expect(result.isMixed).toBe(false);
  });

  it("NEVER adds a second currency into the primary total", () => {
    // 100 USD plus 100 ZWG is not 200 of anything. This is the assertion the
    // whole currency design exists for.
    const result = segmentByCurrency([usd(100_00, 1), zwg(100_00, 1)], "USD");
    expect(result.primary.cents).toBe(100_00);
    expect(result.primary.currency).toBe("USD");
  });

  it("surfaces excluded orders rather than dropping them", () => {
    const result = segmentByCurrency([usd(100_00, 1), zwg(80_00, 4)], "USD");
    expect(result.isMixed).toBe(true);
    expect(result.excludedCount).toBe(4);
    expect(result.others).toEqual([zwg(80_00, 4)]);
  });

  it("orders other currencies by size, largest first", () => {
    const result = segmentByCurrency(
      [usd(10_00, 1), zwg(5_00, 1), { currency: "ZAR", cents: 90_00, count: 2 }],
      "USD",
    );
    expect(result.others.map((total) => total.currency)).toEqual(["ZAR", "ZWG"]);
  });

  it("still reports the reporting currency when no order used it", () => {
    // The studio reports in USD but has only ever been paid in ZWG. The
    // headline must read zero USD, not silently become a ZWG figure.
    const result = segmentByCurrency([zwg(500_00, 2)], "USD");
    expect(result.primary).toEqual(emptyTotal("USD"));
    expect(result.excludedCount).toBe(2);
  });

  it("combines several rows of the same currency", () => {
    const result = segmentByCurrency([usd(100_00, 1), usd(50_00, 2)], "USD");
    expect(result.primary).toEqual(usd(150_00, 3));
  });
});

describe("average order value", () => {
  it("divides and rounds to the nearest cent", () => {
    expect(averageValue(usd(1000, 3)).cents).toBe(333);
  });

  it("returns an empty total rather than NaN when nothing settled", () => {
    expect(averageValue(usd(0, 0))).toEqual(emptyTotal("USD"));
  });

  it("keeps the currency of the total it averaged", () => {
    expect(averageValue(zwg(900, 2)).currency).toBe("ZWG");
  });
});

describe("rates and shares", () => {
  it("computes a rate to two decimal places", () => {
    expect(ratePerUnit(7, 3)).toBe(2.33);
  });

  it("returns null rather than dividing by zero", () => {
    expect(ratePerUnit(5, 0)).toBeNull();
  });

  it("returns null for a share of an empty total", () => {
    // Not 0%: a share of nothing is undefined, and rendering 0% would make
    // every row of an empty table look equally insignificant rather than absent.
    expect(share(0, 0)).toBeNull();
  });

  it("computes a share of a real total", () => {
    expect(share(25, 100)).toBe(0.25);
  });
});

describe("trends", () => {
  it("computes a rise", () => {
    expect(computeTrend(150, 100)).toEqual({ direction: "up", percent: 50, reason: null });
  });

  it("computes a fall", () => {
    const trend = computeTrend(100, 150);
    expect(trend.direction).toBe("down");
    expect(trend.percent).toBe(-33.3);
  });

  it("reads an unchanged figure as flat, not as a tiny movement", () => {
    expect(computeTrend(100, 100)).toEqual({ direction: "flat", percent: 0, reason: null });
  });

  it("refuses to compute a change from a base of zero", () => {
    // Going from nothing to something is not "infinity percent"; it is the
    // first activity in the period, and the UI says so.
    const trend = computeTrend(500, 0);
    expect(trend.direction).toBe("none");
    expect(trend.reason).toBe("zero_base");
    expect(trend.percent).toBeNull();
  });

  it("refuses to compute a change with no previous period", () => {
    expect(computeTrend(500, null).reason).toBe("no_comparison");
  });

  it("refuses to compare amounts in different currencies", () => {
    const trend = computeMoneyTrend(usd(100_00, 1), zwg(100_00, 1));
    expect(trend.direction).toBe("none");
    expect(trend.reason).toBe("currency_mismatch");
  });

  it("compares amounts in the same currency", () => {
    expect(computeMoneyTrend(usd(200_00, 2), usd(100_00, 1)).percent).toBe(100);
  });

  it("formats a trend with a true minus sign, never a hyphen", () => {
    expect(formatTrend(computeTrend(150, 100))).toBe("+50.0%");
    expect(formatTrend(computeTrend(100, 150))).toBe("\u221233.3%");
    expect(formatTrend(computeTrend(100, 100))).toBe("No change");
  });

  it("explains why a trend is missing instead of showing a dash", () => {
    expect(formatTrend(computeTrend(5, 0))).toBe("First activity in this period");
    expect(formatTrend(computeTrend(5, null))).toBe("No comparable period");
  });
});

describe("coverage", () => {
  it("describes a partially priced catalogue honestly", () => {
    // The real Nnino shape: most of the catalogue has never been priced.
    expect(formatCoverage(coverage(9, 369), "pieces")).toBe("9 of 369 pieces (2%)");
  });

  it("does not divide by zero on an empty population", () => {
    expect(coverage(0, 0).ratio).toBeNull();
    expect(formatCoverage(coverage(0, 0), "pieces")).toBe("No pieces recorded");
  });

  it("reports full coverage", () => {
    expect(formatCoverage(coverage(10, 10), "pieces")).toBe("10 of 10 pieces (100%)");
  });
});

describe("share formatting", () => {
  it("renders a dash when there is no share to render", () => {
    expect(formatShare(null)).toBe("—");
  });

  it("marks a non-zero share too small to round as such", () => {
    // Rounding 0.05% to "0.0%" makes a real sale look like an error.
    expect(formatShare(0.0005)).toBe("<0.1%");
  });

  it("renders an ordinary share to one decimal place", () => {
    expect(formatShare(0.5)).toBe("50.0%");
  });

  it("renders a genuine zero as zero", () => {
    expect(formatShare(0)).toBe("0.0%");
  });
});

describe("ranking", () => {
  const rows = [
    { name: "a", cents: 10_00 },
    { name: "b", cents: 50_00 },
    { name: "c", cents: 30_00 },
  ];

  it("orders by amount, largest first", () => {
    expect(rankByCents(rows, 90_00, 3).map((row) => row.name)).toEqual(["b", "c", "a"]);
  });

  it("computes shares against the FULL total, not the rows shown", () => {
    // A top-two table whose shares add to 100% is lying about the tail.
    const top = rankByCents(rows, 90_00, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.share).toBeCloseTo(50_00 / 90_00);
    expect(top[1]?.share).toBeCloseTo(30_00 / 90_00);
  });

  it("survives an empty dataset", () => {
    expect(rankByCents([], 0, 10)).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const original = [...rows];
    rankByCents(rows, 90_00, 3);
    expect(rows).toEqual(original);
  });
});

describe("series helpers", () => {
  const points = [
    { cents: 100, count: 1 },
    { cents: 400, count: 3 },
    { cents: 0, count: 0 },
  ];

  it("sums a series", () => {
    expect(sumSeries(points)).toEqual({ cents: 500, count: 4 });
  });

  it("finds the peak for chart scaling", () => {
    expect(seriesPeak(points)).toBe(400);
    expect(seriesCountPeak(points)).toBe(3);
  });

  it("never returns a zero peak, which would divide by zero when scaling bars", () => {
    expect(seriesPeak([{ cents: 0 }])).toBe(1);
    expect(seriesCountPeak([])).toBe(1);
  });

  it("sums an empty series to zero", () => {
    expect(sumSeries([])).toEqual({ cents: 0, count: 0 });
  });
});
