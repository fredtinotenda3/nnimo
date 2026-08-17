import { describe, expect, it } from "vitest";
import {
  parseCurrency,
  parseFilters,
  parseRangePreset,
  rangeQuery,
} from "@/lib/analytics/params";

/**
 * Search-parameter parsing.
 *
 * The URL is user input on its way to a query. Nothing here trusts it: presets
 * are checked against a known set and currencies against the codes that
 * actually appear in settled orders, so a stale bookmark or a hand-edited URL
 * degrades to a sensible default instead of a 500 or a page of confident
 * zeroes.
 */

const HARARE = "Africa/Harare";
const NOON = new Date("2026-08-16T10:00:00Z");

const options = (available: string[] = ["USD"]) => ({
  timeZone: HARARE,
  reportingCurrency: "USD",
  availableCurrencies: available,
  now: NOON,
});

describe("preset parsing", () => {
  it("accepts a known preset", () => {
    expect(parseRangePreset({ range: "last_7" })).toBe("last_7");
  });

  it("falls back to the default for an unknown preset", () => {
    expect(parseRangePreset({ range: "since_forever" })).toBe("last_30");
  });

  it("falls back when the parameter is absent", () => {
    expect(parseRangePreset({})).toBe("last_30");
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseRangePreset({ range: ["today", "all_time"] })).toBe("today");
  });
});

describe("currency parsing", () => {
  it("accepts a currency that appears in the data, case-insensitively", () => {
    expect(parseCurrency({ currency: "zwg" }, ["USD", "ZWG"], "USD")).toBe("ZWG");
  });

  it("rejects a currency no order was ever placed in", () => {
    // Offering EUR when nothing was sold in euros produces a page of confident
    // zeroes, which reads as a bug rather than as an empty result.
    expect(parseCurrency({ currency: "EUR" }, ["USD", "ZWG"], "USD")).toBe("USD");
  });

  it("rejects a malformed code", () => {
    expect(parseCurrency({ currency: "US" }, ["USD"], "USD")).toBe("USD");
    expect(parseCurrency({ currency: "<script>" }, ["USD"], "USD")).toBe("USD");
  });

  it("falls back to the reporting currency when absent", () => {
    expect(parseCurrency({}, ["USD", "ZWG"], "USD")).toBe("USD");
  });
});

describe("combined filters", () => {
  it("resolves the range in the studio's timezone, not UTC", () => {
    const filters = parseFilters({ range: "today" }, options());
    expect(filters.range.timeZone).toBe(HARARE);
    expect(filters.range.start?.toISOString()).toBe("2026-08-15T22:00:00.000Z");
  });

  it("carries a valid custom range through", () => {
    const filters = parseFilters(
      { range: "custom", from: "2026-08-01", to: "2026-08-07" },
      options(),
    );
    expect(filters.range.preset).toBe("custom");
    expect(filters.range.days).toBe(7);
  });

  it("degrades an invalid custom range without throwing", () => {
    const filters = parseFilters({ range: "custom", from: "nonsense" }, options());
    expect(filters.range.preset).toBe("last_30");
  });

  it("records the reporting currency alongside the selected one", () => {
    const filters = parseFilters({ currency: "ZWG" }, options(["USD", "ZWG"]));
    expect(filters.currency).toBe("ZWG");
    expect(filters.reportingCurrency).toBe("USD");
  });
});

describe("query string round-trip", () => {
  it("emits nothing for the default view, keeping URLs clean", () => {
    expect(rangeQuery(parseFilters({}, options()))).toBe("");
  });

  it("carries a non-default preset", () => {
    expect(rangeQuery(parseFilters({ range: "today" }, options()))).toBe("?range=today");
  });

  it("carries both dates for a custom range", () => {
    const query = rangeQuery(
      parseFilters({ range: "custom", from: "2026-08-01", to: "2026-08-07" }, options()),
    );
    expect(query).toContain("range=custom");
    expect(query).toContain("from=2026-08-01");
    expect(query).toContain("to=2026-08-07");
  });

  it("carries a currency only when it differs from the reporting currency", () => {
    expect(rangeQuery(parseFilters({ currency: "ZWG" }, options(["USD", "ZWG"])))).toBe(
      "?currency=ZWG",
    );
    expect(rangeQuery(parseFilters({ currency: "USD" }, options(["USD", "ZWG"])))).toBe("");
  });

  it("survives a full round-trip, so switching section keeps the period", () => {
    const first = parseFilters({ range: "previous_month", currency: "ZWG" }, options(["USD", "ZWG"]));
    const query = new URLSearchParams(rangeQuery(first).replace(/^\?/, ""));
    const second = parseFilters(Object.fromEntries(query), options(["USD", "ZWG"]));
    expect(second.range.preset).toBe(first.range.preset);
    expect(second.range.start?.toISOString()).toBe(first.range.start?.toISOString());
    expect(second.currency).toBe(first.currency);
  });
});
