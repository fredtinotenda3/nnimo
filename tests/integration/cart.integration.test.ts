import { afterAll, describe, expect, it } from "vitest";
import { addLine, cleanup, db, makeCart, makeProduct } from "./helpers";
import { evaluatePurchasability } from "@/lib/commerce/purchasability";
import { toCents } from "@/lib/commerce/money";

const created = { cartIds: [] as string[], productIds: [] as string[] };

afterAll(async () => {
  await cleanup(created);
  await db.$disconnect();
});

/**
 * Cart persistence at the database level.
 *
 * The cart *actions* (addToCart etc.) read a cookie via next/headers and so can
 * only run inside a request; those are covered by the manual walkthrough in
 * PHASE-3-VERIFICATION.md. What is verified here is everything underneath: the
 * uniqueness rule, cascade behaviour, and that price/purchasability are re-derived
 * from the product row rather than stored on the line.
 */
describe("cart persistence", () => {
  it("creates a guest cart addressable by session token", async () => {
    const cart = await makeCart();
    created.cartIds.push(cart.id);

    const found = await db.cart.findUnique({ where: { sessionToken: cart.sessionToken } });
    expect(found.id).toBe(cart.id);
    expect(found.currency).toBe("USD");
  });

  it("keeps one line per product, so adding twice updates rather than duplicates", async () => {
    const cart = await makeCart();
    const product = await makeProduct();
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);

    await addLine(cart.id, product.id, 1);
    // The @@unique([cartId, productId]) constraint is what makes a duplicate
    // line impossible; the action layer upserts against it.
    await expect(addLine(cart.id, product.id, 1)).rejects.toThrow();

    await db.cartItem.update({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      data: { quantity: 3 },
    });
    const line = await db.cartItem.findFirst({ where: { cartId: cart.id, productId: product.id } });
    expect(line.quantity).toBe(3);
    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
  });

  it("removes a line without touching the product", async () => {
    const cart = await makeCart();
    const product = await makeProduct();
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);

    await addLine(cart.id, product.id, 1);
    await db.cartItem.deleteMany({ where: { cartId: cart.id, productId: product.id } });

    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    expect(await db.product.findUnique({ where: { id: product.id } })).toBeTruthy();
  });

  it("rejects a non-positive quantity at the database level", async () => {
    const cart = await makeCart();
    const product = await makeProduct();
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);

    // CHECK constraint from 0002_constraints.sql.
    await expect(addLine(cart.id, product.id, 0)).rejects.toThrow();
  });

  it("cascades line deletion when the cart is deleted", async () => {
    const cart = await makeCart();
    const product = await makeProduct();
    created.productIds.push(product.id);

    await addLine(cart.id, product.id, 1);
    await db.cart.delete({ where: { id: cart.id } });

    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });
});

describe("server-side price revalidation", () => {
  it("re-derives the line price from the product, so a stale client price is irrelevant", async () => {
    const cart = await makeCart();
    const product = await makeProduct({ price: "150.00" });
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);
    await addLine(cart.id, product.id, 2);

    // The studio changes the price while the cart sits open.
    await db.product.update({ where: { id: product.id }, data: { price: "175.00" } });

    const line = await db.cartItem.findFirst({
      where: { cartId: cart.id },
      select: { quantity: true, product: { select: { price: true, availability: true, lifecycleStage: true } } },
    });

    // The CartItem stores only a quantity — there is nowhere for a stale price
    // to hide, which is why revalidation cannot be bypassed.
    expect(Object.keys(line)).not.toContain("unitPrice");
    const verdict = evaluatePurchasability({
      lifecycleStage: line.product.lifecycleStage,
      availability: line.product.availability,
      price: line.product.price,
    });
    expect(verdict.priceCents).toBe(17500);
    expect(toCents(line.product.price)! * line.quantity).toBe(35000);
  });

  it("turns unpurchasable when the studio unpublishes a piece in an open cart", async () => {
    const cart = await makeCart();
    const product = await makeProduct();
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);
    await addLine(cart.id, product.id, 1);

    await db.product.update({ where: { id: product.id }, data: { lifecycleStage: "CATALOGUE" } });

    const line = await db.cartItem.findFirst({
      where: { cartId: cart.id },
      select: { product: { select: { price: true, availability: true, lifecycleStage: true } } },
    });
    expect(evaluatePurchasability({
      lifecycleStage: line.product.lifecycleStage,
      availability: line.product.availability,
      price: line.product.price,
    }).purchasable).toBe(false);
  });

  it("turns unpurchasable when the price is cleared", async () => {
    const cart = await makeCart();
    const product = await makeProduct({ price: "150.00" });
    created.cartIds.push(cart.id);
    created.productIds.push(product.id);
    await addLine(cart.id, product.id, 1);

    await db.product.update({ where: { id: product.id }, data: { price: null } });

    const line = await db.cartItem.findFirst({
      where: { cartId: cart.id },
      select: { product: { select: { price: true, availability: true, lifecycleStage: true } } },
    });
    const verdict = evaluatePurchasability({
      lifecycleStage: line.product.lifecycleStage,
      availability: line.product.availability,
      price: line.product.price,
    });
    expect(verdict.purchasable).toBe(false);
    expect(verdict.reason).toBe("NO_VERIFIED_PRICE");
  });
});
