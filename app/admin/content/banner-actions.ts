"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { field, formError, formSuccess, validationFailed, type AdminFormState } from "@/lib/admin/forms";
import { bannerSchema } from "@/lib/admin/schemas";
import { BANNER_CONTENT_KEY } from "@/lib/marketing/banner";

/**
 * Saves the promotional banner. Its own small action rather than folded into
 * updateContentBlockAction (app/admin/content/actions.ts): a banner has four
 * fields validated together (bannerSchema), where the generic content-block
 * action only ever accepts one text/image value per key.
 *
 * Audited as "content.updated" — the banner IS a ContentBlock, at key
 * "marketing.banner" (see lib/marketing/banner.ts), so this is genuinely the
 * same class of event as any other content edit, not a new one.
 */
export async function updateBannerAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("content:write");

  const parsed = bannerSchema.safeParse({
    enabled: formData.get("enabled"),
    text: field(formData, "text"),
    linkUrl: field(formData, "linkUrl"),
    linkLabel: field(formData, "linkLabel"),
    mediaId: field(formData, "mediaId"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const { enabled, text, linkUrl, linkLabel, mediaId } = parsed.data;

  try {
    await db.contentBlock.upsert({
      where: { key: BANNER_CONTENT_KEY },
      create: {
        key: BANNER_CONTENT_KEY,
        type: "JSON",
        jsonValue: { enabled, text, linkUrl, linkLabel },
        mediaId,
        updatedBy: user.id,
      },
      update: {
        type: "JSON",
        jsonValue: { enabled, text, linkUrl, linkLabel },
        mediaId,
        updatedBy: user.id,
      },
    });
  } catch (error) {
    logger.error("admin.banner.save_failed", { userId: user.id, error });
    return formError("The banner could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "content.updated",
    entityType: "ContentBlock",
    entityId: BANNER_CONTENT_KEY,
    metadata: { key: BANNER_CONTENT_KEY, enabled },
  });

  // Same broad revalidation as updateContentBlockAction: the banner can
  // appear above every public page via the shared (site) layout.
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");

  return formSuccess(enabled ? "Saved. The banner is live." : "Saved. The banner is turned off.");
}
