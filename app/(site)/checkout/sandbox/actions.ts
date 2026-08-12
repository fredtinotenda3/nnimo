"use server";

import { redirect } from "next/navigation";
import { sandboxProvider, setSandboxOutcome } from "@/lib/payments/sandbox-provider";
import { verifyAndApplyPayment } from "@/lib/commerce/payment-service";
import { db } from "@/lib/db";
import { sendOrderEmail } from "@/lib/email/order-emails";
import { formatCents, toCents } from "@/lib/commerce/money";

/**
 * Records the tester's chosen outcome, then runs the *real* verification path.
 *
 * Importantly, this action does not set the order to PAID itself. It tells the
 * sandbox provider what the "gateway" will report, then calls
 * verifyAndApplyPayment, which is the same code the production provider will use.
 * That way the path being proven here is the path that will run in production.
 */
export async function completeSandboxPayment(formData: FormData): Promise<void> {
  if (!sandboxProvider.isConfigured()) throw new Error("Sandbox provider is not active.");

  const orderNumber = String(formData.get("orderNumber") ?? "");
  const token = String(formData.get("token") ?? "");
  const outcome = String(formData.get("outcome") ?? "");

  if (outcome !== "PAID" && outcome !== "FAILED") {
    throw new Error("Unknown sandbox outcome.");
  }

  setSandboxOutcome(orderNumber, outcome);
  const result = await verifyAndApplyPayment({ orderNumber, providerId: sandboxProvider.id });

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
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

  if (order?.guestEmail) {
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

  redirect(`/orders/${encodeURIComponent(orderNumber)}?token=${token}`);
}
