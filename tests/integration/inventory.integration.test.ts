import { afterAll, describe, expect, it } from "vitest";
import { createOrderFromCart } from "@/lib/commerce/orders";
import {
  InsufficientStockError,
  availableQuantity,
  commitReservation,
  releaseReservation,
  reserveStock,
} from "@/lib/inventory";
import { CHECKOUT_INPUT, addLine, assertFound, cleanup, db, makeCart, makeProduct, uid } from "./helpers";

const created = { orderIds: [] as string[], cartIds: [] as string[], productIds: [] as string[], customerEmails: [] as string[] };

afterAll(async () => {
  await cleanup(created);
  await db.$disconnect();
});

const input = (email: string) => ({ ...CHECKOUT_INPUT, email }) as never;

describe("stock reservation", () => {
  it("reserves without changing onHand, and records a movement", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 5 });
    created.productIds.push(product.id);

    await reserveStock({ productId: product.id, quantity: 2, orderId: "manual-test" });

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.onHand).toBe(5);
    expect(inventory.reserved).toBe(2);
    expect(availableQuantity(inventory)).toBe(3);

    const movements = await db.inventoryMovement.count({
      where: { productId: product.id, type: "RESERVATION" },
    });
    expect(movements).toBe(1);
  });

  it("refuses to reserve more than is available", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 2 });
    created.productIds.push(product.id);

    await expect(
      reserveStock({ productId: product.id, quantity: 3, orderId: "manual-test" }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.reserved).toBe(0);
  });

  it("does not oversell under concurrency", async () => {
    // One piece, two simultaneous reservations. The conditional UPDATE is
    // evaluated under a row lock, so exactly one must win.
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 1 });
    created.productIds.push(product.id);

    const results = await Promise.allSettled([
      reserveStock({ productId: product.id, quantity: 1, orderId: "race-a" }),
      reserveStock({ productId: product.id, quantity: 1, orderId: "race-b" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.reserved).toBe(1);
    expect(availableQuantity(inventory)).toBe(0);
  });

  it("commits a reservation into a sale, leaving available unchanged", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 4 });
    created.productIds.push(product.id);

    await reserveStock({ productId: product.id, quantity: 1, orderId: "commit-test" });
    await commitReservation({ productId: product.id, quantity: 1, orderId: "commit-test" });

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.onHand).toBe(3);
    expect(inventory.reserved).toBe(0);
    expect(availableQuantity(inventory)).toBe(3);
  });

  it("releases a reservation when an order fails", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 3 });
    created.productIds.push(product.id);

    await reserveStock({ productId: product.id, quantity: 2, orderId: "release-test" });
    await releaseReservation({
      productId: product.id,
      quantity: 2,
      orderId: "release-test",
      reason: "Payment failed",
    });

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.reserved).toBe(0);
    expect(availableQuantity(inventory)).toBe(3);
  });
});

describe("reservation during order creation", () => {
  it("reserves stock atomically with the order for a stock-backed piece", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 3 });
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);
    created.customerEmails.push(email);

    await addLine(cart.id, product.id, 2);
    const order = await createOrderFromCart({
      cartId: cart.id,
      input: input(email),
      expectedSubtotalCents: 30000,
    });
    created.orderIds.push(order.id);

    const inventory = await db.inventory.findUnique({ where: { productId: product.id } });
    assertFound(inventory);
    expect(inventory.reserved).toBe(2);
    expect(availableQuantity(inventory)).toBe(1);

    // The movement is attributed to the real order, not a placeholder.
    const movement = await db.inventoryMovement.findFirst({
      where: { productId: product.id, orderId: order.id, type: "RESERVATION" },
    });
    assertFound(movement);
    expect(movement.quantity).toBe(-2);
  });

  it("rolls the whole order back if stock ran out mid-checkout", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 1 });
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);

    await addLine(cart.id, product.id, 1);

    // Someone else takes the last piece between review and submit.
    await reserveStock({ productId: product.id, quantity: 1, orderId: "other-order" });

    await expect(
      createOrderFromCart({ cartId: cart.id, input: input(email), expectedSubtotalCents: 15000 }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    // Atomicity: no order, and no order items left behind.
    expect(await db.order.count({ where: { cartId: cart.id } })).toBe(0);
    // The cart is untouched, so the customer can retry.
    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
  });

  it("does not reserve anything for a made-to-order piece", async () => {
    // Made to order has no stock by definition. This is currently every
    // sellable Nnino piece.
    const product = await makeProduct({ availability: "MADE_TO_ORDER" });
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);
    created.customerEmails.push(email);

    await addLine(cart.id, product.id, 1);
    const order = await createOrderFromCart({
      cartId: cart.id,
      input: input(email),
      expectedSubtotalCents: 15000,
    });
    created.orderIds.push(order.id);

    expect(await db.inventory.findUnique({ where: { productId: product.id } })).toBeNull();
    expect(await db.inventoryMovement.count({ where: { orderId: order.id } })).toBe(0);
  });
});
