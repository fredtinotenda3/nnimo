import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrderFromCart } from "@/lib/commerce/orders";
import {
  markWebhookProcessed,
  recordWebhookOnce,
  startPayment,
  verifyAndApplyPayment,
} from "@/lib/commerce/payment-service";
import { setSandboxOutcome } from "@/lib/payments/sandbox-provider";
import { CHECKOUT_INPUT, addLine, cleanup, db, makeCart, makeProduct, uid } from "./helpers";

const created = {
  orderIds: [] as string[],
  cartIds: [] as string[],
  productIds: [] as string[],
  customerEmails: [] as string[],
  webhookKeys: [] as string[],
};

beforeAll(() => {
  // Sandbox provider only. No real payment network is contacted anywhere here.
  process.env.PAYMENT_PROVIDER = "sandbox";
});

afterAll(async () => {
  await cleanup(created);
  await db.$disconnect();
});

async function seedOrder(): Promise<{ id: string; orderNumber: string }> {
  const product = await makeProduct({ price: "150.00" });
  const cart = await makeCart();
  const email = `${uid("buyer")}@example.test`;
  created.productIds.push(product.id);
  created.cartIds.push(cart.id);
  created.customerEmails.push(email);

  await addLine(cart.id, product.id, 1);
  const order = await createOrderFromCart({
    cartId: cart.id,
    input: { ...CHECKOUT_INPUT, email } as never,
    expectedSubtotalCents: 15000,
  });
  created.orderIds.push(order.id);
  return { id: order.id, orderNumber: order.orderNumber };
}

describe("payment creation", () => {
  it("records a PENDING payment for the order's exact total", async () => {
    const order = await seedOrder();

    const { paymentId } = await startPayment({
      orderId: order.id,
      returnUrl: "http://localhost:3000/orders",
      resultUrl: "http://localhost:3000/api/payments/sandbox/callback",
    });

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, amount: true, currency: true, provider: true, idempotencyKey: true, verifiedAt: true },
    });
    expect(payment.status).toBe("PENDING");
    expect(payment.provider).toBe("sandbox");
    expect(Number(payment.amount.toString())).toBe(150);
    expect(payment.currency).toBe("USD");
    expect(payment.idempotencyKey).toBeTruthy();
    // Never verified simply because a payment was started.
    expect(payment.verifiedAt).toBeNull();
  });

  it("leaves the order UNPAID until verification happens server-side", async () => {
    const order = await seedOrder();
    await startPayment({
      orderId: order.id,
      returnUrl: "http://localhost:3000/orders",
      resultUrl: "http://localhost:3000/api/payments/sandbox/callback",
    });

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { paymentStatus: true, paidAt: true },
    });
    expect(persisted.paymentStatus).toBe("UNPAID");
    expect(persisted.paidAt).toBeNull();
  });
});

describe("payment verification", () => {
  it("moves the order to PAID and stamps paidAt", async () => {
    const order = await seedOrder();
    await startPayment({
      orderId: order.id,
      returnUrl: "http://localhost:3000/orders",
      resultUrl: "http://localhost:3000/api/payments/sandbox/callback",
    });
    setSandboxOutcome(order.orderNumber, "PAID");

    const result = await verifyAndApplyPayment({ orderNumber: order.orderNumber });
    expect(result.status).toBe("PAID");

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { paymentStatus: true, paidAt: true },
    });
    expect(persisted.paymentStatus).toBe("PAID");
    expect(persisted.paidAt).toBeTruthy();
  });

  it("is idempotent — verifying twice does not pay the order twice", async () => {
    const order = await seedOrder();
    await startPayment({
      orderId: order.id,
      returnUrl: "http://localhost:3000/orders",
      resultUrl: "http://localhost:3000/api/payments/sandbox/callback",
    });
    setSandboxOutcome(order.orderNumber, "PAID");

    await verifyAndApplyPayment({ orderNumber: order.orderNumber });
    const before = await db.payment.count({ where: { orderId: order.id, status: "PAID" } });

    await verifyAndApplyPayment({ orderNumber: order.orderNumber });
    const after = await db.payment.count({ where: { orderId: order.id, status: "PAID" } });

    expect(after).toBe(before);
    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { paymentStatus: true },
    });
    expect(persisted.paymentStatus).toBe("PAID");
  });

  it("records a failure without marking the order paid", async () => {
    const order = await seedOrder();
    await startPayment({
      orderId: order.id,
      returnUrl: "http://localhost:3000/orders",
      resultUrl: "http://localhost:3000/api/payments/sandbox/callback",
    });
    setSandboxOutcome(order.orderNumber, "FAILED");

    const result = await verifyAndApplyPayment({ orderNumber: order.orderNumber });
    expect(result.status).toBe("FAILED");

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { paymentStatus: true, paidAt: true },
    });
    expect(persisted.paymentStatus).not.toBe("PAID");
    expect(persisted.paidAt).toBeNull();
  });
});

describe("webhook idempotency", () => {
  it("accepts an event once and rejects the replay", async () => {
    const key = uid("wh");
    created.webhookKeys.push(key);

    const first = await recordWebhookOnce({
      provider: "sandbox",
      eventType: "payment.updated",
      idempotencyKey: key,
      payload: { ok: true },
    });
    expect(first.firstTime).toBe(true);

    const replay = await recordWebhookOnce({
      provider: "sandbox",
      eventType: "payment.updated",
      idempotencyKey: key,
      payload: { ok: true },
    });
    expect(replay.firstTime).toBe(false);

    // Exactly one row, enforced by the UNIQUE index rather than a lookup.
    expect(await db.paymentWebhookEvent.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("survives simultaneous duplicate deliveries", async () => {
    const key = uid("wh");
    created.webhookKeys.push(key);

    const results = await Promise.all([
      recordWebhookOnce({ provider: "sandbox", eventType: "payment.updated", idempotencyKey: key, payload: {} }),
      recordWebhookOnce({ provider: "sandbox", eventType: "payment.updated", idempotencyKey: key, payload: {} }),
      recordWebhookOnce({ provider: "sandbox", eventType: "payment.updated", idempotencyKey: key, payload: {} }),
    ]);

    expect(results.filter((r) => r.firstTime)).toHaveLength(1);
    expect(await db.paymentWebhookEvent.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("marks an event processed only after handling", async () => {
    const key = uid("wh");
    created.webhookKeys.push(key);

    await recordWebhookOnce({ provider: "sandbox", eventType: "payment.updated", idempotencyKey: key, payload: {} });
    let event = await db.paymentWebhookEvent.findUnique({ where: { idempotencyKey: key } });
    expect(event.processedAt).toBeNull();

    await markWebhookProcessed(key);
    event = await db.paymentWebhookEvent.findUnique({ where: { idempotencyKey: key } });
    expect(event.processedAt).toBeTruthy();
  });
});
