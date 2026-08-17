/**
 * Date ranges and time buckets, in the studio's timezone.
 *
 * WHY THIS FILE HAS NO DATABASE IMPORT
 *
 * Everything here is pure. `tests/stubs/db.ts` makes any module that imports
 * `@/lib/db` unusable from a unit test, so the arithmetic that decides what
 * "last 30 days" means lives on this side of the line and is tested directly.
 * The query layer (lib/analytics/*.ts, which does import the database) only ever
 * receives already-resolved instants.
 *
 * WHY TIMEZONE IS NOT OPTIONAL
 *
 * `Order.createdAt` and `Order.paidAt` are `timestamptz`. Truncating them to a
 * day under a UTC session — which is what a Vercel function does — puts every
 * order placed between 00:00 and 02:00 in Bulawayo into the previous day. On a
 * studio that takes a handful of orders a week, one misplaced order visibly
 * moves the chart. So every boundary and every bucket is computed against an
 * IANA zone, resolved from the `business.timezone` setting rather than
 * hard-coded, per the project rule that business configuration is editable.
 *
 * The zone is applied twice and must agree both times: here, to compute the
 * half-open [start, end) instants that bound the query, and in Postgres, via
 * `AT TIME ZONE`, to bucket rows inside it.
 */

/** Where the studio is. A default, not a constant — the setting overrides it. */
export const DEFAULT_TIME_ZONE = "Africa/Harare";

/** Custom ranges are capped so a hand-edited URL cannot request a decade. */
export const MAX_CUSTOM_RANGE_DAYS = 1827; // five years

/** Above this, day buckets are escalated to months. See `granularityFor`. */
export const MAX_DAY_BUCKETS = 62;

/** Hard ceiling on rendered points, whatever the granularity. */
export const MAX_BUCKETS = 366;

const MS_PER_DAY = 86_400_000;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// ---------------------------------------------------------------------------
// Timezone primitives
// ---------------------------------------------------------------------------

/**
 * A wall-clock date with no zone attached — "16 August 2026" as the studio
 * would say it, independent of what instant that is in UTC.
 */
export type CivilDate = { year: number; month: number; day: number };

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    // h23 rather than hour12:false — some ICU builds render midnight as hour 24
    // under hour12:false, which silently shifts every day boundary by a day.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  FORMATTERS.set(timeZone, created);
  return created;
}

/**
 * Whether the runtime recognises this IANA zone.
 *
 * Node is built with full ICU, so this is a real check rather than a regex on
 * the string shape — "Africa/Bulawayo" looks plausible and does not exist.
 */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a stored setting value to a usable zone.
 *
 * Falls back rather than throwing: a typo in the settings table must not take
 * the whole admin down, and a wrong-by-two-hours chart is recoverable where a
 * 500 on every analytics page is not.
 */
export function normaliseTimeZone(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_TIME_ZONE;
  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

type ZonedParts = CivilDate & { hour: number; minute: number; second: number };

function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number.parseInt(part.value, 10) : 0;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - instant.getTime();
}

/**
 * A wall-clock time in a zone, as a UTC instant.
 *
 * Two passes, because the offset itself depends on the instant we are trying to
 * find. The first guess assumes the offset at the naive-UTC interpretation; the
 * second re-reads the offset at the corrected instant and only trusts it if the
 * two agree. Harare has no DST so one pass would do — but writing it that way
 * would make the function quietly wrong for any studio that later configures a
 * zone that does, and it is the same six lines either way.
 */
export function zonedTimeToUtc(
  civil: CivilDate,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(civil.year, civil.month - 1, civil.day, hour, minute, second);
  const firstOffset = offsetMsAt(new Date(naive), timeZone);
  const firstGuess = naive - firstOffset;
  const secondOffset = offsetMsAt(new Date(firstGuess), timeZone);
  if (secondOffset === firstOffset) return new Date(firstGuess);
  return new Date(naive - secondOffset);
}

/** The civil date an instant falls on, in the given zone. */
export function civilDateInZone(instant: Date, timeZone: string): CivilDate {
  const parts = partsInZone(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Midnight, in the given zone, on the day the instant falls in. */
export function startOfDayInZone(instant: Date, timeZone: string): Date {
  return zonedTimeToUtc(civilDateInZone(instant, timeZone), timeZone);
}

export function addDays(civil: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(civil.year, civil.month - 1, civil.day) + days * MS_PER_DAY);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Calendar month arithmetic, clamping to the last valid day (31 Jan → 28 Feb). */
export function addMonths(civil: CivilDate, months: number): CivilDate {
  const total = civil.year * 12 + (civil.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = daysInMonth(year, month);
  return { year, month, day: Math.min(civil.day, lastDay) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD`, the form used in URLs, `<input type="date">` and bucket keys. */
export function formatCivilDate(civil: CivilDate): string {
  return (
    `${String(civil.year).padStart(4, "0")}-` +
    `${String(civil.month).padStart(2, "0")}-` +
    `${String(civil.day).padStart(2, "0")}`
  );
}

/**
 * Parses `YYYY-MM-DD`, rejecting dates that do not exist.
 *
 * The round-trip check is what catches `2026-02-30`: `Date.UTC` rolls it
 * forward to 2 March rather than failing, so a shape-only regex would accept a
 * range boundary two days from where the operator meant it.
 */
export function parseCivilDate(value: string | null | undefined): CivilDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  if (year < 2000 || year > 2999 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function compareCivil(a: CivilDate, b: CivilDate): number {
  return (
    Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)
  );
}

function civilDaysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
      MS_PER_DAY,
  );
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = [
  "today",
  "last_7",
  "last_30",
  "this_month",
  "previous_month",
  "all_time",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const DEFAULT_RANGE_PRESET: RangePreset = "last_30";

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  today: "Today",
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  this_month: "This month",
  previous_month: "Previous month",
  all_time: "All time",
  custom: "Custom range",
};

/**
 * A resolved range.
 *
 * `start` is inclusive and `end` is exclusive — half-open, so consecutive
 * ranges tile without double-counting the order placed at exactly midnight.
 * Both are null for `all_time`, which means "no date predicate at all" rather
 * than a very large window.
 */
export type ResolvedRange = {
  preset: RangePreset;
  timeZone: string;
  start: Date | null;
  end: Date | null;
  /** First day of the range, in the studio's zone. Null for all time. */
  from: CivilDate | null;
  /** Last day INCLUSIVE, for display and for `<input type="date">`. */
  to: CivilDate | null;
  /** Whole days covered. Null for all time. */
  days: number | null;
  label: string;
};

export type RangeInput = {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  timeZone?: string;
  /** Injectable so tests are not clock-dependent. */
  now?: Date;
};

function bounded(
  preset: RangePreset,
  from: CivilDate,
  toInclusive: CivilDate,
  timeZone: string,
): ResolvedRange {
  const start = zonedTimeToUtc(from, timeZone);
  const end = zonedTimeToUtc(addDays(toInclusive, 1), timeZone);
  return {
    preset,
    timeZone,
    start,
    end,
    from,
    to: toInclusive,
    days: civilDaysBetween(from, toInclusive) + 1,
    label:
      preset === "custom"
        ? `${formatCivilDate(from)} to ${formatCivilDate(toInclusive)}`
        : RANGE_PRESET_LABEL[preset],
  };
}

/**
 * Resolves search-parameter input into instants.
 *
 * Anything unrecognised degrades to the default range rather than throwing — a
 * stale bookmark or a hand-edited URL should show last 30 days, not a 500. The
 * returned `preset` reflects what was actually applied, so the UI can render
 * the picker in agreement with the data below it.
 */
export function resolveRange(input: RangeInput = {}): ResolvedRange {
  const timeZone = normaliseTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const today = civilDateInZone(now, timeZone);

  const requested = (RANGE_PRESETS as readonly string[]).includes(input.preset ?? "")
    ? (input.preset as RangePreset)
    : DEFAULT_RANGE_PRESET;

  switch (requested) {
    case "today":
      return bounded("today", today, today, timeZone);

    case "last_7":
      return bounded("last_7", addDays(today, -6), today, timeZone);

    case "this_month": {
      const first = { year: today.year, month: today.month, day: 1 };
      const last = { ...first, day: daysInMonth(first.year, first.month) };
      return bounded("this_month", first, last, timeZone);
    }

    case "previous_month": {
      const first = addMonths({ year: today.year, month: today.month, day: 1 }, -1);
      const last = { ...first, day: daysInMonth(first.year, first.month) };
      return bounded("previous_month", first, last, timeZone);
    }

    case "all_time":
      return {
        preset: "all_time",
        timeZone,
        start: null,
        end: null,
        from: null,
        to: null,
        days: null,
        label: RANGE_PRESET_LABEL.all_time,
      };

    case "custom": {
      const parsedFrom = parseCivilDate(input.from);
      const parsedTo = parseCivilDate(input.to);
      // A half-filled custom range is not an error the operator needs shouting
      // about; it is a form they have not finished. Fall back quietly.
      if (!parsedFrom || !parsedTo) {
        return resolveRange({ ...input, preset: DEFAULT_RANGE_PRESET });
      }
      // Reversed dates are a slip, not an empty result set.
      const [first, second] =
        compareCivil(parsedFrom, parsedTo) <= 0 ? [parsedFrom, parsedTo] : [parsedTo, parsedFrom];
      const span = civilDaysBetween(first, second) + 1;
      const clamped =
        span > MAX_CUSTOM_RANGE_DAYS ? addDays(first, MAX_CUSTOM_RANGE_DAYS - 1) : second;
      return bounded("custom", first, clamped, timeZone);
    }

    case "last_30":
    default:
      return bounded("last_30", addDays(today, -29), today, timeZone);
  }
}

/**
 * The period immediately before this one, for trend comparison.
 *
 * Same *shape*, not merely same length: the period before "this month" is the
 * previous calendar month, not the previous 31 days. Comparing February against
 * "the 28 days before it" would silently straddle January, and a trend that
 * compares against a window nobody recognises is worse than no trend.
 *
 * Null for `all_time`, which has nothing before it.
 */
export function previousRange(range: ResolvedRange): ResolvedRange | null {
  if (!range.from || !range.to || range.days === null) return null;

  if (range.preset === "this_month" || range.preset === "previous_month") {
    const first = addMonths({ year: range.from.year, month: range.from.month, day: 1 }, -1);
    const last = { ...first, day: daysInMonth(first.year, first.month) };
    return bounded("custom", first, last, range.timeZone);
  }

  const previousTo = addDays(range.from, -1);
  const previousFrom = addDays(previousTo, -(range.days - 1));
  return bounded("custom", previousFrom, previousTo, range.timeZone);
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export type Granularity = "day" | "month";

/**
 * Day buckets up to two months, months beyond that.
 *
 * 365 daily points on a 900px-wide admin panel is a texture, not a chart, and
 * it is 365 rows over the wire for a studio doing a handful of orders a week.
 */
export function granularityFor(days: number | null): Granularity {
  if (days === null) return "month";
  return days <= MAX_DAY_BUCKETS ? "day" : "month";
}

export type Bucket = {
  /** `YYYY-MM-DD` for days, `YYYY-MM` for months. Matches the SQL `to_char`. */
  key: string;
  label: string;
  start: Date;
};

/** The `to_char` pattern Postgres must use so its keys match `Bucket.key`. */
export const BUCKET_KEY_FORMAT: Record<Granularity, string> = {
  day: "YYYY-MM-DD",
  month: "YYYY-MM",
};

/** The `date_trunc` unit matching each granularity. */
export const BUCKET_TRUNC_UNIT: Record<Granularity, string> = {
  day: "day",
  month: "month",
};

function monthKey(civil: CivilDate): string {
  return `${String(civil.year).padStart(4, "0")}-${String(civil.month).padStart(2, "0")}`;
}

function monthLabel(civil: CivilDate): string {
  return `${MONTH_LABELS[civil.month - 1] ?? ""} ${civil.year}`;
}

function dayLabel(civil: CivilDate): string {
  return `${civil.day} ${MONTH_LABELS[civil.month - 1] ?? ""}`;
}

/**
 * Every bucket the range covers, including the empty ones.
 *
 * Generated from the range rather than from the returned rows, because a day
 * with no orders is information: a line that skips from Monday to Thursday
 * reads as three days of steady trade. Returns an empty array for `all_time`,
 * where there is no start to enumerate from — that series is drawn from
 * whatever rows exist and is documented as ungapped.
 */
export function buildBuckets(range: ResolvedRange, granularity: Granularity): Bucket[] {
  if (!range.from || !range.to) return [];

  const buckets: Bucket[] = [];

  if (granularity === "day") {
    let cursor = range.from;
    while (compareCivil(cursor, range.to) <= 0 && buckets.length < MAX_BUCKETS) {
      buckets.push({
        key: formatCivilDate(cursor),
        label: dayLabel(cursor),
        start: zonedTimeToUtc(cursor, range.timeZone),
      });
      cursor = addDays(cursor, 1);
    }
    return buckets;
  }

  let cursor: CivilDate = { year: range.from.year, month: range.from.month, day: 1 };
  const lastMonth: CivilDate = { year: range.to.year, month: range.to.month, day: 1 };
  while (compareCivil(cursor, lastMonth) <= 0 && buckets.length < MAX_BUCKETS) {
    buckets.push({
      key: monthKey(cursor),
      label: monthLabel(cursor),
      start: zonedTimeToUtc(cursor, range.timeZone),
    });
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}

/**
 * Joins database rows onto the bucket list, filling gaps with a zero value.
 *
 * Rows whose key falls outside the bucket list are dropped rather than
 * appended: they can only arise from a granularity/timezone mismatch between
 * this file and the SQL, and silently growing the axis would hide that bug.
 */
export function alignSeries<Row extends { bucket: string }, Point>(
  buckets: Bucket[],
  rows: Row[],
  toPoint: (bucket: Bucket, row: Row | undefined) => Point,
): Point[] {
  const byKey = new Map<string, Row>();
  for (const row of rows) byKey.set(row.bucket, row);
  return buckets.map((bucket) => toPoint(bucket, byKey.get(bucket.key)));
}
