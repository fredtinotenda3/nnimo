import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { commitReservation, releaseReservation } from "@/lib/inventory";

/**
 * Resolving an order's stock reservations.
 *
 * THE GAP THIS CLOSES
 *
 * Phase 3 built `reserveStockWithin`, `commitReservation` and
 * `releaseReservation` and wired only the first of them. `createOrderFromCart`
 * reserves stock inside the order transaction, but a repository-wide search for
 * `commitReservation` and `releaseReservation` in Phase 5A found call sites in
 * `tests/integration/inventory.integration.test.ts` and nowhere else.
 *
 * The consequence on a stock-backed product is that `Inventory.reserved` only
 * ever goes up:
 *
 *   - a paid order never decrements `onHand`, so the studio's stock figure is
 *     permanently wrong and the low-stock alert never fires;
 *   - a failed or cancelled order leaves its reservation held forever, so
 *     `available = onHand - reserved` decays towards zero and the piece becomes
 *     unbuyable with stock physically on the shelf.
 *
 * It has not caused visible damage yet only because every sellable Nnino piece is
 * currently MADE_TO_ORDER, and `createOrderFromCart` skips reservation for those
 * (`reservesStock` is true only for IN_STOCK and LOW_STOCK). The first time real
 * stock counts are entered, it breaks. That makes it a latent CRITICAL rather
 * than a live one — and a genuinely bad one to discover in production, because
 * the damage accumulates silently.
 *
 * DESIGN NOTES
 *
 * Per-line, not per-order. `commitReservation` targets one product and asserts
 * `reserved >= qty AND onHand >= qty` in its conditional UPDATE, which is the
 * check that makes concurrent commits safe. Batching all lines into one UPDATE
 * would lose that per-row guarantee.
 *
 * Idempotent at the order level via `InventoryMovement`. Both operations are
 * driven off "which movements has this order already recorded?", so a replayed
 * webhook, a re-verification, or an admin cancelling an already-cancelled order
 * cannot double-commit or double-release. This is the same reasoning as the
 * webhook idempotency key: the guard is a fact in the database, not a flag in
 * application memory.
 *
 * Failures are logged and swallowed at the ORDER level, never at the line level.
 * A commit that cannot complete must not roll back a payment that genuinely
 * settled — the money moved, and refusing to record it would be worse than a
 * stock figure needing a manual correction. The log line is what tells the
 * operator to correct it, which is why it is an `error` and carries the order
 * number.
 */

type StockLine = { productId: string; quantity: number };

/**
 * Lines of this order that actually took stock.
 *
 * Derived from the RESERVATION movements rather than from the order items,
 * because that is the record of what was really reserved. Reading the items and
 * re-deriving `reservesStock` from the product's CURRENT availability would give
 * the wrong answer whenever an admin changed the product between order and
 * payment — the classic drift bug in this kind of code.
 */
async function reservedLines(orderId: string): Promise<StockLine[]> {
  const movements = await db.inventoryMovement.findMany({
    where: { orderId, type: "RESERVATION" },
    select: { productId: true, quantity: true },
  });

  // RESERVATION movements are recorded with a negative quantity (stock leaving
  // availability). Normalise to a positive amount to act on.
  const totals = new Map<string, number>();
  for (const movement of movements) {
    totals.set(movement.productId, (totals.get(movement.productId) ?? 0) + Math.abs(movement.quantity));
  }

  return [...totals.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Products for which this order has already recorded a movement of `type`. */
async function alreadyRecorded(orderId: string, type: "SALE" | "RESERVATION_RELEASE"): Promise<Set<string>> {
  const rows = await db.inventoryMovement.findMany({
    where: { orderId, type },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

/**
 * Converts this order's reservations into sales. Call exactly once per order,
 * when payment has been verified server-side.
 *
 * Safe to call more than once: lines that already have a SALE movement are
 * skipped, so a duplicate provider callback or a manual re-verification is a
 * no-op rather than a double decrement.
 */
export async function commitOrderInventory(params: {
  orderId: string;
  orderNumber: string;
}): Promise<{ committed: number; skipped: number; failed: number }> {
  const [lines, done] = await Promise.all([
    reservedLines(params.orderId),
    alreadyRecorded(params.orderId, "SALE"),
  ]);

  let committed = 0;
  let skipped = 0;
  let failed = 0;

  for (const line of lines) {
    if (done.has(line.productId)) {
      skipped += 1;
      continue;
    }

    try {
      await commitReservation({
        productId: line.productId,
        quantity: line.quantity,
        orderId: params.orderId,
      });
      committed += 1;
    } catch (error) {
      failed += 1;
      // The order is paid. Stock is now understated in our favour rather than
      // oversold, which is the safe direction, and the operator needs to fix it
      // by hand. Loud, with everything needed to do that.
      logger.error("inventory.commit_failed", {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        productId: line.productId,
        quantity: line.quantity,
        error,
      });
    }
  }

  if (committed > 0 || failed > 0) {
    logger.info("inventory.commit", {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      committed,
      skipped,
      failed,
    });
  }

  return { committed, skipped, failed };
}

/**
 * Returns this order's reserved stock to availability. Call when a payment
 * definitively fails or is cancelled, or when the order itself is cancelled.
 *
 * Never releases a line that has already been sold (a SALE movement exists) —
 * that stock is gone, and "releasing" it would invent inventory. A partially
 * paid-then-cancelled order therefore releases only what was never committed.
 */
export async function releaseOrderInventory(params: {
  orderId: string;
  orderNumber: string;
  reason: string;
}): Promise<{ released: number; skipped: number; failed: number }> {
  const [lines, released, sold] = await Promise.all([
    reservedLines(params.orderId),
    alreadyRecorded(params.orderId, "RESERVATION_RELEASE"),
    alreadyRecorded(params.orderId, "SALE"),
  ]);

  let count = 0;
  let skipped = 0;
  let failed = 0;

  for (const line of lines) {
    if (released.has(line.productId) || sold.has(line.productId)) {
      skipped += 1;
      continue;
    }

    try {
      await releaseReservation({
        productId: line.productId,
        quantity: line.quantity,
        orderId: params.orderId,
        reason: params.reason,
      });
      count += 1;
    } catch (error) {
      failed += 1;
      // Stock stays held. That understates availability, which is the safe
      // direction — it cannot cause an oversell — but it does need correcting.
      logger.error("inventory.release_failed", {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        productId: line.productId,
        quantity: line.quantity,
        error,
      });
    }
  }

  if (count > 0 || failed > 0) {
    logger.info("inventory.release", {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      released: count,
      skipped,
      failed,
      reason: params.reason,
    });
  }

  return { released: count, skipped, failed };
}
