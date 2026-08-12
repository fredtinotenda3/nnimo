/**
 * Money arithmetic in integer cents.
 *
 * Prisma hands back `Decimal` objects, and Decimal arithmetic is exact — but
 * every arithmetic path would then depend on the generated Prisma runtime, which
 * makes the money logic untestable without a database and easy to accidentally
 * coerce to `number` somewhere in the middle.
 *
 * So: parse once at the boundary into integer cents, do all arithmetic in
 * integers, and format once on the way out. Pure, exact, and testable.
 *
 * Deliberately not floats anywhere. `0.1 + 0.2` on an order total is not a
 * rounding curiosity, it is a wrong invoice.
 */

export type Cents = number;

/** Anything Decimal-like that Prisma or a test can hand us. */
export type MoneyInput = { toString(): string } | string | number | null | undefined;

export class MoneyParseError extends Error {}

/**
 * Parses a decimal money value into integer cents.
 *
 * Rejects anything that is not a plain decimal with at most two fraction
 * digits, because silently rounding 10.005 would mean the customer and the
 * database disagree about the price by a cent.
 */
export function toCents(value: MoneyInput): Cents | null {
  if (value === null || value === undefined) return null;

  const raw = typeof value === "string" ? value : value.toString();
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyParseError(
      `"${trimmed}" is not a money value with at most two decimal places.`,
    );
  }

  const [, sign, whole, fraction = ""] = match;
  const cents =
    Number.parseInt(whole ?? "0", 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);

  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError(`"${trimmed}" is too large to handle safely.`);
  }

  return sign === "-" ? -cents : cents;
}

/** Same as toCents but throws instead of returning null. For required values. */
export function requireCents(value: MoneyInput, label = "amount"): Cents {
  const cents = toCents(value);
  if (cents === null) throw new MoneyParseError(`Missing ${label}.`);
  return cents;
}

/** Cents back to the fixed-2 decimal string that Postgres NUMERIC expects. */
export function centsToDecimalString(cents: Cents): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function multiplyCents(unit: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyParseError(`Quantity must be a non-negative integer, got ${quantity}.`);
  }
  const total = unit * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new MoneyParseError("Line total is too large to handle safely.");
  }
  return total;
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((total, value) => {
    const next = total + value;
    if (!Number.isSafeInteger(next)) {
      throw new MoneyParseError("Sum is too large to handle safely.");
    }
    return next;
  }, 0);
}

/** Display formatting. Kept separate from arithmetic on purpose. */
export function formatCents(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-ZW", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
