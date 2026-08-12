import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Integration harness — runs against a REAL PostgreSQL database.
 *
 * These tests are separated from the unit suite because they need a migrated
 * database, and because they are destructive: each one creates and deletes rows.
 *
 * SAFETY: refuses to run unless TEST_DATABASE_URL is set and its database name
 * contains "test". Pointing this at a production database would delete orders.
 * There is no override.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Integration tests need their own database — " +
      "see tests/integration/README.md. Never point them at your development database.",
  );
}

const databaseName = (() => {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();

if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run destructive tests against database "${databaseName}". ` +
      'Its name must contain "test".',
  );
}

export const db = new PrismaClient({ datasourceUrl: url } as never);

/**
 * Narrows a `findUnique`/`findFirst` result from `T | null` to `T`.
 *
 * `noUncheckedIndexedAccess`/strict null checks mean every `findUnique` call
 * types as possibly-null even in a test where we just created the row and
 * know it exists. Asserting here (once, right after the fetch) is the correct
 * fix — it documents the assumption and gives a real failure message if it's
 * ever wrong, instead of scattering `!` non-null assertions through every
 * `expect(...)` line that follows.
 */
export function assertFound<T>(value: T | null | undefined, message = "Expected row to exist"): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/** A unique suffix per test run, so parallel runs cannot collide. */
export function uid(prefix = "t"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export type SeededProduct = {
  id: string;
  slug: string;
  name: string;
};

/**
 * Creates a published, priced product. `availability` decides whether it is
 * stock-backed; an Inventory row is only created when `onHand` is given, so the
 * "marked in stock but has no stock record" case can be exercised too.
 */
export async function makeProduct(options: {
  price?: string | null;
  availability?:
    | "IN_STOCK"
    | "LOW_STOCK"
    | "OUT_OF_STOCK"
    | "MADE_TO_ORDER"
    | "CUSTOM_ONLY"
    | "COMING_SOON"
    | null;
  lifecycleStage?: "CATALOGUE" | "PUBLISHED" | "ARCHIVED";
  onHand?: number;
  reserved?: number;
  sku?: string | null;
} = {}): Promise<SeededProduct> {
  const slug = uid("piece");
  const product = await db.product.create({
    data: {
      slug,
      name: `Test piece ${slug}`,
      sku: options.sku ?? null,
      price: options.price === undefined ? "150.00" : options.price,
      currency: "USD",
      lifecycleStage: options.lifecycleStage ?? "PUBLISHED",
      availability: options.availability === undefined ? "MADE_TO_ORDER" : options.availability,
    },
    select: { id: true, slug: true, name: true },
  });

  if (options.onHand !== undefined) {
    await db.inventory.create({
      data: {
        productId: product.id,
        onHand: options.onHand,
        reserved: options.reserved ?? 0,
      },
    });
  }

  return product;
}

export async function makeCart(currency = "USD"): Promise<{ id: string; sessionToken: string }> {
  const sessionToken = uid("sess");
  const cart = await db.cart.create({
    data: { sessionToken, currency },
    select: { id: true },
  });
  // Cart.sessionToken is nullable in the schema (customer-linked carts have
  // none), but this helper always sets one — return the value we just wrote
  // rather than the nullable column, so callers get a real `string`.
  return { id: cart.id, sessionToken };
}

export async function addLine(cartId: string, productId: string, quantity = 1) {
  return db.cartItem.create({ data: { cartId, productId, quantity } });
}

/** Removes everything a test created, in FK-safe order. */
export async function cleanup(ids: {
  orderIds?: string[];
  cartIds?: string[];
  productIds?: string[];
  customerEmails?: string[];
  webhookKeys?: string[];
}) {
  const { orderIds = [], cartIds = [], productIds = [], customerEmails = [], webhookKeys = [] } = ids;

  if (orderIds.length) {
    await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.inventoryMovement.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (cartIds.length) {
    await db.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await db.cart.deleteMany({ where: { id: { in: cartIds } } });
  }
  if (productIds.length) {
    await db.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await db.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await db.product.deleteMany({ where: { id: { in: productIds } } });
  }
  if (customerEmails.length) {
    await db.customer.deleteMany({ where: { email: { in: customerEmails } } });
  }
  if (webhookKeys.length) {
    await db.paymentWebhookEvent.deleteMany({ where: { idempotencyKey: { in: webhookKeys } } });
  }
}

export const CHECKOUT_INPUT = {
  name: "Test Buyer",
  email: "",
  phone: "+263 771 000 000",
  fulfilmentMethod: "COLLECTION" as const,
  notes: null,
};
