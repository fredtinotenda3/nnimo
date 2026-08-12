"use server";

import { revalidatePath } from "next/cache";
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

export async function addToCartAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const slug = String(formData.get("slug") ?? "");
  const quantity = formData.get("quantity");

  const result = await addToCart({ slug, quantity });
  if (!result.ok) return { error: result.message, ok: false };

  revalidateCartSurfaces();
  return { error: null, ok: true };
}

export async function updateQuantityAction(formData: FormData): Promise<void> {
  await updateCartItemQuantity({
    cartItemId: String(formData.get("cartItemId") ?? ""),
    quantity: formData.get("quantity"),
  });
  revalidateCartSurfaces();
}

export async function removeItemAction(formData: FormData): Promise<void> {
  await removeCartItem(String(formData.get("cartItemId") ?? ""));
  revalidateCartSurfaces();
}

/** Read used by the cart drawer, which loads its contents on open. */
export async function fetchCartAction(): Promise<CartView> {
  return getCartView();
}
