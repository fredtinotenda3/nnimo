"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  IDLE_FORM_STATE,
  field,
  formError,
  formSuccess,
  validationFailed,
  type AdminFormState,
} from "@/lib/admin/forms";
import { inquiryUpdateSchema, wholesaleUpdateSchema } from "@/lib/admin/schemas";

export { IDLE_FORM_STATE };

/**
 * Commission and wholesale enquiries.
 *
 * The lifecycle is the existing `CustomOrderStatus` enum, unchanged. §11 of the
 * brief suggested one and then said not to force it if the schema already had
 * something better — and it does: the Phase 1 enum models the same journey while
 * distinguishing PAYMENT (quote accepted, money not yet taken) from APPROVED,
 * and DELIVERED from COMPLETED. Adding a parallel enum would mean a migration, a
 * mapping table and two vocabularies for one process.
 *
 * Status is free to move in any direction. An enquiry is a conversation, and
 * conversations go backwards — a customer who accepted a quote and then asked
 * for a different size puts the enquiry back to QUOTED. That is not the same as
 * an order's fulfilment status, which is a state machine because it describes
 * physical events that cannot un-happen.
 */
export async function updateInquiryAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("custom_order:write");

  const parsed = inquiryUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    quote: field(formData, "quote"),
    internalNotes: field(formData, "internalNotes"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const { id, status, quote, internalNotes } = parsed.data;

  const existing = await db.customOrderInquiry.findUnique({
    where: { id },
    select: { id: true, status: true, quote: true },
  });
  if (!existing) return formError("That enquiry no longer exists.");

  await db.customOrderInquiry.update({
    where: { id },
    data: { status, quote, internalNotes },
  });

  if (existing.status !== status) {
    await recordAudit({
      userId: user.id,
      action: "inquiry.status_change",
      entityType: "CustomOrderInquiry",
      entityId: id,
      metadata: { from: existing.status, to: status },
    });
  }

  const previousQuote = existing.quote === null ? null : String(existing.quote);
  if (previousQuote !== quote) {
    await recordAudit({
      userId: user.id,
      action: "inquiry.updated",
      entityType: "CustomOrderInquiry",
      entityId: id,
      // The quote is a number the studio commits to a customer, so who changed
      // it and when is worth being able to answer.
      metadata: { field: "quote", from: previousQuote, to: quote },
    });
  }

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${id}`);
  return formSuccess("Saved.");
}

export async function updateWholesaleInquiryAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("wholesale:write");

  const parsed = wholesaleUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    internalNotes: field(formData, "internalNotes"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const { id, status, internalNotes } = parsed.data;

  const existing = await db.wholesaleInquiry.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return formError("That enquiry no longer exists.");

  await db.wholesaleInquiry.update({ where: { id }, data: { status, internalNotes } });

  if (existing.status !== status) {
    await recordAudit({
      userId: user.id,
      action: "inquiry.status_change",
      entityType: "WholesaleInquiry",
      entityId: id,
      metadata: { from: existing.status, to: status },
    });
  }

  revalidatePath("/admin/inquiries");
  return formSuccess("Saved.");
}
