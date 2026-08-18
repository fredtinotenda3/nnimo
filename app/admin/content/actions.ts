"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
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
import { contentBlockSchema } from "@/lib/admin/schemas";
import { contentDefinition } from "@/lib/admin/content-registry";

export { IDLE_FORM_STATE };

/**
 * Editing site copy.
 *
 * `upsert` rather than `update`: most registry keys have no database row yet.
 * The Phase 1 seed deliberately left them null rather than writing marketing
 * copy on the business's behalf, and several were never inserted at all — so the
 * first time somebody writes the "about the founder" passage, the row is created
 * by that save. An `update` would fail on exactly the keys the team most needs
 * to fill in.
 *
 * Blank saves as null, not "". A block with an empty string would render an
 * empty paragraph on the site; null makes `getContentBlocks` skip it and the
 * page falls back to its own layout, which is what an unwritten section should
 * do.
 */
export async function updateContentBlockAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("content:write");

  const parsed = contentBlockSchema.safeParse({
    key: field(formData, "key"),
    type: field(formData, "type") || "RICH_TEXT",
    value: field(formData, "value"),
    mediaId: field(formData, "mediaId"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const { key, type, value, mediaId } = parsed.data;

  try {
    await db.contentBlock.upsert({
      where: { key },
      create: { key, type, value, mediaId, updatedBy: user.id },
      update: { type, value, mediaId, updatedBy: user.id },
    });
  } catch (error) {
    logger.error("admin.content.save_failed", { userId: user.id, key, error });
    return formError("That block could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "content.updated",
    entityType: "ContentBlock",
    entityId: key,
    metadata: { key, cleared: value === null && mediaId === null },
  });

  // Content blocks are read by several public pages and there is no index of
  // which key appears where, so the whole site layout is revalidated. Broad, but
  // correct — and content edits are rare enough that the cost does not matter.
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");

  const definition = contentDefinition(key);
  return formSuccess(
    definition ? `Saved. This appears on ${definition.where.toLowerCase()}` : "Saved.",
  );
}
