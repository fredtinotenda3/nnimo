/**
 * Search-parameter parsing for the analytics views.
 *
 * Same posture as lib/admin/query.ts, which this deliberately builds on rather
 * than reimplements: the URL is user input on its way to a query, so presets
 * are checked against a known set, currency codes against the set actually
 * present in the data, and dates are parsed as real calendar dates before they
 * become a `where` clause.
 *
 * Prisma parameterises values, so this is not an injection defence. It is a
 * correctness and cost defence — and, for the two values that reach raw SQL as
 * identifiers-in-spirit (the `date_trunc` unit and the `to_char` pattern), it is
 * why those never come from the URL at all: they are derived from the resolved
 * range's granularity, which is a closed two-value set decided in code.
 */

import { firstParam, type SearchParams } from "@/lib/admin/query";
import {
  DEFAULT_RANGE_PRESET,
  RANGE_PRESETS,
  resolveRange,
  type RangePreset,
  type ResolvedRange,
} from "@/lib/analytics/range";

export type AnalyticsFilters = {
  range: ResolvedRange;
  /** The currency monetary breakdowns are scoped to. */
  currency: string;
  /** The studio's configured currency, so the default can be omitted from URLs. */
  reportingCurrency: string;
};

/** A preset from the URL, or the default for anything unrecognised. */
export function parseRangePreset(params: SearchParams): RangePreset {
  const value = firstParam(params.range).trim();
  return (RANGE_PRESETS as readonly string[]).includes(value)
    ? (value as RangePreset)
    : DEFAULT_RANGE_PRESET;
}

/**
 * The currency to scope monetary breakdowns to.
 *
 * Validated against the currencies that actually appear in settled orders, not
 * against a global list: offering "EUR" when no order was ever placed in euros
 * would produce a page of confident zeroes. Falls back to the reporting
 * currency, which is always the first entry in `available`.
 */
export function parseCurrency(
  params: SearchParams,
  available: readonly string[],
  reportingCurrency: string,
): string {
  const value = firstParam(params.currency).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(value) && available.includes(value)) return value;
  return reportingCurrency;
}

export function parseFilters(
  params: SearchParams,
  options: {
    timeZone: string;
    reportingCurrency: string;
    availableCurrencies: readonly string[];
    now?: Date;
  },
): AnalyticsFilters {
  const range = resolveRange({
    preset: parseRangePreset(params),
    from: firstParam(params.from),
    to: firstParam(params.to),
    timeZone: options.timeZone,
    now: options.now,
  });

  return {
    range,
    currency: parseCurrency(params, options.availableCurrencies, options.reportingCurrency),
    reportingCurrency: options.reportingCurrency,
  };
}

/**
 * The query string carrying the current range and currency.
 *
 * Used by the section tabs so moving from Sales to Products keeps the period
 * the operator chose. Losing the range on every navigation is the fastest way
 * to make a date picker feel broken.
 */
export function rangeQuery(filters: AnalyticsFilters): string {
  const search = new URLSearchParams();
  if (filters.range.preset !== DEFAULT_RANGE_PRESET) {
    search.set("range", filters.range.preset);
  }
  if (filters.range.preset === "custom" && filters.range.from && filters.range.to) {
    search.set("from", isoDate(filters.range.from));
    search.set("to", isoDate(filters.range.to));
  }
  if (filters.currency && filters.currency !== filters.reportingCurrency) {
    search.set("currency", filters.currency);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function isoDate(civil: { year: number; month: number; day: number }): string {
  return (
    `${String(civil.year).padStart(4, "0")}-` +
    `${String(civil.month).padStart(2, "0")}-` +
    `${String(civil.day).padStart(2, "0")}`
  );
}
