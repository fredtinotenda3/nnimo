import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE_PRESET,
  DEFAULT_TIME_ZONE,
  MAX_CUSTOM_RANGE_DAYS,
  MAX_DAY_BUCKETS,
  addDays,
  addMonths,
  alignSeries,
  buildBuckets,
  civilDateInZone,
  daysInMonth,
  formatCivilDate,
  granularityFor,
  isValidTimeZone,
  normaliseTimeZone,
  parseCivilDate,
  previousRange,
  resolveRange,
  zonedTimeToUtc,
} from "@/lib/analytics/range";

/**
 * Date-range arithmetic.
 *
 * The single most valuable assertion in this file is the one about 22:30 UTC:
 * that instant is already the next day in Bulawayo, and a range resolver that
 * quietly used UTC would put an order placed then on the wrong day of the
 * chart. Everything else here exists to keep that behaviour honest at the
 * edges — month lengths, reversed inputs, a zone that observes DST.
 */

const HARARE = "Africa/Harare"; // UTC+2, no daylight saving
const LONDON = "Europe/London"; // GMT/BST, so the offset arithmetic is exercised

/** Midday in Harare on 16 August 2026. */
const NOON = new Date("2026-08-16T10:00:00Z");

describe("timezone resolution", () => {
  it("accepts a real IANA zone", () => {
    expect(isValidTimeZone(HARARE)).toBe(true);
  });

  it("rejects a plausible-looking zone that does not exist", () => {
    // The point of checking against the runtime rather than a regex: this has
    // exactly the right shape.
    expect(isValidTimeZone("Africa/Bulawayo")).toBe(false);
  });

  it("falls back to the studio default rather than throwing on a bad setting", () => {
    expect(normaliseTimeZone("not/a/zone")).toBe(DEFAULT_TIME_ZONE);
    expect(normaliseTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(normaliseTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
  });

  it("keeps a valid configured zone", () => {
    expect(normaliseTimeZone(" Europe/London ")).toBe(LONDON);
  });
});

describe("civil date conversion", () => {
  it("resolves local midnight to the correct UTC instant", () => {
    // Midnight in Harare is 22:00 the previous day in UTC.
    expect(zonedTimeToUtc({ year: 2026, month: 8, day: 16 }, HARARE).toISOString()).toBe(
      "2026-08-15T22:00:00.000Z",
    );
  });

  it("puts a late-evening UTC instant on the NEXT day in Harare", () => {
    // 22:30 UTC on the 15th is 00:30 on the 16th in Bulawayo. A UTC-based
    // implementation reports the 15th, and every daily figure is then wrong for
    // orders placed in the studio's small hours.
    const instant = new Date("2026-08-15T22:30:00Z");
    expect(civilDateInZone(instant, HARARE)).toEqual({ year: 2026, month: 8, day: 16 });
    expect(civilDateInZone(instant, "UTC")).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it("handles a zone that observes daylight saving", () => {
    // BST begins at 01:00 GMT on 29 March 2026, so that local day is 23 hours
    // long: midnight on the 29th is 00:00Z, midnight on the 30th is 23:00Z.
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29 }, LONDON).toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 30 }, LONDON).toISOString()).toBe(
      "2026-03-29T23:00:00.000Z",
    );
  });
});

describe("calendar arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addDays({ year: 2026, month: 8, day: 30 }, 3)).toEqual({
      year: 2026,
      month: 9,
      day: 2,
    });
  });

  it("clamps to the last valid day when adding months", () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it("knows February in a leap year", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("rejects a date that does not exist", () => {
    // Date.UTC would roll this forward to 2 March rather than failing, which is
    // why a shape-only regex is not enough.
    expect(parseCivilDate("2026-02-30")).toBeNull();
    expect(parseCivilDate("2026-13-01")).toBeNull();
    expect(parseCivilDate("16/08/2026")).toBeNull();
    expect(parseCivilDate(null)).toBeNull();
  });

  it("round-trips a valid date", () => {
    const parsed = parseCivilDate("2026-08-16");
    expect(parsed).toEqual({ year: 2026, month: 8, day: 16 });
    expect(formatCivilDate(parsed!)).toBe("2026-08-16");
  });
});

describe("range presets", () => {
  it("resolves today as a half-open day in the studio's zone", () => {
    const range = resolveRange({ preset: "today", timeZone: HARARE, now: NOON });
    expect(range.start?.toISOString()).toBe("2026-08-15T22:00:00.000Z");
    expect(range.end?.toISOString()).toBe("2026-08-16T22:00:00.000Z");
    expect(range.days).toBe(1);
  });

  it("includes today in the last seven days", () => {
    const range = resolveRange({ preset: "last_7", timeZone: HARARE, now: NOON });
    expect(range.from).toEqual({ year: 2026, month: 8, day: 10 });
    expect(range.to).toEqual({ year: 2026, month: 8, day: 16 });
    expect(range.days).toBe(7);
  });

  it("resolves last 30 days", () => {
    const range = resolveRange({ preset: "last_30", timeZone: HARARE, now: NOON });
    expect(range.from).toEqual({ year: 2026, month: 7, day: 18 });
    expect(range.days).toBe(30);
  });

  it("resolves this month to whole calendar month", () => {
    const range = resolveRange({ preset: "this_month", timeZone: HARARE, now: NOON });
    expect(range.from).toEqual({ year: 2026, month: 8, day: 1 });
    expect(range.to).toEqual({ year: 2026, month: 8, day: 31 });
  });

  it("resolves the previous month", () => {
    const range = resolveRange({ preset: "previous_month", timeZone: HARARE, now: NOON });
    expect(range.from).toEqual({ year: 2026, month: 7, day: 1 });
    expect(range.to).toEqual({ year: 2026, month: 7, day: 31 });
  });

  it("leaves all time genuinely unbounded rather than very wide", () => {
    const range = resolveRange({ preset: "all_time", timeZone: HARARE, now: NOON });
    expect(range.start).toBeNull();
    expect(range.end).toBeNull();
    expect(range.days).toBeNull();
  });

  it("uses a 23-hour day for 'today' when the zone enters daylight saving", () => {
    const range = resolveRange({
      preset: "today",
      timeZone: LONDON,
      now: new Date("2026-03-29T12:00:00Z"),
    });
    const hours = (range.end!.getTime() - range.start!.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("degrades an unrecognised preset to the default rather than throwing", () => {
    const range = resolveRange({ preset: "last_decade", timeZone: HARARE, now: NOON });
    expect(range.preset).toBe(DEFAULT_RANGE_PRESET);
  });

  it("degrades a half-filled custom range to the default", () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-08-01",
      to: null,
      timeZone: HARARE,
      now: NOON,
    });
    expect(range.preset).toBe(DEFAULT_RANGE_PRESET);
  });

  it("swaps reversed custom dates instead of returning nothing", () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-08-16",
      to: "2026-08-10",
      timeZone: HARARE,
      now: NOON,
    });
    expect(range.from).toEqual({ year: 2026, month: 8, day: 10 });
    expect(range.to).toEqual({ year: 2026, month: 8, day: 16 });
    expect(range.days).toBe(7);
  });

  it("clamps an absurdly wide custom range", () => {
    const range = resolveRange({
      preset: "custom",
      from: "2020-01-01",
      to: "2030-01-01",
      timeZone: HARARE,
      now: NOON,
    });
    expect(range.days).toBe(MAX_CUSTOM_RANGE_DAYS);
  });
});

describe("comparison periods", () => {
  it("compares a rolling window against the window immediately before it", () => {
    const range = resolveRange({ preset: "last_7", timeZone: HARARE, now: NOON });
    const previous = previousRange(range)!;
    expect(previous.from).toEqual({ year: 2026, month: 8, day: 3 });
    expect(previous.to).toEqual({ year: 2026, month: 8, day: 9 });
    expect(previous.days).toBe(range.days);
  });

  it("compares a calendar month against the previous calendar month, not 31 days", () => {
    // July has 31 days and June has 30. A same-length comparison would straddle
    // May, which is a window nobody would recognise.
    const range = resolveRange({ preset: "previous_month", timeZone: HARARE, now: NOON });
    const previous = previousRange(range)!;
    expect(previous.from).toEqual({ year: 2026, month: 6, day: 1 });
    expect(previous.to).toEqual({ year: 2026, month: 6, day: 30 });
    expect(previous.days).toBe(30);
  });

  it("has nothing to compare all time against", () => {
    const range = resolveRange({ preset: "all_time", timeZone: HARARE, now: NOON });
    expect(previousRange(range)).toBeNull();
  });
});

describe("bucket granularity", () => {
  it("uses days up to the daily ceiling and months beyond it", () => {
    expect(granularityFor(1)).toBe("day");
    expect(granularityFor(MAX_DAY_BUCKETS)).toBe("day");
    expect(granularityFor(MAX_DAY_BUCKETS + 1)).toBe("month");
  });

  it("uses months for an unbounded range", () => {
    expect(granularityFor(null)).toBe("month");
  });

  it("emits one bucket per day, including days with no activity", () => {
    const range = resolveRange({ preset: "last_7", timeZone: HARARE, now: NOON });
    const buckets = buildBuckets(range, "day");
    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.key).toBe("2026-08-10");
    expect(buckets[6]?.key).toBe("2026-08-16");
    expect(buckets[0]?.label).toBe("10 Aug");
  });

  it("emits one bucket per calendar month, keyed to match the SQL", () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-01-15",
      to: "2026-04-02",
      timeZone: HARARE,
      now: NOON,
    });
    const buckets = buildBuckets(range, "month");
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(buckets[0]?.label).toBe("Jan 2026");
  });

  it("emits no buckets for an unbounded range, which the series flags as ungapped", () => {
    const range = resolveRange({ preset: "all_time", timeZone: HARARE, now: NOON });
    expect(buildBuckets(range, "month")).toEqual([]);
  });
});

describe("series alignment", () => {
  const range = resolveRange({
    preset: "custom",
    from: "2026-08-10",
    to: "2026-08-12",
    timeZone: HARARE,
    now: NOON,
  });
  const buckets = buildBuckets(range, "day");

  it("fills gaps with zero so an empty day is visible as an empty day", () => {
    const points = alignSeries(buckets, [{ bucket: "2026-08-11", count: 4 }], (bucket, row) => ({
      key: bucket.key,
      count: row?.count ?? 0,
    }));
    expect(points).toEqual([
      { key: "2026-08-10", count: 0 },
      { key: "2026-08-11", count: 4 },
      { key: "2026-08-12", count: 0 },
    ]);
  });

  it("drops rows outside the bucket list rather than growing the axis", () => {
    // A row that matches no bucket can only mean the SQL and the range
    // disagreed about granularity or timezone. Silently extending the chart
    // would hide that bug.
    const points = alignSeries(buckets, [{ bucket: "2026-09-01", count: 99 }], (bucket, row) => ({
      key: bucket.key,
      count: row?.count ?? 0,
    }));
    expect(points).toHaveLength(3);
    expect(points.every((point) => point.count === 0)).toBe(true);
  });
});
