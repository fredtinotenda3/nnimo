"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearCartCookie, getCartView } from "@/lib/commerce/cart";
import {
  checkoutSchema,
  createOrderFromCart,
  CheckoutValidationError,
} from "@/lib/commerce/orders";
import { startPayment } from "@/lib/commerce/payment-service";
import { sendOrderEmail } from "@/lib/email/order-emails";
import { fieldErrors } from "@/lib/inquiries";
import { formatCents } from "@/lib/commerce/money";
import { PaymentProviderNotConfiguredError } from "@/lib/payments/types";
import { CHECKOUT_IDLE } from "@/lib/checkout-constants";

export type CheckoutState = {
  status: "idle" | "error";
  message: string | null;
  errors?: Record<string, string>;
};


const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Places the order, then starts payment.
 *
 * Order creation and payment initiation are deliberately separate steps: the
 * order exists and is recoverable even if the provider is down, and a failed
 * payment does not lose the customer's details.
 */
export async function placeOrderAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }
  if (parsed.data.website) {
    // Honeypot. Pretend success rather than teaching the bot anything.
    return CHECKOUT_IDLE;
  }

  // The cart is re-read and re-validated here. The subtotal used for the order is
  // the one the server computes now, and the figure the customer was shown is
  // only used as a consistency check inside the transaction.
  const cart = await getCartView();
  if (!cart.cartId || cart.lines.length === 0) {
    return { status: "error", message: "Your cart is empty." };
  }
  if (!cart.checkoutReady) {
    return {
      status: "error",
      message:
        "Something in your cart cannot be ordered online right now. Please review your cart.",
    };
  }

  let order: Awaited<ReturnType<typeof createOrderFromCart>>;
  try {
    order = await createOrderFromCart({
      cartId: cart.cartId,
      input: parsed.data,
      expectedSubtotalCents: cart.subtotalCents,
    });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return { status: "error", message: error.message };
    }
    // The unique index on Order.cartId is what stops a double submit creating a
    // second order. Treat the collision as "already placed", not as a failure.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint") && message.includes("cartId")) {
      return {
        status: "error",
        message:
          "This order has already been placed. Check your email for the confirmation link.",
      };
    }
    console.error("[checkout] order creation failed", error);
    return {
      status: "error",
      message: "We could not place that order. Please try again, or WhatsApp the studio.",
    };
  }

  await clearCartCookie();
  revalidatePath("/", "layout");

  // Confirmation of receipt goes out before payment — the order exists and the
  // customer should have a record of it regardless of what payment does next.
  await sendOrderEmail("order.received", {
    orderNumber: order.orderNumber,
    accessToken: order.accessToken,
    customerName: parsed.data.name,
    customerEmail: parsed.data.email,
    totalLabel: formatCents(order.totalCents),
    currency: "USD",
    fulfilmentMethod: parsed.data.fulfilmentMethod,
    deliveryPendingQuote: parsed.data.fulfilmentMethod === "DELIVERY",
    lines: cart.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      lineTotalLabel: line.lineTotalLabel,
    })),
  });

  const orderPath = `/orders/${encodeURIComponent(order.orderNumber)}?token=${order.accessToken}`;

  try {
    const payment = await startPayment({
      orderId: order.id,
      returnUrl: `${siteUrl}${orderPath}`,
      resultUrl: `${siteUrl}/api/payments/webhook`,
    });
    if (payment.redirectUrl) redirect(payment.redirectUrl);
  } catch (error) {
    if (error instanceof PaymentProviderNotConfiguredError) {
      // The order stands; payment simply cannot start yet. The customer is sent to
      // their order page, which explains the position honestly.
      redirect(`${orderPath}&payment=unavailable`);
    }
    throw error;
  }

  redirect(orderPath);
}
