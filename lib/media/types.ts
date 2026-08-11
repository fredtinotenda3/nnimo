import type { MediaStorageProvider } from "@/lib/generated/prisma/enums";

export type StoredObject = {
  provider: MediaStorageProvider;
  /** Path relative to the driver's root. The durable identifier for the file. */
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

export type PutObjectInput = {
  /** Original filename — used only to derive a safe extension. */
  filename: string;
  mimeType: string;
  body: Buffer | Uint8Array;
};

/**
 * One interface, two implementations. Everything that references an image goes
 * through the `Media` table, so switching driver is a config change plus a
 * one-off copy of the objects — no schema change and no table rewrite.
 */
export interface MediaDriver {
  readonly provider: MediaStorageProvider;
  put(input: PutObjectInput): Promise<StoredObject>;
  delete(storageKey: string): Promise<void>;
  /** Public URL for a stored object. Derived, never persisted as the truth. */
  publicUrl(storageKey: string): string;
}

/** Only these are accepted for upload. Whitelist, not blacklist. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export class MediaValidationError extends Error {}

/**
 * Builds the storage key. The filename supplied by the client is never used as
 * a path: the extension is taken from the validated MIME type and the name is a
 * random id, which removes path traversal, content-type confusion and
 * collisions in one move.
 */
export function buildStorageKey(mimeType: string, prefix = "uploads"): string {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    throw new MediaValidationError(`Unsupported image type: ${mimeType}`);
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();
  return `${prefix}/${yyyy}/${mm}/${id}.${extension}`;
}

export function assertUploadAllowed(input: { mimeType: string; sizeBytes: number }): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new MediaValidationError(
      `Only JPEG, PNG, WebP and AVIF images can be uploaded (received ${input.mimeType}).`,
    );
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new MediaValidationError(
      `Image is ${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (input.sizeBytes <= 0) {
    throw new MediaValidationError("Image is empty.");
  }
}
