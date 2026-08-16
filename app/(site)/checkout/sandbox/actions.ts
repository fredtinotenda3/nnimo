"use server";

import { redirect } from "next/navigation";
import { sandboxProvider, setSandboxOutcome } from "@/lib/payments/sandbox-provider";
import { verifyAndApplyPayment } from "@/lib/commerce/payment-service";
import { db } from "@/lib/db";
import { sendOrderEmail } from "@/lib/email/order-emails";
import { formatCents, toCents } from "@/lib/commerce/money";
import { timingSafeEqualString } from "@/lib/security/tokens";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";

/**
 * Records the tester's chosen outcome, then runs the *real* verification path.
 *
 * This action does not set the order to PAID itself. It tells the sandbox
 * provider what the "gateway" will report, then calls verifyAndApplyPayment,
 * which is the same code the production provider will use. The path being proven
 * here is the path that will run in production.
 *
 * PHASE 5 SECURITY FIX
 *
 * Previously this took an `orderNumber` from the form and acted on it with no
 * ownership check at all. Because `sandboxProvider.isConfigured()` returns true
 * in every non-production environment (and in production when
 * PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION is set), anyone who could reach the site
 * could mark ANY order paid by posting its number — and order numbers are
 * sequential.
 *
 * Now the caller must prove possession of the order's access token, compared in
 * constant time. The token is the same secret that guards /orders/[accessToken],
 * so the authorisation model is consistent: holding the token means you are the
 * customer who placed the order.
 */
export async function completeSandboxPayment(formData: FormData): Promise<void> {
  if (!sandboxProvider.isConfigured()) {
    throw new Error("Sandbox provider is not active.");
  }

  const orderNumber = String(formData.get("orderNumber") ?? "").slice(0, 60);
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const outcome = String(formData.get("outcome") ?? "");

  if (outcome !== "PAID" && outcome !== "FAILED") {
    throw new Error("Unknown sandbox outcome.");
  }
  if (!orderNumber || !token) {
    throw new Error("That payment could not be identified.");
  }

  // Bounds the cost of anyone probing tokens, even though a UUIDv4 is not
  // practically guessable.
  const limit = await checkRateLimit("checkout", await clientIdentity());
  if (!limit.allowed) {
    throw new Error("Too many attempts. Please wait a moment and try again.");
  }

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      accessToken: true,
      guestName: true,
      guestEmail: true,
      total: true,
      currency: true,
      fulfilmentMethod: true,
      deliveryQuoteStatus: true,
      items: { select: { productNameSnapshot: true, quantity: true, lineTotal: true } },
    },
  });

  // Same generic failure whether the order is absent or the token is wrong, so
  // this cannot be used to test whether an order number exists.
  if (!order || !timingSafeEqualString(token, order.accessToken)) {
    logger.warn("sandbox.payment_rejected", { reason: "token_mismatch" });
    throw new Error("That payment could not be identified.");
  }

  setSandboxOutcome(orderNumber, outcome);
  const result = await verifyAndApplyPayment({ orderNumber, providerId: sandboxProvider.id });

  if (order.guestEmail) {
    await sendOrderEmail(result.status === "PAID" ? "payment.successful" : "payment.failed", {
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      customerName: order.guestName ?? "there",
      customerEmail: order.guestEmail,
      totalLabel: formatCents(toCents(order.total) ?? 0, order.currency),
      currency: order.currency,
      fulfilmentMethod: order.fulfilmentMethod,
      deliveryPendingQuote: order.deliveryQuoteStatus === "PENDING_QUOTE",
      lines: order.items.map((item) => ({
        name: item.productNameSnapshot,
        quantity: item.quantity,
        lineTotalLabel: formatCents(toCents(item.lineTotal) ?? 0, order.currency),
      })),
    });
  }

  redirect(`/orders/${encodeURIComponent(order.accessToken)}`);
}
