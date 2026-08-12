import type { ProductAvailability, ProductLifecycleStage } from "@/lib/generated/prisma/enums";
import { toCents, type Cents } from "@/lib/commerce/money";

/**
 * The single rule for "can this be bought".
 *
 * Three independent conditions, all of which must hold. Split out as a pure
 * function so the storefront, the cart, the checkout revalidation and the tests
 * all consult exactly the same logic — the failure mode being a product that is
 * unbuyable on the product page but slips through checkout.
 *
 * The price rule is the important one for Nnino: only 9 of ~330 catalogue pieces
 * have a source-verified price. A piece without one stays in the catalogue and is
 * never purchasable — no placeholder price that could quietly become a real
 * charge.
 */
export type PurchasabilityInput = {
  lifecycleStage: ProductLifecycleStage;
  availability: ProductAvailability | null;
  price: { toString(): string } | string | null;
  /**
   * The product's stock row, for stock-backed availability only.
   *
   * `undefined` means "not loaded" (callers that only need the price/publish
   * rules); `null` means "this product genuinely has no stock record". The
   * distinction matters: a piece marked IN_STOCK with no stock record is a data
   * inconsistency, and the safe reading is that there is nothing to sell rather
   * than an unlimited supply.
   */
  inventory?: { onHand: number; reserved: number } | null;
};

export type PurchasabilityReason =
  | "PURCHASABLE"
  | "NOT_PUBLISHED"
  | "NO_VERIFIED_PRICE"
  | "OUT_OF_STOCK"
  | "COMMISSION_ONLY"
  | "COMING_SOON"
  | "NO_AVAILABILITY_SET"
  | "NO_STOCK_RECORD";

/** Quantity bounds. One-offs, so the ceiling is deliberately low. */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY_PER_LINE = 20;

/** Availability values that permit a sale. Made-to-order does — it is how Nnino works. */
const SELLABLE_AVAILABILITY: ProductAvailability[] = ["IN_STOCK", "LOW_STOCK", "MADE_TO_ORDER"];

export function evaluatePurchasability(product: PurchasabilityInput): {
  purchasable: boolean;
  reason: PurchasabilityReason;
  priceCents: Cents | null;
  /** Upper bound for this line. Undefined when supply is not stock-limited. */
  maxQuantity?: number;
} {
  const priceCents = toCents(product.price);

  if (product.lifecycleStage !== "PUBLISHED") {
    return { purchasable: false, reason: "NOT_PUBLISHED", priceCents };
  }

  // Checked before availability: an unpriced piece is not purchasable no matter
  // what its availability says.
  if (priceCents === null || priceCents <= 0) {
    return { purchasable: false, reason: "NO_VERIFIED_PRICE", priceCents: null };
  }

  if (product.availability === null) {
    return { purchasable: false, reason: "NO_AVAILABILITY_SET", priceCents };
  }
  if (product.availability === "OUT_OF_STOCK") {
    return { purchasable: false, reason: "OUT_OF_STOCK", priceCents };
  }
  if (product.availability === "CUSTOM_ONLY") {
    return { purchasable: false, reason: "COMMISSION_ONLY", priceCents };
  }
  if (product.availability === "COMING_SOON") {
    return { purchasable: false, reason: "COMING_SOON", priceCents };
  }
  if (!SELLABLE_AVAILABILITY.includes(product.availability)) {
    return { purchasable: false, reason: "NO_AVAILABILITY_SET", priceCents };
  }

  // Stock-backed availability is only as good as the stock record behind it.
  // MADE_TO_ORDER deliberately skips this: it is produced on demand, so there is
  // no stock to check and none is invented.
  if (product.availability === "IN_STOCK" || product.availability === "LOW_STOCK") {
    if (product.inventory === undefined) {
      // Caller did not load stock; price/publish rules pass, supply unknown.
      return { purchasable: true, reason: "PURCHASABLE", priceCents };
    }
    if (product.inventory === null) {
      return { purchasable: false, reason: "NO_STOCK_RECORD", priceCents };
    }
    const available = Math.max(
      0,
      product.inventory.onHand - product.inventory.reserved,
    );
    if (available <= 0) {
      return { purchasable: false, reason: "OUT_OF_STOCK", priceCents };
    }
    return {
      purchasable: true,
      reason: "PURCHASABLE",
      priceCents,
      maxQuantity: Math.min(available, MAX_QUANTITY_PER_LINE),
    };
  }

  return { purchasable: true, reason: "PURCHASABLE", priceCents };
}

export function isPurchasable(product: PurchasabilityInput): boolean {
  return evaluatePurchasability(product).purchasable;
}

/** Customer-facing explanation. Never mentions internal lifecycle vocabulary. */
export const PURCHASABILITY_MESSAGE: Record<PurchasabilityReason, string> = {
  PURCHASABLE: "Available to order",
  NOT_PUBLISHED: "This piece is not currently offered for sale.",
  NO_VERIFIED_PRICE:
    "The price for this piece has not been set yet. Ask the studio and they will confirm it for you.",
  OUT_OF_STOCK: "This piece is currently unavailable.",
  COMMISSION_ONLY: "This piece is made to commission. Enquire to have one made for you.",
  COMING_SOON: "Coming soon.",
  NO_AVAILABILITY_SET: "Availability for this piece has not been confirmed yet.",
  NO_STOCK_RECORD: "This piece is marked in stock but has no stock record yet. The studio will confirm availability.",
};

export function normaliseQuantity(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_QUANTITY || parsed > MAX_QUANTITY_PER_LINE) return null;
  return parsed;
}
