"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { FulfilmentTransitionError, transitionFulfilment } from "@/lib/commerce/orders";
import {
  ManualSettlementError,
  settlePaymentManually,
} from "@/lib/commerce/payment-service";
import { formatCents, toCents } from "@/lib/commerce/money";
import { sendOrderEmail } from "@/lib/email/order-emails";

/**
 * Admin order mutations.
 *
 * Every one goes through requireMutationPermission() — the same Phase 1 RBAC used by the
 * rest of /admin. There is no second authorization system, and no action trusts
 * a role claim from the form.
 */
const transitionSchema = z.object({
  orderId: z.string().min(1).max(60),
  to: z.enum([
    "PENDING",
    "CONFIRMED",
    "IN_PRODUCTION",
    "READY",
    "SHIPPED",
    "DELIVERED",
    "COLLECTED",
    "CANCELLED",
  ]),
  trackingRef: z.string().trim().max(120).optional(),
});

export type AdminActionState = { error: string | null };

export async function transitionOrderAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await requireMutationPermission("order:write");

  const parsed = transitionSchema.safeParse({
    orderId: formData.get("orderId"),
    to: formData.get("to"),
    trackingRef: formData.get("trackingRef") ?? undefined,
  });
  if (!parsed.success) return { error: "That status change was not understood." };

  try {
    await transitionFulfilment({
      orderId: parsed.data.orderId,
      to: parsed.data.to,
      userId: user.id,
      trackingRef: parsed.data.trackingRef || null,
    });
  } catch (error) {
    if (error instanceof FulfilmentTransitionError) return { error: error.message };
    logger.error("admin.order.transition_failed", { userId: user.id, error });
    return { error: "The status could not be changed. Please try again." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { error: null };
}

/**
 * Manual settlement — recording a payment that arrived off-platform.
 *
 * `confirm` is a checkbox the operator must tick, validated server-side. It is
 * not UI decoration: while no gateway is live this action is the only path an
 * order has to PAID, it commits stock, and there is no supported way to undo it
 * (see APPLY-TASK1.md). A deliberate second gesture is proportionate to an
 * irreversible assertion that money was received.
 *
 * `method` and `reference` are free text on purpose. Offering a fixed list of
 * payment methods would be inventing business facts about which channels Nnino
 * accepts — the studio records what actually happened, in their own words.
 */
const settlementSchema = z.object({
  orderId: z.string().min(1).max(60),
  method: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value.length === 0 ? null : value)),
  reference: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value.length === 0 ? null : value)),
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value.length === 0 ? null : value)),
  confirm: z.literal("on", {
    message: "Tick the confirmation box to record this payment.",
  }),
});

export async function settleOrderPaymentAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  /**
   * `order:settle`, not `order:write`. Marking money received is a finance
   * decision rather than an order-desk one — see the note in lib/rbac.ts.
   */
  const user = await requireMutationPermission("order:settle");

  const parsed = settlementSchema.safeParse({
    orderId: formData.get("orderId"),
    method: formData.get("method") ?? "",
    reference: formData.get("reference") ?? "",
    note: formData.get("note") ?? "",
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "That payment could not be recorded. Check the form and try again.",
    };
  }

  let result: Awaited<ReturnType<typeof settlePaymentManually>>;
  try {
    result = await settlePaymentManually({
      orderId: parsed.data.orderId,
      userId: user.id,
      method: parsed.data.method,
      reference: parsed.data.reference,
      note: parsed.data.note,
    });
  } catch (error) {
    if (error instanceof ManualSettlementError) return { error: error.message };
    logger.error("admin.order.manual_settlement_failed", { userId: user.id, error });
    return { error: "The payment could not be recorded. Please try again." };
  }

  /**
   * The customer is told only when something actually changed. A second
   * operator pressing the same button must not send a second confirmation.
   *
   * Email failure does not fail the action: the money is recorded, and losing
   * the settlement over an unreachable mail transport would be the wrong trade.
   * It is logged so an operator can follow up by hand.
   */
  if (result.settled) {
    try {
      await notifyManualSettlement(parsed.data.orderId);
    } catch (error) {
      logger.error("admin.order.settlement_email_failed", {
        orderNumber: result.orderNumber,
        error,
      });
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin");
  return { error: null };
}

/**
 * Re-reads the order for the email rather than threading a context through the
 * settlement function. Settlement is a money operation and should not depend on
 * the shape of an email template; this keeps the coupling one-way.
 */
async function notifyManualSettlement(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
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
  if (!order?.guestEmail) return;

  await sendOrderEmail("payment.confirmed_by_studio", {
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
    settlement: "manual",
  });
}

const noteSchema = z.object({
  orderId: z.string().min(1).max(60),
  internalNotes: z.string().trim().max(5000),
});

export async function saveInternalNoteAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await requireMutationPermission("order:write");

  const parsed = noteSchema.safeParse({
    orderId: formData.get("orderId"),
    internalNotes: formData.get("internalNotes"),
  });
  if (!parsed.success) return { error: "That note could not be saved." };

  await db.order.update({
    where: { id: parsed.data.orderId },
    data: { internalNotes: parsed.data.internalNotes || null },
  });

  await recordAudit({
    userId: user.id,
    action: "order.status_change",
    entityType: "Order",
    entityId: parsed.data.orderId,
    metadata: { field: "internalNotes" },
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { error: null };
}
