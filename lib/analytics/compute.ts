/**
 * The analytics arithmetic.
 *
 * Pure, database-free and therefore unit-testable — `tests/stubs/db.ts` makes
 * that a hard requirement rather than a preference. Every figure the dashboard
 * shows is computed by a function in this file from rows the query layer
 * fetched; the query layer itself does grouping and summing in Postgres and no
 * derivation at all.
 *
 * The recurring theme is refusing to produce a number that looks like a
 * measurement but is not one: no division by zero rendered as 0, no percentage
 * change from a base of nothing, and no addition across currencies.
 */

import type {
  Coverage,
  CurrencySegmentation,
  CurrencyTotal,
  Trend,
} from "@/lib/analytics/types";

/** A currency total with nothing in it. */
export function emptyTotal(currency: string): CurrencyTotal {
  return { currency, cents: 0, count: 0 };
}

/**
 * Splits per-currency rows into "the one we report in" and "the rest".
 *
 * This is the function that enforces the Phase 5O rule across the whole of
 * Phase 7. Rows in other currencies are never added to the primary total and
 * never silently discarded — they come back in `others` so the UI can show
 * them, and their order count is repeated in `excludedCount` so a reader of the
 * headline figure can see how much sits outside it.
 */
export function segmentByCurrency(
  rows: readonly CurrencyTotal[],
  reportingCurrency: string,
): CurrencySegmentation {
  const primaryRows = rows.filter((row) => row.currency === reportingCurrency);
  const otherRows = rows.filter((row) => row.currency !== reportingCurrency);

  const primary: CurrencyTotal = primaryRows.reduce<CurrencyTotal>(
    (total, row) => ({
      currency: reportingCurrency,
      cents: total.cents + row.cents,
      count: total.count + row.count,
    }),
    emptyTotal(reportingCurrency),
  );

  const others = [...otherRows].sort((a, b) => b.cents - a.cents);

  return {
    reportingCurrency,
    primary,
    others,
    isMixed: others.length > 0,
    excludedCount: others.reduce((total, row) => total + row.count, 0),
  };
}

/**
 * Mean order value.
 *
 * Returns zero cents with a zero count rather than NaN when there are no
 * orders. "No orders yet" and "average of nothing" are the same state, and the
 * UI distinguishes them by reading `count`, not by inspecting the amount.
 */
export function averageValue(total: CurrencyTotal): CurrencyTotal {
  if (total.count <= 0) return emptyTotal(total.currency);
  return {
    currency: total.currency,
    cents: Math.round(total.cents / total.count),
    count: total.count,
  };
}

/** Integer-safe mean of a count over a population, to two decimal places. */
export function ratePerUnit(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

/**
 * One row's share of a total, as 0–1.
 *
 * Null when the total is zero — a share of nothing is undefined, not 0%, and
 * rendering it as 0% would make every row in an empty table look equally
 * insignificant rather than absent.
 */
export function share(part: number, total: number): number | null {
  if (total <= 0) return null;
  return part / total;
}

export function coverage(covered: number, total: number): Coverage {
  return { covered, total, ratio: total > 0 ? covered / total : null };
}

/** How close to zero a percentage change has to be to read as "unchanged". */
const FLAT_THRESHOLD_PERCENT = 0.05;

const NO_TREND = (reason: Trend["reason"]): Trend => ({
  direction: "none",
  percent: null,
  reason,
});

/**
 * Period-on-period change.
 *
 * Refuses to produce a figure in three cases, each of which a naive
 * implementation would render as a confident number:
 *
 *  - there is no previous period (an unbounded range, or the very first one),
 *  - the previous period was zero, where every increase is "infinity percent"
 *    and the honest statement is "first activity in this period",
 *  - the two periods are denominated in different currencies, where the
 *    subtraction is not defined at all.
 *
 * A dashboard arrow is a claim about the business. It should only appear when
 * the arithmetic behind it holds.
 */
export function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) return NO_TREND("no_comparison");
  if (previous === 0) return NO_TREND("zero_base");

  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  if (Math.abs(percent) < FLAT_THRESHOLD_PERCENT) {
    return { direction: "flat", percent: 0, reason: null };
  }
  return { direction: percent > 0 ? "up" : "down", percent, reason: null };
}

/** As `computeTrend`, but refuses to compare amounts in different currencies. */
export function computeMoneyTrend(
  current: CurrencyTotal,
  previous: CurrencyTotal | null,
): Trend {
  if (previous === null) return NO_TREND("no_comparison");
  if (previous.currency !== current.currency) return NO_TREND("currency_mismatch");
  return computeTrend(current.cents, previous.cents);
}

export const TREND_UNAVAILABLE_LABEL: Record<
  NonNullable<Trend["reason"]>,
  string
> = {
  no_comparison: "No comparable period",
  zero_base: "First activity in this period",
  currency_mismatch: "Different currency last period",
  unbounded_range: "Not comparable over all time",
};

/** "+12.4%" / "−8.0%" / "No change". Uses a true minus sign, not a hyphen. */
export function formatTrend(trend: Trend): string {
  if (trend.direction === "none" || trend.percent === null) {
    return trend.reason ? TREND_UNAVAILABLE_LABEL[trend.reason] : "—";
  }
  if (trend.direction === "flat") return "No change";
  const sign = trend.percent > 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(trend.percent).toFixed(1)}%`;
}

/** "9 of 369 pieces (2%)", or a plain count when the population is empty. */
export function formatCoverage(value: Coverage, noun: string): string {
  if (value.total === 0) return `No ${noun} recorded`;
  const percent = Math.round((value.ratio ?? 0) * 100);
  return `${value.covered} of ${value.total} ${noun} (${percent}%)`;
}

export function formatShare(value: number | null): string {
  if (value === null) return "—";
  const percent = value * 100;
  // Below 0.1% a rounded figure reads as 0% and looks like an error; say so.
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${percent.toFixed(1)}%`;
}

/**
 * Ranks rows by amount and attaches each one's share of the total.
 *
 * The total is passed in rather than derived from `rows`, because a top-ten
 * table's shares must be percentages of ALL revenue, not of the ten rows shown.
 * Deriving it locally is the bug that makes a top-ten list add up to 100%.
 */
export function rankByCents<Row extends { cents: number }>(
  rows: readonly Row[],
  totalCents: number,
  limit: number,
): (Row & { share: number | null })[] {
  return [...rows]
    .sort((a, b) => b.cents - a.cents)
    .slice(0, Math.max(0, limit))
    .map((row) => ({ ...row, share: share(row.cents, totalCents) }));
}

/** Sums a series' points. Single-currency by construction — see `Series`. */
export function sumSeries(points: readonly { cents: number; count: number }[]): {
  cents: number;
  count: number;
} {
  return points.reduce(
    (total, point) => ({
      cents: total.cents + point.cents,
      count: total.count + point.count,
    }),
    { cents: 0, count: 0 },
  );
}

/** Largest point in a series, used to scale a bar chart. Never returns 0. */
export function seriesPeak(points: readonly { cents: number }[]): number {
  return points.reduce((peak, point) => Math.max(peak, point.cents), 0) || 1;
}

/** Largest count in a series, used to scale a bar chart. Never returns 0. */
export function seriesCountPeak(points: readonly { count: number }[]): number {
  return points.reduce((peak, point) => Math.max(peak, point.count), 0) || 1;
}
