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
import { idParam, mediaMetadataSchema, mediaUploadMetadataSchema } from "@/lib/admin/schemas";
import { MediaUploadError, createMediaFromUpload, deleteMedia, getMediaUsage } from "@/lib/admin/media";

export { IDLE_FORM_STATE };

/**
 * Media mutations.
 *
 * Uploads go through a server action rather than a route handler. Next's server
 * actions carry an origin check on every invocation, which is CSRF protection
 * the app gets for free; a hand-rolled `POST /api/admin/media` would need that
 * built and maintained separately, and it would be one more endpoint to
 * remember to authorise. `requirePermission` still runs first regardless —
 * an action is a public POST endpoint, and the only thing standing between it
 * and an authenticated user with the wrong role is this call.
 */

function revalidateMedia() {
  revalidatePath("/admin/media");
}

export async function uploadMediaAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("media:write");

  const metadata = mediaUploadMetadataSchema.safeParse({
    altText: field(formData, "altText"),
    sourceNote: field(formData, "sourceNote"),
  });
  if (!metadata.success) return validationFailed(metadata.error);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return formError("Choose an image to upload.", { file: "No file chosen" });
  }

  let mediaId: string;
  try {
    const media = await createMediaFromUpload({
      file,
      altText: metadata.data.altText,
      sourceNote: metadata.data.sourceNote,
    });
    mediaId = media.id;
  } catch (error) {
    // MediaUploadError messages are written for the operator and are safe to
    // show. Anything else is logged and reported generically — an internal
    // failure message is not the place to leak a path or a bucket name.
    if (error instanceof MediaUploadError) {
      return formError(error.message, { file: error.message });
    }
    console.error("[admin/media] upload failed", error);
    return formError("The image could not be uploaded. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "media.uploaded",
    entityType: "Media",
    entityId: mediaId,
    metadata: { hasAltText: Boolean(metadata.data.altText) },
  });

  revalidateMedia();
  return formSuccess(
    metadata.data.altText
      ? "Image uploaded."
      : "Image uploaded. Add alt text so it is described to screen readers.",
  );
}

export async function updateMediaAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("media:write");

  const parsed = mediaMetadataSchema.safeParse({
    id: formData.get("id"),
    altText: field(formData, "altText"),
    sourceNote: field(formData, "sourceNote"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const { id, ...data } = parsed.data;

  const existing = await db.media.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return formError("That image no longer exists.");

  await db.media.update({ where: { id }, data });

  await recordAudit({
    userId: user.id,
    action: "media.updated",
    entityType: "Media",
    entityId: id,
    metadata: { hasAltText: Boolean(data.altText) },
  });

  revalidateMedia();
  // Alt text appears on the storefront, so every page that could render this
  // image needs rebuilding. Broad rather than surgical: working out exactly
  // which pages reference one image costs more queries than the invalidation
  // saves.
  revalidatePath("/", "layout");
  return formSuccess("Saved.");
}

/**
 * Deleting an image.
 *
 * Refuses while the image is still in use. Two of the references cascade
 * (ProductImage, CustomOrderInquiryImage) and the rest null out, so nothing
 * would break structurally — but a product page would silently lose its
 * photograph, and an operator clearing out the library has no way to know that
 * happened. Making them detach it first is one extra step and removes the
 * whole class of accident.
 */
export async function deleteMediaAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requirePermission("media:write");

  const parsed = idParam.safeParse(formData.get("id"));
  if (!parsed.success) return formError("That image could not be identified.");
  const id = parsed.data;

  const media = await db.media.findUnique({
    where: { id },
    select: { id: true, storageKey: true, altText: true },
  });
  if (!media) return formError("That image no longer exists.");

  const usage = await getMediaUsage(id);
  if (usage.total > 0) {
    const places: string[] = [];
    if (usage.productImages) places.push(`${usage.productImages} product gallery`);
    if (usage.productOgImages) places.push(`${usage.productOgImages} product link preview`);
    if (usage.collectionHeroes) places.push(`${usage.collectionHeroes} range hero`);
    if (usage.collectionOgImages) places.push(`${usage.collectionOgImages} range link preview`);
    if (usage.artistPhotos) places.push(`${usage.artistPhotos} team photograph`);
    if (usage.campaignHeroes) places.push(`${usage.campaignHeroes} campaign`);
    if (usage.landingHeroes) places.push(`${usage.landingHeroes} landing page`);
    if (usage.inquiryReferences) places.push(`${usage.inquiryReferences} enquiry reference`);

    return formError(
      `This image is still in use — ${places.join(", ")}. Remove it from those first.`,
    );
  }

  await deleteMedia(id);

  await recordAudit({
    userId: user.id,
    action: "media.delete",
    entityType: "Media",
    entityId: id,
    // The storage key is recorded so an accidental deletion can be traced to a
    // specific object in a backup. It is not a secret; it is a random uuid path.
    metadata: { storageKey: media.storageKey },
  });

  revalidateMedia();
  return formSuccess("Image deleted.");
}
