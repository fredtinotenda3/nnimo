import { afterAll, describe, expect, it } from "vitest";
import { createOrderFromCart, CheckoutValidationError, nextOrderNumber } from "@/lib/commerce/orders";
import { toCents } from "@/lib/commerce/money";
import { CHECKOUT_INPUT, addLine, cleanup, db, makeCart, makeProduct, uid } from "./helpers";

const created = { orderIds: [] as string[], cartIds: [] as string[], productIds: [] as string[], customerEmails: [] as string[] };

afterAll(async () => {
  await cleanup(created);
  await db.$disconnect();
});

function input(email: string, overrides: Record<string, unknown> = {}) {
  return { ...CHECKOUT_INPUT, email, ...overrides } as never;
}

describe("order number generation", () => {
  it("issues strictly increasing, unique numbers from the sequence", async () => {
    // Fails outright if 0003_order_number_sequence.sql was never applied.
    const numbers = await Promise.all([
      nextOrderNumber(db as never),
      nextOrderNumber(db as never),
      nextOrderNumber(db as never),
    ]);
    expect(new Set(numbers).size).toBe(3);
    for (const number of numbers) expect(number).toMatch(/^NN-\d{4}-\d{5}$/);
  });
});

describe("createOrderFromCart", () => {
  it("creates an order with immutable price snapshots", async () => {
    const product = await makeProduct({ price: "150.00" });
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

    expect(order.orderNumber).toMatch(/^NN-\d{4}-\d{5}$/);
    expect(order.totalCents).toBe(30000);
    expect(order.accessToken).toBeTruthy();

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: {
        subtotal: true, total: true, shippingTotal: true, currency: true,
        paymentStatus: true, fulfilmentStatus: true, deliveryQuoteStatus: true,
        cartId: true,
        items: { select: { productNameSnapshot: true, unitPrice: true, lineTotal: true, quantity: true, requiresProduction: true } },
      },
    });

    expect(toCents(persisted.subtotal)).toBe(30000);
    expect(toCents(persisted.total)).toBe(30000);
    expect(toCents(persisted.shippingTotal)).toBe(0);
    expect(persisted.paymentStatus).toBe("UNPAID");
    expect(persisted.fulfilmentStatus).toBe("PENDING");
    expect(persisted.deliveryQuoteStatus).toBe("NOT_REQUIRED");
    expect(persisted.cartId).toBe(cart.id);
    expect(persisted.items).toHaveLength(1);
    expect(persisted.items[0].productNameSnapshot).toBe(product.name);
    expect(toCents(persisted.items[0].unitPrice)).toBe(15000);
    expect(toCents(persisted.items[0].lineTotal)).toBe(30000);
    expect(persisted.items[0].requiresProduction).toBe(true);
  });

  it("keeps the historical price when the catalogue price later changes", async () => {
    const product = await makeProduct({ price: "150.00" });
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

    // The studio raises the price after the sale.
    await db.product.update({ where: { id: product.id }, data: { price: "999.00" } });

    const item = await db.orderItem.findFirst({
      where: { orderId: order.id },
      select: { unitPrice: true, lineTotal: true },
    });
    expect(toCents(item.unitPrice)).toBe(15000);
    expect(toCents(item.lineTotal)).toBe(15000);
  });

  it("empties the cart but keeps cartId on the order as the duplicate guard", async () => {
    const product = await makeProduct();
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

    const remaining = await db.cartItem.count({ where: { cartId: cart.id } });
    expect(remaining).toBe(0);
  });

  it("refuses a second order from the same cart (duplicate-order protection)", async () => {
    const product = await makeProduct();
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);
    created.customerEmails.push(email);

    await addLine(cart.id, product.id, 1);
    const first = await createOrderFromCart({
      cartId: cart.id,
      input: input(email),
      expectedSubtotalCents: 15000,
    });
    created.orderIds.push(first.id);

    // The cart is now empty, so this raises EMPTY_CART; and even if lines were
    // restored, the Order.cartId unique index rejects the insert. Either way, no
    // second order exists.
    await expect(
      createOrderFromCart({ cartId: cart.id, input: input(email), expectedSubtotalCents: 15000 }),
    ).rejects.toThrow();

    const count = await db.order.count({ where: { cartId: cart.id } });
    expect(count).toBe(1);
  });

  it("rejects the order if the subtotal moved since the review step", async () => {
    const product = await makeProduct({ price: "150.00" });
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);
    created.customerEmails.push(email);

    await addLine(cart.id, product.id, 1);

    await expect(
      createOrderFromCart({
        cartId: cart.id,
        input: input(email),
        // What the browser claims it showed the customer.
        expectedSubtotalCents: 100,
      }),
    ).rejects.toBeInstanceOf(CheckoutValidationError);

    expect(await db.order.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("marks a delivery order as awaiting a delivery quote, with zero shipping", async () => {
    const product = await makeProduct();
    const cart = await makeCart();
    const email = `${uid("buyer")}@example.test`;
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);
    created.customerEmails.push(email);

    await addLine(cart.id, product.id, 1);
    const order = await createOrderFromCart({
      cartId: cart.id,
      input: input(email, {
        fulfilmentMethod: "DELIVERY",
        addressLine1: "25 Waverley Road",
        city: "Bulawayo",
        country: "Zimbabwe",
      }),
      expectedSubtotalCents: 15000,
    });
    created.orderIds.push(order.id);

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { deliveryQuoteStatus: true, shippingTotal: true, total: true, subtotal: true, deliveryAddress: true },
    });
    expect(persisted.deliveryQuoteStatus).toBe("PENDING_QUOTE");
    expect(toCents(persisted.shippingTotal)).toBe(0);
    // No invented delivery fee: total equals subtotal until the studio quotes.
    expect(toCents(persisted.total)).toBe(toCents(persisted.subtotal));
    expect(persisted.deliveryAddress).toBeTruthy();
  });

  it("creates exactly one Customer per email across repeat orders", async () => {
    const email = `${uid("repeat")}@example.test`;
    created.customerEmails.push(email);

    for (let i = 0; i < 2; i += 1) {
      const product = await makeProduct();
      const cart = await makeCart();
      created.productIds.push(product.id);
      created.cartIds.push(cart.id);
      await addLine(cart.id, product.id, 1);
      const order = await createOrderFromCart({
        cartId: cart.id,
        input: input(email),
        expectedSubtotalCents: 15000,
      });
      created.orderIds.push(order.id);
    }

    expect(await db.customer.count({ where: { email } })).toBe(1);
  });
});

describe("checkout validation against the catalogue", () => {
  it("refuses a piece with no verified price", async () => {
    const product = await makeProduct({ price: null });
    const cart = await makeCart();
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);

    await addLine(cart.id, product.id, 1);
    await expect(
      createOrderFromCart({
        cartId: cart.id,
        input: input(`${uid("b")}@example.test`),
        expectedSubtotalCents: 0,
      }),
    ).rejects.toBeInstanceOf(CheckoutValidationError);
  });

  it("refuses an unpublished piece even if it is priced", async () => {
    const product = await makeProduct({ lifecycleStage: "CATALOGUE" });
    const cart = await makeCart();
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);

    await addLine(cart.id, product.id, 1);
    await expect(
      createOrderFromCart({
        cartId: cart.id,
        input: input(`${uid("b")}@example.test`),
        expectedSubtotalCents: 15000,
      }),
    ).rejects.toBeInstanceOf(CheckoutValidationError);
  });

  it("refuses an out-of-stock piece", async () => {
    const product = await makeProduct({ availability: "OUT_OF_STOCK" });
    const cart = await makeCart();
    created.productIds.push(product.id);
    created.cartIds.push(cart.id);

    await addLine(cart.id, product.id, 1);
    await expect(
      createOrderFromCart({
        cartId: cart.id,
        input: input(`${uid("b")}@example.test`),
        expectedSubtotalCents: 15000,
      }),
    ).rejects.toBeInstanceOf(CheckoutValidationError);
  });

  it("refuses an empty cart", async () => {
    const cart = await makeCart();
    created.cartIds.push(cart.id);
    await expect(
      createOrderFromCart({
        cartId: cart.id,
        input: input(`${uid("b")}@example.test`),
        expectedSubtotalCents: 0,
      }),
    ).rejects.toBeInstanceOf(CheckoutValidationError);
  });
});
