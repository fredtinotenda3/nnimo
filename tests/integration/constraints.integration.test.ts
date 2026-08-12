import { afterAll, describe, expect, it } from "vitest";
import { cleanup, db, makeProduct } from "./helpers";

const created = { productIds: [] as string[] };

afterAll(async () => {
  await cleanup(created);
  await db.$disconnect();
});

/**
 * Verifies the SQL in prisma/sql/0002_constraints.sql and
 * prisma/sql/0003_order_number_sequence.sql is actually present.
 *
 * These are the invariants the application relies on as a last line of defence.
 * If this file fails, the SQL was never applied — the app will appear to work
 * until something writes a value the application layer failed to catch.
 */
describe("database constraints (0002)", () => {
  it("rejects negative stock", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 1 });
    created.productIds.push(product.id);

    await expect(
      db.$executeRaw`UPDATE "Inventory" SET "onHand" = -1 WHERE "productId" = ${product.id}`,
    ).rejects.toThrow();
  });

  it("rejects reserving more than is on hand", async () => {
    const product = await makeProduct({ availability: "IN_STOCK", onHand: 2 });
    created.productIds.push(product.id);

    await expect(
      db.$executeRaw`UPDATE "Inventory" SET "reserved" = 5 WHERE "productId" = ${product.id}`,
    ).rejects.toThrow();
  });

  it("rejects a negative product price", async () => {
    const product = await makeProduct();
    created.productIds.push(product.id);

    await expect(
      db.$executeRaw`UPDATE "Product" SET "price" = -1 WHERE "id" = ${product.id}`,
    ).rejects.toThrow();
  });

  it("allows only one primary image per product", async () => {
    const product = await makeProduct();
    created.productIds.push(product.id);

    const media = await db.media.create({
      data: { provider: "LOCAL", storageKey: `test/${product.id}.jpg`, mimeType: "image/jpeg", sizeBytes: 1 },
      select: { id: true },
    });

    await db.productImage.create({
      data: { productId: product.id, mediaId: media.id, isPrimary: true, position: 0 },
    });

    // A second primary must be rejected by the partial unique index.
    await expect(
      db.productImage.create({
        data: { productId: product.id, mediaId: media.id, isPrimary: true, position: 1 },
      }),
    ).rejects.toThrow();

    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.media.delete({ where: { id: media.id } });
  });
});

describe("order number sequence (0003)", () => {
  it("exists and produces increasing values", async () => {
    const first = await db.$queryRaw<{ value: bigint }[]>`SELECT nextval('nnino_order_number_seq') AS value`;
    const second = await db.$queryRaw<{ value: bigint }[]>`SELECT nextval('nnino_order_number_seq') AS value`;
    // A missing sequence throws above; these guards satisfy
    // noUncheckedIndexedAccess without weakening the assertion.
    expect(first[0]).toBeDefined();
    expect(second[0]).toBeDefined();
    expect(Number(second[0]!.value)).toBeGreaterThan(Number(first[0]!.value));
  });
});
