import { afterAll, describe, expect, it } from "vitest";
import { cleanup, db, makeProduct, uid } from "./helpers";
import { resolveRange } from "@/lib/analytics/range";
import {
  getCollectionPerformance,
  getOrderStatusDistribution,
  getProductPerformance,
  getRevenueSeries,
  getSalesKpis,
} from "@/lib/analytics/sales";
import { getInventoryKpis, getUnsoldProductCount } from "@/lib/analytics/catalogue";
import { getCustomerKpis } from "@/lib/analytics/audience";

/**
 * Analytics against a real PostgreSQL database.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT SUITE
 *
 * The unit tests cover every calculation, because `tests/stubs/db.ts` makes
 * anything importing the database unusable there. What they cannot cover is the
 * four raw SQL statements Phase 7 introduced — `date_trunc(...) AT TIME ZONE`
 * bucketing, the `HAVING`-based repeat-customer count, the double-LEFT-JOIN for
 * revenue by range, and the `FILTER`-based inventory snapshot. Those are the
 * parts most likely to be subtly wrong and the parts TypeScript cannot check at
 * all, so they are exercised here against real Postgres.
 *
 * The timezone bucketing test is the important one: it writes an order that
 * settled at 22:30 UTC and asserts it lands on the NEXT day's bucket, because
 * that is already tomorrow in Bulawayo.
 */

const HARARE = "Africa/Harare";

const created = {
  orderIds: [] as string[],
  productIds: [] as string[],
  customerEmails: [] as string[],
};
const collectionIds: string[] = [];

afterAll(async () => {
  await cleanup(created);
  if (collectionIds.length) {
    await db.collection.deleteMany({ where: { id: { in: collectionIds } } });
  }
  await db.$disconnect();
});

/** Writes a settled order directly, so the test controls `paidAt` exactly. */
async function makeSettledOrder(options: {
  paidAt: Date;
  totalMinor: string;
  currency?: string;
  customerEmail?: string;
  productId?: string;
  quantity?: number;
}): Promise<string> {
  const email = options.customerEmail ?? `${uid("buyer")}@example.test`;
  if (!created.customerEmails.includes(email)) created.customerEmails.push(email);

  const customer = await db.customer.upsert({
    where: { email },
    create: { name: "Analytics Buyer", email },
    update: {},
    select: { id: true },
  });

  const order = await db.order.create({
    data: {
      orderNumber: `NN-TEST-${uid("n")}`,
      accessToken: uid("tok"),
      customerId: customer.id,
      guestEmail: email,
      subtotal: options.totalMinor,
      shippingTotal: "0",
      total: options.totalMinor,
      currency: options.currency ?? "USD",
      paymentStatus: "PAID",
      fulfilmentStatus: "CONFIRMED",
      fulfilmentMethod: "COLLECTION",
      paidAt: options.paidAt,
      ...(options.productId
        ? {
            items: {
              create: {
                productId: options.productId,
                productNameSnapshot: "Test piece",
                quantity: options.quantity ?? 1,
                unitPrice: options.totalMinor,
                lineTotal: options.totalMinor,
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  created.orderIds.push(order.id);
  return order.id;
}

describe("timezone bucketing", () => {
  it("puts a payment settled at 22:30 UTC on the NEXT day, as Bulawayo would", async () => {
    // 2026-05-15T22:30:00Z is 00:30 on the 16th in Harare. Bucketing under UTC
    // would file it on the 15th and every daily revenue figure would be wrong
    // for orders settled in the studio's small hours.
    await makeSettledOrder({ paidAt: new Date("2026-05-15T22:30:00Z"), totalMinor: "100.00" });

    const range = resolveRange({
      preset: "custom",
      from: "2026-05-14",
      to: "2026-05-17",
      timeZone: HARARE,
    });
    const series = await getRevenueSeries(range, "USD");

    const byKey = new Map(series.points.map((point) => [point.key, point.cents]));
    expect(byKey.get("2026-05-16")).toBe(100_00);
    expect(byKey.get("2026-05-15")).toBe(0);
  });

  it("emits a zero-valued bucket for every day with no activity", async () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-05-14",
      to: "2026-05-17",
      timeZone: HARARE,
    });
    const series = await getRevenueSeries(range, "USD");
    expect(series.points).toHaveLength(4);
    expect(series.ungapped).toBe(false);
  });

  it("returns an empty series for a period with nothing in it, not an error", async () => {
    const range = resolveRange({
      preset: "custom",
      from: "2019-01-01",
      to: "2019-01-05",
      timeZone: HARARE,
    });
    const series = await getRevenueSeries(range, "USD");
    expect(series.points).toHaveLength(5);
    expect(series.points.every((point) => point.cents === 0)).toBe(true);
  });
});

describe("currency separation", () => {
  it("never adds a second currency into the reporting total", async () => {
    const paidAt = new Date("2026-06-10T09:00:00Z");
    await makeSettledOrder({ paidAt, totalMinor: "200.00", currency: "USD" });
    await makeSettledOrder({ paidAt, totalMinor: "500.00", currency: "ZWG" });

    const range = resolveRange({
      preset: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
      timeZone: HARARE,
    });
    const kpis = await getSalesKpis(range, "USD");

    expect(kpis.revenue.primary.currency).toBe("USD");
    expect(kpis.revenue.primary.cents).toBe(200_00);
    expect(kpis.revenue.isMixed).toBe(true);
    expect(kpis.revenue.excludedCount).toBe(1);
    expect(kpis.revenue.others[0]?.currency).toBe("ZWG");
  });

  it("scopes the revenue series to the requested currency", async () => {
    const range = resolveRange({
      preset: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
      timeZone: HARARE,
    });
    const zwg = await getRevenueSeries(range, "ZWG");
    const total = zwg.points.reduce((sum, point) => sum + point.cents, 0);
    expect(total).toBe(500_00);
  });
});

describe("product and collection aggregation", () => {
  it("attributes revenue to the product and its range", async () => {
    const collection = await db.collection.create({
      data: { name: `Range ${uid("c")}`, slug: uid("range"), status: "PUBLISHED" },
      select: { id: true, name: true },
    });
    collectionIds.push(collection.id);

    const product = await makeProduct({ price: "75.00" });
    created.productIds.push(product.id);
    await db.product.update({
      where: { id: product.id },
      data: { collectionId: collection.id },
    });

    await makeSettledOrder({
      paidAt: new Date("2026-07-05T09:00:00Z"),
      totalMinor: "150.00",
      productId: product.id,
      quantity: 2,
    });

    const range = resolveRange({
      preset: "custom",
      from: "2026-07-01",
      to: "2026-07-31",
      timeZone: HARARE,
    });

    const products = await getProductPerformance(range, "USD", 10);
    const row = products.rows.find((candidate) => candidate.productId === product.id);
    expect(row?.quantity).toBe(2);
    expect(row?.cents).toBe(150_00);

    const collections = await getCollectionPerformance(range, "USD", 10);
    const collectionRow = collections.rows.find(
      (candidate) => candidate.collectionId === collection.id,
    );
    expect(collectionRow?.cents).toBe(150_00);
  });

  it("keeps revenue from a deleted product in an explicit bucket", async () => {
    // OrderItem.productId is SetNull on delete. Dropping those lines would make
    // every other row's share wrong, so they become one labelled row.
    const product = await makeProduct({ price: "40.00" });
    await makeSettledOrder({
      paidAt: new Date("2026-07-06T09:00:00Z"),
      totalMinor: "40.00",
      productId: product.id,
    });
    await db.inventory.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });

    const range = resolveRange({
      preset: "custom",
      from: "2026-07-06",
      to: "2026-07-06",
      timeZone: HARARE,
    });
    const products = await getProductPerformance(range, "USD", 10);
    const orphan = products.rows.find((row) => row.productId === null);
    expect(orphan).toBeDefined();
    expect(orphan?.cents).toBe(40_00);
    expect(orphan?.name).toBe("Pieces no longer in the catalogue");
  });

  it("counts pieces with no sales in the period", async () => {
    const unsoldProduct = await makeProduct({ price: "90.00" });
    created.productIds.push(unsoldProduct.id);

    const range = resolveRange({
      preset: "custom",
      from: "2026-07-01",
      to: "2026-07-31",
      timeZone: HARARE,
    });
    const counts = await getUnsoldProductCount(range);
    expect(counts.unsold).toBeGreaterThan(0);
    expect(counts.sold).toBeGreaterThan(0);
  });
});

describe("customer aggregation", () => {
  it("counts a customer with two settled orders as returning", async () => {
    const email = `${uid("repeat")}@example.test`;
    const paidAt = new Date("2026-04-10T09:00:00Z");
    await makeSettledOrder({ paidAt, totalMinor: "60.00", customerEmail: email });
    await makeSettledOrder({ paidAt, totalMinor: "40.00", customerEmail: email });

    const range = resolveRange({
      preset: "custom",
      from: "2026-04-01",
      to: "2026-04-30",
      timeZone: HARARE,
    });
    const kpis = await getCustomerKpis(range, "USD");

    expect(kpis.returningCustomers).toBeGreaterThanOrEqual(1);
    expect(kpis.customersWithSettledOrders).toBeGreaterThanOrEqual(1);
    expect(kpis.ordersPerCustomer).not.toBeNull();
  });

  it("returns null orders-per-customer for a period nobody bought in", async () => {
    const range = resolveRange({
      preset: "custom",
      from: "2019-03-01",
      to: "2019-03-31",
      timeZone: HARARE,
    });
    const kpis = await getCustomerKpis(range, "USD");
    expect(kpis.customersWithSettledOrders).toBe(0);
    expect(kpis.ordersPerCustomer).toBeNull();
    expect(kpis.averageCustomerValue.cents).toBe(0);
  });
});

describe("inventory", () => {
  it("distinguishes uncounted pieces from out-of-stock ones", async () => {
    const counted = await makeProduct({ price: "50.00", onHand: 4, reserved: 1 });
    created.productIds.push(counted.id);
    const uncounted = await makeProduct({ price: "50.00" });
    created.productIds.push(uncounted.id);

    const kpis = await getInventoryKpis();

    expect(kpis.trackedProducts).toBeGreaterThanOrEqual(1);
    expect(kpis.productsWithoutRecord).toBeGreaterThanOrEqual(1);
    // Derived, never stored: available is onHand minus reserved.
    expect(kpis.available).toBe(Math.max(0, kpis.onHand - kpis.reserved));
    expect(kpis.value.some((total) => total.currency === "USD")).toBe(true);
  });
});

describe("status distribution", () => {
  it("lists every status, including the ones with no orders", async () => {
    const range = resolveRange({ preset: "all_time", timeZone: HARARE });
    const distribution = await getOrderStatusDistribution(range);

    expect(distribution.payment).toHaveLength(6);
    expect(distribution.fulfilment).toHaveLength(8);
    expect(distribution.payment.some((row) => row.status === "REFUNDED")).toBe(true);
  });
});
