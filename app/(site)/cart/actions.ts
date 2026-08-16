"use server";

import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import {
  addToCart,
  getCartView,
  removeCartItem,
  updateCartItemQuantity,
  type CartView,
} from "@/lib/commerce/cart";

export type CartActionState = { error: string | null; ok: boolean };

/**
 * Every mutation revalidates the layout so the header badge updates, and /cart
 * so an open cart page reflects the change.
 */
function revalidateCartSurfaces() {
  revalidatePath("/", "layout");
  revalidatePath("/cart");
}

/**
 * Cart mutation throttle.
 *
 * Loose by design — a real shopper clicks +/- repeatedly and must never be told
 * off for it. This exists to stop a script creating thousands of Cart rows, each
 * of which is a database write and a row that lives for thirty days.
 */
async function cartLimitReached(): Promise<boolean> {
  const limit = await checkRateLimit("cart", await clientIdentity());
  return !limit.allowed;
}

export async function addToCartAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  if (await cartLimitReached()) {
    return { error: "Please slow down a moment and try again.", ok: false };
  }

  const slug = String(formData.get("slug") ?? "");
  const quantity = formData.get("quantity");

  const result = await addToCart({ slug, quantity });
  if (!result.ok) return { error: result.message, ok: false };

  revalidateCartSurfaces();
  return { error: null, ok: true };
}

export async function updateQuantityAction(formData: FormData): Promise<void> {
  if (await cartLimitReached()) return;

  await updateCartItemQuantity({
    cartItemId: String(formData.get("cartItemId") ?? ""),
    quantity: formData.get("quantity"),
  });
  revalidateCartSurfaces();
}

export async function removeItemAction(formData: FormData): Promise<void> {
  if (await cartLimitReached()) return;

  await removeCartItem(String(formData.get("cartItemId") ?? ""));
  revalidateCartSurfaces();
}

/** Read used by the cart drawer, which loads its contents on open. */
export async function fetchCartAction(): Promise<CartView> {
  return getCartView();
}
