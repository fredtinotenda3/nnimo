"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { FulfilmentTransitionError, transitionFulfilment } from "@/lib/commerce/orders";

/**
 * Admin order mutations.
 *
 * Every one goes through requirePermission() — the same Phase 1 RBAC used by the
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
  const user = await requirePermission("order:write");

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
    console.error("[admin/orders] transition failed", error);
    return { error: "The status could not be changed. Please try again." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { error: null };
}

const noteSchema = z.object({
  orderId: z.string().min(1).max(60),
  internalNotes: z.string().trim().max(5000),
});

export async function saveInternalNoteAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await requirePermission("order:write");

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
