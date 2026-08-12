import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { resolveMediaUrl } from "@/lib/media";
import {
  centsToDecimalString,
  formatCents,
  multiplyCents,
  sumCents,
  type Cents,
} from "@/lib/commerce/money";
import {
  evaluatePurchasability,
  normaliseQuantity,
  PURCHASABILITY_MESSAGE,
  type PurchasabilityReason,
} from "@/lib/commerce/purchasability";

export const CART_COOKIE = "nnino_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Guest cart, keyed by an httpOnly cookie.
 *
 * There are no customer accounts yet (Phase 3 is guest checkout), so the cookie
 * holds an opaque token that maps to `Cart.sessionToken`. It is httpOnly so page
 * scripts cannot read or forge it, and it carries no cart contents — the cart
 * lives in Postgres, which is what makes it survive navigation, refresh and
 * device sleep.
 */
async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

async function writeCartToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

/** Resolves the current cart, creating one only when something is being added. */
export async function getOrCreateCart(): Promise<{ id: string; sessionToken: string }> {
  const existing = await readCartToken();

  if (existing) {
    const cart = await db.cart.findUnique({
      where: { sessionToken: existing },
      select: { id: true, sessionToken: true },
    });
    if (cart?.sessionToken) return { id: cart.id, sessionToken: cart.sessionToken };
  }

  const sessionToken = randomUUID();
  const cart = await db.cart.create({
    data: { sessionToken, currency: "USD" },
    select: { id: true },
  });
  await writeCartToken(sessionToken);
  return { id: cart.id, sessionToken };
}

async function findCartId(): Promise<string | null> {
  const token = await readCartToken();
  if (!token) return null;
  const cart = await db.cart.findUnique({
    where: { sessionToken: token },
    select: { id: true },
  });
  return cart?.id ?? null;
}

// ---------------------------------------------------------------------------
// Revalidated cart view
// ---------------------------------------------------------------------------

export type CartLine = {
  cartItemId: string;
  productId: string;
  name: string;
  slug: string;
  sku: string | null;
  collectionName: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  quantity: number;
  /** Live price at this moment, in cents. Null when the price was withdrawn. */
  unitPriceCents: Cents | null;
  lineTotalCents: Cents | null;
  unitPriceLabel: string;
  lineTotalLabel: string;
  availability: string | null;
  requiresProduction: boolean;
  /** True when this line can be paid for right now. */
  sellable: boolean;
  /** Why not, when it cannot. */
  problem: string | null;
  problemReason: PurchasabilityReason | null;
};

export type CartView = {
  cartId: string | null;
  currency: string;
  lines: CartLine[];
  /** Sellable lines only — a blocked line never contributes to a total. */
  subtotalCents: Cents;
  subtotalLabel: string;
  itemCount: number;
  sellableCount: number;
  blockedCount: number;
  /** Whether checkout may proceed. */
  checkoutReady: boolean;
};

export const EMPTY_CART: CartView = {
  cartId: null,
  currency: "USD",
  lines: [],
  subtotalCents: 0,
  subtotalLabel: formatCents(0),
  itemCount: 0,
  sellableCount: 0,
  blockedCount: 0,
  checkoutReady: false,
};

/**
 * Builds the cart from live product data, every single time.
 *
 * Nothing about price, name or availability is cached in `CartItem` — it stores
 * only a product id and a quantity. So a price change, an unpublish or a
 * withdrawn price is reflected the next time the cart is read, and there is no
 * stale figure anywhere for a client to submit back to us.
 */
export async function getCartView(): Promise<CartView> {
  const cartId = await findCartId();
  if (!cartId) return EMPTY_CART;

  const cart = await db.cart.findUnique({
    where: { id: cartId },
    select: {
      id: true,
      currency: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              sku: true,
              price: true,
              currency: true,
              lifecycleStage: true,
              availability: true,
              collection: { select: { name: true } },
              images: {
                orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
                take: 1,
                select: {
                  media: {
                    select: { provider: true, storageKey: true, url: true, altText: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return EMPTY_CART;

  const lines: CartLine[] = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product) continue; // product deleted out from under the cart

    const verdict = evaluatePurchasability({
      lifecycleStage: product.lifecycleStage,
      availability: product.availability,
      price: product.price,
    });

    // A currency mismatch is not something to paper over by converting.
    const currencyMismatch = product.currency !== cart.currency;

    const sellable = verdict.purchasable && !currencyMismatch;
    const unitPriceCents = verdict.priceCents;
    const lineTotalCents =
      sellable && unitPriceCents !== null
        ? multiplyCents(unitPriceCents, item.quantity)
        : null;

    const media = product.images[0]?.media ?? null;

    lines.push({
      cartItemId: item.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      collectionName: product.collection?.name ?? null,
      imageUrl: media ? resolveMediaUrl(media) : null,
      imageAlt: media?.altText ?? null,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents,
      unitPriceLabel:
        unitPriceCents !== null ? formatCents(unitPriceCents, product.currency) : "Price on request",
      lineTotalLabel:
        lineTotalCents !== null ? formatCents(lineTotalCents, product.currency) : "—",
      availability: product.availability,
      requiresProduction: product.availability === "MADE_TO_ORDER",
      sellable,
      problem: sellable
        ? null
        : currencyMismatch
          ? `This piece is priced in ${product.currency}, which cannot be combined with a ${cart.currency} order yet.`
          : PURCHASABILITY_MESSAGE[verdict.reason],
      problemReason: sellable ? null : verdict.reason,
    });
  }

  const sellableLines = lines.filter((line) => line.sellable);
  const subtotalCents = sumCents(
    sellableLines.map((line) => line.lineTotalCents ?? 0),
  );

  return {
    cartId: cart.id,
    currency: cart.currency,
    lines,
    subtotalCents,
    subtotalLabel: formatCents(subtotalCents, cart.currency),
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    sellableCount: sellableLines.length,
    blockedCount: lines.length - sellableLines.length,
    // Every line must be sellable. Silently dropping a blocked line at checkout
    // would mean charging for something other than what the customer reviewed.
    checkoutReady: sellableLines.length > 0 && sellableLines.length === lines.length,
  };
}

/** Badge count only — cheap enough to run in the layout on every request. */
export async function getCartItemCount(): Promise<number> {
  const cartId = await findCartId();
  if (!cartId) return 0;
  const items = await db.cartItem.findMany({
    where: { cartId },
    select: { quantity: true },
  });
  return items.reduce((total, item) => total + item.quantity, 0);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type CartMutationResult = { ok: true } | { ok: false; message: string };

/**
 * Adds a piece to the cart.
 *
 * The product is re-read and re-evaluated here rather than trusting anything the
 * form sent. The client supplies a slug and a quantity; price, availability and
 * purchasability all come from the database.
 */
export async function addToCart(params: {
  slug: string;
  quantity: unknown;
}): Promise<CartMutationResult> {
  const quantity = normaliseQuantity(params.quantity);
  if (quantity === null) {
    return { ok: false, message: "Choose a quantity between 1 and 20." };
  }

  const slug = params.slug.trim().slice(0, 200);
  const product = await db.product.findUnique({
    where: { slug },
    select: {
      id: true,
      currency: true,
      price: true,
      lifecycleStage: true,
      availability: true,
    },
  });

  if (!product) return { ok: false, message: "That piece could not be found." };

  const verdict = evaluatePurchasability({
    lifecycleStage: product.lifecycleStage,
    availability: product.availability,
    price: product.price,
  });

  if (!verdict.purchasable) {
    return { ok: false, message: PURCHASABILITY_MESSAGE[verdict.reason] };
  }
  if (product.currency !== "USD") {
    return { ok: false, message: "Only USD-priced pieces can be ordered online at the moment." };
  }

  const cart = await getOrCreateCart();

  // The unique constraint on (cartId, productId) makes this an upsert rather
  // than a duplicate line.
  const existing = await db.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    select: { id: true, quantity: true },
  });

  if (existing) {
    const merged = Math.min(existing.quantity + quantity, 20);
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
  } else {
    await db.cartItem.create({
      data: { cartId: cart.id, productId: product.id, quantity },
    });
  }

  await db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return { ok: true };
}

export async function updateCartItemQuantity(params: {
  cartItemId: string;
  quantity: unknown;
}): Promise<CartMutationResult> {
  const quantity = normaliseQuantity(params.quantity);
  if (quantity === null) {
    return { ok: false, message: "Choose a quantity between 1 and 20." };
  }

  const cartId = await findCartId();
  if (!cartId) return { ok: false, message: "Your cart could not be found." };

  // Scoped to this cart: an id from someone else's cart must not be editable.
  const item = await db.cartItem.findFirst({
    where: { id: params.cartItemId, cartId },
    select: { id: true },
  });
  if (!item) return { ok: false, message: "That item is no longer in your cart." };

  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return { ok: true };
}

export async function removeCartItem(cartItemId: string): Promise<CartMutationResult> {
  const cartId = await findCartId();
  if (!cartId) return { ok: false, message: "Your cart could not be found." };

  const item = await db.cartItem.findFirst({
    where: { id: cartItemId, cartId },
    select: { id: true },
  });
  if (!item) return { ok: true }; // already gone; removing twice is not an error

  await db.cartItem.delete({ where: { id: item.id } });
  return { ok: true };
}

/** Used after an order is created, so a refresh cannot re-order the same cart. */
export async function clearCartCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}

export { centsToDecimalString };
