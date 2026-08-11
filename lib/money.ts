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
export type DecimalLike = { toFixed(dp: number): string; toString(): string };

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
