import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrderFromCart, FulfilmentTransitionError, transitionFulfilment } from "@/lib/commerce/orders";
import { CHECKOUT_INPUT, addLine, assertFound, cleanup, db, makeCart, makeProduct, uid } from "./helpers";

const created = {
  orderIds: [] as string[],
  cartIds: [] as string[],
  productIds: [] as string[],
  customerEmails: [] as string[],
};

let adminUserId: string;
const adminEmail = `${uid("admin")}@example.test`;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: adminEmail,
      name: "Integration Admin",
      // Not a usable login — transitions take a userId, they do not authenticate.
      passwordHash: "not-a-real-hash",
      role: "OWNER",
    },
    select: { id: true },
  });
  adminUserId = user.id;
});

afterAll(async () => {
  await cleanup(created);
  await db.auditLog.deleteMany({ where: { userId: adminUserId } });
  await db.user.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

async function seedOrder(fulfilmentMethod: "COLLECTION" | "DELIVERY" = "COLLECTION") {
  const product = await makeProduct();
  const cart = await makeCart();
  const email = `${uid("buyer")}@example.test`;
  created.productIds.push(product.id);
  created.cartIds.push(cart.id);
  created.customerEmails.push(email);
  await addLine(cart.id, product.id, 1);

  const extra =
    fulfilmentMethod === "DELIVERY"
      ? { addressLine1: "25 Waverley Road", city: "Bulawayo", country: "Zimbabwe" }
      : {};

  const order = await createOrderFromCart({
    cartId: cart.id,
    input: { ...CHECKOUT_INPUT, email, fulfilmentMethod, ...extra } as never,
    expectedSubtotalCents: 15000,
  });
  created.orderIds.push(order.id);
  return order;
}

describe("fulfilment transitions", () => {
  it("walks the collection path and stamps each timestamp", async () => {
    const order = await seedOrder("COLLECTION");

    for (const to of ["CONFIRMED", "IN_PRODUCTION", "READY", "COLLECTED"] as const) {
      await transitionFulfilment({ orderId: order.id, to, userId: adminUserId });
    }

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { fulfilmentStatus: true, confirmedAt: true, readyAt: true, deliveredAt: true },
    });
    assertFound(persisted);
    expect(persisted.fulfilmentStatus).toBe("COLLECTED");
    expect(persisted.confirmedAt).toBeTruthy();
    expect(persisted.readyAt).toBeTruthy();
    expect(persisted.deliveredAt).toBeTruthy();
  });

  it("walks the delivery path and records the tracking reference", async () => {
    const order = await seedOrder("DELIVERY");

    await transitionFulfilment({ orderId: order.id, to: "CONFIRMED", userId: adminUserId });
    await transitionFulfilment({ orderId: order.id, to: "READY", userId: adminUserId });
    await transitionFulfilment({
      orderId: order.id,
      to: "SHIPPED",
      userId: adminUserId,
      trackingRef: "TRK-123",
    });
    await transitionFulfilment({ orderId: order.id, to: "DELIVERED", userId: adminUserId });

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { fulfilmentStatus: true, trackingRef: true, shippedAt: true, deliveredAt: true },
    });
    assertFound(persisted);
    expect(persisted.fulfilmentStatus).toBe("DELIVERED");
    expect(persisted.trackingRef).toBe("TRK-123");
    expect(persisted.shippedAt).toBeTruthy();
    expect(persisted.deliveredAt).toBeTruthy();
  });

  it("refuses an impossible transition", async () => {
    const order = await seedOrder();
    await expect(
      transitionFulfilment({ orderId: order.id, to: "DELIVERED", userId: adminUserId }),
    ).rejects.toBeInstanceOf(FulfilmentTransitionError);

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { fulfilmentStatus: true },
    });
    assertFound(persisted);
    expect(persisted.fulfilmentStatus).toBe("PENDING");
  });

  it("refuses to dispatch a collection order", async () => {
    const order = await seedOrder("COLLECTION");
    await transitionFulfilment({ orderId: order.id, to: "CONFIRMED", userId: adminUserId });
    await transitionFulfilment({ orderId: order.id, to: "READY", userId: adminUserId });

    await expect(
      transitionFulfilment({ orderId: order.id, to: "SHIPPED", userId: adminUserId }),
    ).rejects.toBeInstanceOf(FulfilmentTransitionError);
  });

  it("treats a delivered order as terminal", async () => {
    const order = await seedOrder("COLLECTION");
    for (const to of ["CONFIRMED", "READY", "COLLECTED"] as const) {
      await transitionFulfilment({ orderId: order.id, to, userId: adminUserId });
    }
    await expect(
      transitionFulfilment({ orderId: order.id, to: "READY", userId: adminUserId }),
    ).rejects.toBeInstanceOf(FulfilmentTransitionError);
  });
});

describe("audit log", () => {
  it("writes an attributable audit row for every status change", async () => {
    const order = await seedOrder();
    await transitionFulfilment({ orderId: order.id, to: "CONFIRMED", userId: adminUserId });

    const entries = await db.auditLog.findMany({
      where: { entityType: "Order", entityId: order.id },
      select: { action: true, userId: true, metadata: true },
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry: { userId: string | null }) => entry.userId === adminUserId)).toBe(true);
  });

  it("records enough to reconstruct who did what", async () => {
    const order = await seedOrder();
    await transitionFulfilment({ orderId: order.id, to: "CANCELLED", userId: adminUserId });

    const entry = await db.auditLog.findFirst({
      where: { entityType: "Order", entityId: order.id },
      orderBy: { createdAt: "desc" },
      select: { action: true, userId: true, createdAt: true },
    });
    assertFound(entry);
    expect(entry.action).toBeTruthy();
    expect(entry.userId).toBe(adminUserId);
    expect(entry.createdAt).toBeTruthy();

    const persisted = await db.order.findUnique({
      where: { id: order.id },
      select: { fulfilmentStatus: true, cancelledAt: true },
    });
    assertFound(persisted);
    expect(persisted.fulfilmentStatus).toBe("CANCELLED");
    expect(persisted.cancelledAt).toBeTruthy();
  });
});
