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
import { getActiveProviderId } from "@/lib/payments";
import { CHECKOUT_IDLE } from "@/lib/checkout-constants";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";

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

  // Order placement was previously unthrottled. A human places one order; a
  // script places hundreds, and each one burns an order number, a Customer
  // upsert and a stock reservation.
  const limit = await checkRateLimit("checkout", await clientIdentity());
  if (!limit.allowed) {
    return {
      status: "error",
      message: "That is several orders in a short time. Please wait a moment and try again.",
    };
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
    logger.error("checkout.order_creation_failed", { error });
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

  /**
   * PHASE 5 FIX — this path was wrong in two ways, and both were customer-facing.
   *
   * 1. It built `/orders/{orderNumber}?token={accessToken}`. The route is
   *    `app/(site)/orders/[accessToken]` and it queries
   *    `db.order.findUnique({ where: { accessToken } })`, so the order NUMBER was
   *    being looked up as if it were the token. Every confirmation redirect
   *    resolved to notFound(). The customer paid and landed on a 404.
   *
   * 2. `resultUrl` pointed at `/api/payments/webhook`, which does not exist. The
   *    callback route is `/api/payments/[provider]/callback`. Any provider given
   *    that URL would post settlement notifications into a 404 and retry until it
   *    gave up — orders would never move to PAID by the server-to-server path.
   */
  const orderPath = `/orders/${encodeURIComponent(order.accessToken)}`;
  const resultUrl = `${siteUrl}/api/payments/${encodeURIComponent(getActiveProviderId())}/callback`;

  try {
    const payment = await startPayment({
      orderId: order.id,
      returnUrl: `${siteUrl}${orderPath}`,
      resultUrl,
    });
    if (payment.redirectUrl) redirect(payment.redirectUrl);
  } catch (error) {
    if (error instanceof PaymentProviderNotConfiguredError) {
      // The order stands; payment simply cannot start yet. The customer is sent to
      // their order page, which explains the position honestly.
      redirect(`${orderPath}?payment=unavailable`);
    }
    throw error;
  }

  redirect(orderPath);
}
