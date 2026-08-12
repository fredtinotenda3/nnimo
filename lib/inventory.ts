import "server-only";
import { db } from "@/lib/db";
import { InventoryMovementType, ProductAvailability } from "@/lib/generated/prisma/enums";

export class InsufficientStockError extends Error {
  constructor(
    readonly productId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Only ${available} available for product ${productId}, ${requested} requested.`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Available is always derived, never stored.
 *
 * A stored `available` column drifts the first time a write path forgets to
 * update it, and by then the number is wrong in a way nobody notices until a
 * customer buys a piece that does not exist. onHand and reserved are the facts;
 * available is arithmetic.
 */
export function availableQuantity(inventory: { onHand: number; reserved: number }): number {
  return Math.max(0, inventory.onHand - inventory.reserved);
}

export function isLowStock(inventory: {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}): boolean {
  const available = availableQuantity(inventory);
  return available > 0 && available <= inventory.lowStockThreshold;
}

/**
 * Derives the availability a stock-backed product should display.
 *
 * Returns null for products whose availability is not a function of stock at
 * all — MADE_TO_ORDER, CUSTOM_ONLY and COMING_SOON are business decisions the
 * admin sets, and stock arithmetic must not overwrite them.
 */
export function deriveAvailability(
  current: ProductAvailability | null,
  inventory: { onHand: number; reserved: number; lowStockThreshold: number } | null,
): ProductAvailability | null {
  if (
    current === ProductAvailability.MADE_TO_ORDER ||
    current === ProductAvailability.CUSTOM_ONLY ||
    current === ProductAvailability.COMING_SOON
  ) {
    return current;
  }
  if (!inventory) return current;

  const available = availableQuantity(inventory);
  if (available <= 0) return ProductAvailability.OUT_OF_STOCK;
  if (isLowStock(inventory)) return ProductAvailability.LOW_STOCK;
  return ProductAvailability.IN_STOCK;
}

/**
 * Reserves stock for an order.
 *
 * Overselling is prevented by the conditional UPDATE rather than by
 * read-then-write: `reserved = reserved + qty WHERE onHand - reserved >= qty`
 * is evaluated by Postgres under a row lock, so two simultaneous checkouts for
 * the last piece cannot both succeed. A read followed by a write would let both
 * pass their check before either wrote.
 *
 * A CHECK constraint (see prisma/sql/0002_constraints.sql) enforces
 * `reserved <= onHand` at the database level as the final backstop.
 */
/**
 * Minimal surface of a Prisma transaction client, so reservation can be composed
 * into a caller's transaction (order creation) instead of opening its own.
 */
export type InventoryTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  inventory: { findUnique: (args: unknown) => Promise<{ onHand: number; reserved: number } | null> };
  inventoryMovement: { create: (args: unknown) => Promise<unknown> };
};

/**
 * Reserves stock inside an EXISTING transaction.
 *
 * This variant exists because order creation must reserve stock atomically with
 * writing the order. Calling the self-contained `reserveStock` from inside
 * `db.$transaction` would open a second, independent transaction on another
 * connection: the reservation could commit while the order rolled back, or the
 * reverse, leaving stock reserved against an order that does not exist.
 */
export async function reserveStockWithin(
  tx: InventoryTx,
  params: { productId: string; quantity: number; orderId: string; reason?: string },
): Promise<void> {
  const { productId, quantity, orderId, reason = "Reserved at checkout" } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Reservation quantity must be a positive integer, received ${quantity}.`);
  }

  const updated = await tx.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = "reserved" + ${quantity},
             "updatedAt" = NOW()
       WHERE "productId" = ${productId}
         AND "onHand" - "reserved" >= ${quantity}
    `;

  if (updated === 0) {
    const inventory = await tx.inventory.findUnique({ where: { productId } });
    throw new InsufficientStockError(
      productId,
      quantity,
      inventory ? availableQuantity(inventory) : 0,
    );
  }

  await tx.inventoryMovement.create({
    data: {
      productId,
      type: InventoryMovementType.RESERVATION,
      quantity: -quantity,
      orderId,
      reason,
    },
  });
}

/**
 * Reserves stock for an order.
 *
 * Overselling is prevented by the conditional UPDATE rather than by
 * read-then-write: `reserved = reserved + qty WHERE onHand - reserved >= qty`
 * is evaluated by Postgres under a row lock, so two simultaneous checkouts for
 * the last piece cannot both succeed. A read followed by a write would let both
 * pass their check before either wrote.
 *
 * A CHECK constraint (see prisma/sql/0002_constraints.sql) enforces
 * `reserved <= onHand` at the database level as the final backstop.
 */
export async function reserveStock(params: {
  productId: string;
  quantity: number;
  orderId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await reserveStockWithin(tx as unknown as InventoryTx, params);
  });
}

/**
 * Converts a reservation into a sale once payment is verified server-side.
 * Decrements both onHand and reserved so available is unchanged by this step —
 * the stock was already unavailable from the moment it was reserved.
 */
export async function commitReservation(params: {
  productId: string;
  quantity: number;
  orderId: string;
}): Promise<void> {
  const { productId, quantity, orderId } = params;

  await db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Inventory"
         SET "onHand" = "onHand" - ${quantity},
             "reserved" = "reserved" - ${quantity},
             "updatedAt" = NOW()
       WHERE "productId" = ${productId}
         AND "reserved" >= ${quantity}
         AND "onHand" >= ${quantity}
    `;

    if (updated === 0) {
      throw new Error(
        `Cannot commit ${quantity} for product ${productId}: no matching reservation.`,
      );
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        type: InventoryMovementType.SALE,
        quantity: -quantity,
        orderId,
        reason: "Payment verified",
      },
    });
  });
}

/** Releases a reservation when an order is cancelled or payment fails. */
export async function releaseReservation(params: {
  productId: string;
  quantity: number;
  orderId: string;
  reason: string;
}): Promise<void> {
  const { productId, quantity, orderId, reason } = params;

  await db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = GREATEST(0, "reserved" - ${quantity}),
             "updatedAt" = NOW()
       WHERE "productId" = ${productId}
    `;

    if (updated === 0) {
      throw new Error(`No inventory row for product ${productId}.`);
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        type: InventoryMovementType.RESERVATION_RELEASE,
        quantity,
        orderId,
        reason,
      },
    });
  });
}

/** Manual adjustment by an admin. Always leaves an audit trail. */
export async function adjustStock(params: {
  productId: string;
  delta: number;
  reason: string;
  userId: string;
}): Promise<void> {
  const { productId, delta, reason, userId } = params;
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("Adjustment must be a non-zero integer.");
  }
  if (!reason.trim()) {
    throw new Error("A reason is required for every manual stock adjustment.");
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Inventory"
         SET "onHand" = "onHand" + ${delta},
             "updatedAt" = NOW()
       WHERE "productId" = ${productId}
         AND "onHand" + ${delta} >= "reserved"
    `;

    if (updated === 0) {
      throw new Error(
        `Adjustment of ${delta} would put product ${productId} below its reserved quantity.`,
      );
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        type:
          delta > 0
            ? InventoryMovementType.RESTOCK
            : InventoryMovementType.MANUAL_ADJUSTMENT,
        quantity: delta,
        reason,
        createdBy: userId,
      },
    });
  });
}
