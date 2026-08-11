import "server-only";
import {
  assertUploadAllowed,
  buildStorageKey,
  type MediaDriver,
  type PutObjectInput,
  type StoredObject,
} from "@/lib/media/types";
import { env } from "@/lib/env";

/**
 * Production driver for any S3-compatible bucket (AWS S3, Cloudflare R2,
 * Backblaze B2).
 *
 * Intentionally not implemented in Phase 1: adding @aws-sdk/client-s3 before a
 * bucket exists would mean shipping ~2 MB of dependency and a credential shape
 * we cannot test against anything. The interface, key derivation, validation and
 * URL resolution are all here and shared with the local driver, so wiring this
 * up is one file and no changes anywhere else.
 *
 * When the bucket is provisioned:
 *   1. npm i @aws-sdk/client-s3
 *   2. implement put/delete with PutObjectCommand / DeleteObjectCommand
 *   3. set MEDIA_DRIVER=s3 and the MEDIA_S3_* variables
 * Objects should be written private and served through the CDN domain in
 * MEDIA_S3_PUBLIC_URL, not via a public bucket ACL.
 */
export const s3Driver: MediaDriver = {
  provider: "S3",

  async put({ filename, mimeType, body }: PutObjectInput): Promise<StoredObject> {
    assertUploadAllowed({ mimeType, sizeBytes: body.byteLength });
    void filename;
    void buildStorageKey;
    throw new Error(
      "The S3 media driver is not implemented yet. Set MEDIA_DRIVER=local, or implement lib/media/s3-driver.ts once the bucket exists.",
    );
  },

  async delete(): Promise<void> {
    throw new Error("The S3 media driver is not implemented yet.");
  },

  publicUrl(storageKey: string): string {
    const base = env.MEDIA_S3_PUBLIC_URL;
    if (!base) throw new Error("MEDIA_S3_PUBLIC_URL is not set.");
    return `${base.replace(/\/$/, "")}/${storageKey}`;
  },
};
