import "server-only";
import { db } from "@/lib/db";
import { mediaDriver } from "@/lib/media";
import { MAX_UPLOAD_BYTES, MediaValidationError, assertUploadAllowed } from "@/lib/media/types";
import { sniffImage } from "@/lib/media/inspect";

/**
 * Ingesting an upload into the Media table.
 *
 * Built on the Phase 1 driver abstraction, not around it: the bytes still go
 * through `mediaDriver.put()`, so switching MEDIA_DRIVER from local to s3
 * changes where uploads land with no change here and no schema change. What this
 * adds is the database record, the provenance, and the validation the driver
 * cannot do on its own.
 *
 * Order of operations is deliberate. Validate, then write the object, then
 * write the row — and if the row write fails, delete the object. The reverse
 * order would leave a Media row pointing at a file that does not exist, which
 * renders as a broken image on the storefront. An orphaned object with no row is
 * invisible and costs a few kilobytes.
 */

export class MediaUploadError extends Error {}

/** How much of the file to read before deciding what it is. */
const SNIFF_BYTES = 64 * 1024;

export type UploadedMedia = {
  id: string;
  storageKey: string;
  provider: "LOCAL" | "S3";
  width: number | null;
  height: number | null;
  mimeType: string;
};

/**
 * Validates and stores one uploaded file.
 *
 * The declared MIME type is checked first as a cheap rejection, then ignored:
 * what is actually written is the type the bytes prove they are. A file claiming
 * `image/png` that is really HTML is refused here, which matters because the
 * local driver writes into `public/`, where Next serves the result statically —
 * a non-image served from our own origin is a stored-XSS vector, not just a
 * broken thumbnail.
 */
export async function createMediaFromUpload(input: {
  file: File;
  altText: string | null;
  sourceNote: string | null;
}): Promise<UploadedMedia> {
  const { file } = input;

  if (!(file instanceof File) || file.size === 0) {
    throw new MediaUploadError("No file was received.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MediaUploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }

  // Cheap rejection on the declared type before reading the whole file into
  // memory. Not trusted — see below.
  try {
    assertUploadAllowed({ mimeType: file.type, sizeBytes: file.size });
  } catch (error) {
    throw new MediaUploadError(
      error instanceof MediaValidationError
        ? error.message
        : "That file type cannot be uploaded.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buffer.subarray(0, SNIFF_BYTES));

  if (!sniffed) {
    throw new MediaUploadError(
      "That file is not a JPEG, PNG, WebP or AVIF image. Its contents do not match an image format.",
    );
  }
  if (sniffed.mimeType !== file.type) {
    // Not fatal on its own — browsers disagree about `image/jpg` versus
    // `image/jpeg` — but worth recording, because a large gap between claimed
    // and actual is what a probing upload looks like.
    console.warn(
      `[media] declared type ${file.type} did not match sniffed type ${sniffed.mimeType}; using the sniffed value`,
    );
  }

  const stored = await mediaDriver.put({
    filename: file.name,
    mimeType: sniffed.mimeType,
    body: buffer,
  });

  try {
    const media = await db.media.create({
      data: {
        provider: stored.provider,
        storageKey: stored.storageKey,
        mimeType: sniffed.mimeType,
        sizeBytes: stored.sizeBytes,
        width: sniffed.width ?? null,
        height: sniffed.height ?? null,
        altText: input.altText,
        sourceNote: input.sourceNote,
        // Stored for searchability only. buildStorageKey() already derived the
        // real key from a random id, so this value never reaches a filesystem
        // path and cannot traverse anywhere.
        originalFilename: safeDisplayName(file.name),
      },
      select: {
        id: true,
        storageKey: true,
        provider: true,
        width: true,
        height: true,
        mimeType: true,
      },
    });

    return {
      id: media.id,
      storageKey: media.storageKey,
      provider: media.provider,
      width: media.width,
      height: media.height,
      mimeType: media.mimeType ?? sniffed.mimeType,
    };
  } catch (error) {
    // The object exists but the row does not. Remove the object so the two do
    // not drift; a failure here is logged rather than thrown, because the
    // original error is the one the operator needs to see.
    await mediaDriver.delete(stored.storageKey).catch((cleanupError) => {
      console.error("[media] failed to clean up orphaned object", stored.storageKey, cleanupError);
    });
    throw error;
  }
}

/**
 * Strips a filename down to something safe to display.
 *
 * Never used as a path — this is defence against the value being rendered, not
 * against traversal, which `buildStorageKey` already made impossible.
 */
function safeDisplayName(filename: string): string {
  return filename
    .replace(/[/\\]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
}

export type MediaUsage = {
  productImages: number;
  productOgImages: number;
  collectionHeroes: number;
  collectionOgImages: number;
  artistPhotos: number;
  campaignHeroes: number;
  landingHeroes: number;
  inquiryReferences: number;
  total: number;
};

/**
 * Everywhere an image is currently referenced.
 *
 * The delete flow needs this so the confirmation can say "this is used by three
 * products" rather than deleting silently. Two of these references cascade
 * (ProductImage, CustomOrderInquiryImage) and the rest null out, so a delete is
 * never destructive to the parent record — but it is destructive to the page
 * that was showing the picture, and the operator should know that first.
 */
export async function getMediaUsage(mediaId: string): Promise<MediaUsage> {
  const [
    productImages,
    productOgImages,
    collectionHeroes,
    collectionOgImages,
    artistPhotos,
    campaignHeroes,
    landingHeroes,
    inquiryReferences,
  ] = await Promise.all([
    db.productImage.count({ where: { mediaId } }),
    db.product.count({ where: { ogImageId: mediaId } }),
    db.collection.count({ where: { heroImageId: mediaId } }),
    db.collection.count({ where: { ogImageId: mediaId } }),
    db.artist.count({ where: { photoId: mediaId } }),
    db.campaign.count({ where: { heroImageId: mediaId } }),
    db.landingPage.count({ where: { heroImageId: mediaId } }),
    db.customOrderInquiryImage.count({ where: { mediaId } }),
  ]);

  const usage = {
    productImages,
    productOgImages,
    collectionHeroes,
    collectionOgImages,
    artistPhotos,
    campaignHeroes,
    landingHeroes,
    inquiryReferences,
  };

  return {
    ...usage,
    total: Object.values(usage).reduce((sum, count) => sum + count, 0),
  };
}

/**
 * Deletes the row, then the object.
 *
 * This order is the opposite of the upload path, for the same reason: a row
 * without an object renders broken, an object without a row is invisible. If
 * the storage delete fails the row is already gone and nothing on the site
 * references the file, so the failure is logged rather than surfaced — leaving
 * the row behind to keep them in sync would mean a "delete" that visibly did not
 * delete.
 */
export async function deleteMedia(mediaId: string): Promise<void> {
  const media = await db.media.findUnique({
    where: { id: mediaId },
    select: { id: true, storageKey: true },
  });
  if (!media) return;

  await db.media.delete({ where: { id: mediaId } });

  await mediaDriver.delete(media.storageKey).catch((error) => {
    console.error(
      `[media] row ${mediaId} deleted but object ${media.storageKey} could not be removed`,
      error,
    );
  });
}

/** The select shape every admin surface uses when it needs to render an image. */
export const MEDIA_REF_SELECT = {
  id: true,
  provider: true,
  storageKey: true,
  url: true,
  altText: true,
  width: true,
  height: true,
} as const;
