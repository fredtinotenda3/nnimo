/**
 * Money handling.
 *
 * Prices are `Decimal(10,2)` in Postgres and arrive as Prisma Decimal objects.
 * They are never converted to a JS number for arithmetic — 0.1 + 0.2 problems
 * on an order total are not acceptable — only for display, at the last moment.
 *
 * A null price means "the business has not set this yet", which is a real state
 * for most of the imported catalogue. It must never render as $0.00 or be
 * treated as free.
 */
import { Prisma } from "@/lib/generated/prisma/client";

export type DecimalLike = { toFixed(dp: number): string; toString(): string };

// ---------------------------------------------------------------------------
// Decimal-safe arithmetic
//
// Everything below this line is for computing totals (cart, checkout, order
// creation) — as opposed to the formatters above, which only ever render a
// value that has already been computed. `Prisma.Decimal` is decimal.js under
// the Prisma Client's hood, so this is the same decimal type Postgres'
// NUMERIC(10,2) columns round-trip as; using it end to end means a cart total
// is never touched by a JS float, only ever by exact decimal arithmetic and a
// single explicit round at the point money is quoted or stored.
// ---------------------------------------------------------------------------
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Coerces a Prisma Decimal / string / number into a Decimal, once. */
export function toDecimal(value: Decimal | DecimalLike | string | number): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

/** unitPrice × quantity, rounded to 2dp using banker's-neutral half-up. */
export function lineTotal(unitPrice: Decimal | DecimalLike | string | number, quantity: number): Decimal {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive integer, received ${quantity}.`);
  }
  return toDecimal(unitPrice).times(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Sums a list of decimal-like amounts without ever passing through a JS number. */
export function sumDecimals(values: (Decimal | DecimalLike | string | number)[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}

export function decimalsEqual(
  a: Decimal | DecimalLike | string | number,
  b: Decimal | DecimalLike | string | number,
): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

export function formatPrice(
  amount: DecimalLike | null | undefined,
  currency = "USD",
): string | null {
  if (amount === null || amount === undefined) return null;
  const value = Number(amount.toString());
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-ZW", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

/** What to show where a price has not been established yet. */
export const PRICE_ON_REQUEST = "Price on request";

export function formatPriceOrRequest(
  amount: DecimalLike | null | undefined,
  currency = "USD",
): string {
  return formatPrice(amount, currency) ?? PRICE_ON_REQUEST;
}

export function formatDimensions(
  heightCm: DecimalLike | null | undefined,
  widthCm: DecimalLike | null | undefined,
): string | null {
  const parts: string[] = [];
  if (heightCm) parts.push(`H ${trimZeros(heightCm)} cm`);
  if (widthCm) parts.push(`W ${trimZeros(widthCm)} cm`);
  return parts.length > 0 ? parts.join(" × ") : null;
}

export function formatWeight(weightKg: DecimalLike | null | undefined): string | null {
  return weightKg ? `${trimZeros(weightKg)} kg` : null;
}

function trimZeros(value: DecimalLike): string {
  return value.toString().replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}