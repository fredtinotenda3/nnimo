"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  IDLE_FORM_STATE,
  field,
  formError,
  formSuccess,
  validationFailed,
  type AdminFormState,
} from "@/lib/admin/forms";
import { customerSchema, idParam } from "@/lib/admin/schemas";

export { IDLE_FORM_STATE };

/**
 * Customer record edits.
 *
 * Deliberately narrow: name, phone, marketing consent and internal notes. Not
 * email — it is the unique key that ties a person to their orders and to the
 * access tokens in their confirmation emails, so changing it from the admin
 * would quietly break links a customer already has. There is no business reason
 * an operator needs to, and the safe version of a feature nobody asked for is
 * not building it.
 *
 * Nothing about payment is editable or readable here. Card data never reaches
 * this system at all — Payment rows hold a provider reference and an amount —
 * and this section does not read the Payment table.
 */
export async function updateCustomerAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("customer:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That customer could not be identified.");
  const id = idResult.data;

  const parsed = customerSchema.safeParse({
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    marketingConsent: formData.get("marketingConsent"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const existing = await db.customer.findUnique({
    where: { id },
    select: { id: true, marketingConsent: true },
  });
  if (!existing) return formError("That customer no longer exists.");

  await db.customer.update({ where: { id }, data: parsed.data });

  await recordAudit({
    userId: user.id,
    action: "customer.updated",
    entityType: "Customer",
    entityId: id,
    // Consent changes are recorded explicitly. Who switched a marketing consent
    // flag, and when, is the question that actually gets asked after a
    // complaint — and the metadata deliberately carries no personal data
    // beyond the fact of the change.
    metadata: {
      consentChanged: existing.marketingConsent !== parsed.data.marketingConsent,
      consentNow: parsed.data.marketingConsent,
    },
  });

  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return formSuccess("Saved.");
}
