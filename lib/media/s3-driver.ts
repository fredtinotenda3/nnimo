import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { signS3Request } from "@/lib/media/sigv4";
import {
  assertUploadAllowed,
  buildStorageKey,
  MediaValidationError,
  type MediaDriver,
  type PutObjectInput,
  type StoredObject,
} from "@/lib/media/types";

/**
 * Production media driver for any S3-compatible bucket (AWS S3, Cloudflare R2,
 * Backblaze B2, MinIO).
 *
 * WHY THIS IS NOW IMPLEMENTED
 *
 * Phase 4 left this a stub, which meant there was no persistent media storage at
 * all: MEDIA_DRIVER=local writes into `public/media`, and on Vercel that
 * filesystem is ephemeral and per-instance. Every image an operator uploaded
 * would disappear on the next deploy, and would not be visible to other
 * instances in the meantime. That is not a production media system, so Phase 5D
 * required a real one.
 *
 * REQUEST SIGNING
 *
 * See lib/media/sigv4.ts for why this signs requests itself rather than pulling
 * in @aws-sdk/client-s3. The short version: two operations do not justify a 2 MB
 * dependency and a cold-start cost, and SigV4 is deterministic enough to unit
 * test without credentials.
 *
 * OBJECT SECURITY POSTURE
 *
 * Objects are written with NO public-read ACL. The bucket should be private and
 * served through the CDN domain in MEDIA_S3_PUBLIC_URL (CloudFront OAC, an R2
 * custom domain, or equivalent). A publicly-listable bucket lets anyone
 * enumerate every image ever uploaded, including ones detached from the site but
 * not yet deleted, and enumeration of a private studio's asset library is a real
 * disclosure even though each individual object is "just a photo".
 *
 * `Content-Type` is set from the SNIFFED type — the bytes — never from the
 * client's declared type, so a file cannot be served back as text/html. See
 * lib/admin/media.ts, which does the sniffing before calling put().
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** Endpoint for the bucket, virtual-hosted or path-style depending on config. */
function bucketEndpoint(): string {
  const bucket = env.MEDIA_S3_BUCKET;
  const region = env.MEDIA_S3_REGION;

  if (!bucket || !region) {
    throw new Error("MEDIA_S3_BUCKET and MEDIA_S3_REGION are required for the S3 driver.");
  }

  // A custom endpoint (R2, B2, MinIO) is used path-style: the bucket becomes the
  // first path segment. Providers differ here, and getting it wrong produces a
  // NoSuchBucket rather than an auth error, which is at least legible.
  if (env.MEDIA_S3_ENDPOINT) {
    const base = env.MEDIA_S3_ENDPOINT.replace(/\/$/, "");
    return `${base}/${bucket}`;
  }

  // AWS S3, virtual-hosted style.
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

function credentials(): { accessKeyId: string; secretAccessKey: string; region: string } {
  const accessKeyId = env.MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.MEDIA_S3_SECRET_ACCESS_KEY;
  const region = env.MEDIA_S3_REGION;

  if (!accessKeyId || !secretAccessKey || !region) {
    // lib/env.ts already refuses to boot with a half-configured S3 driver, so
    // reaching this means the driver was called with MEDIA_DRIVER=local.
    throw new Error("S3 credentials are not configured.");
  }
  return { accessKeyId, secretAccessKey, region };
}

/**
 * Reads an error response without letting it reach a user.
 *
 * S3 error bodies contain the bucket name, the request id and sometimes the key.
 * Useful in a log, never in a response — the caller turns this into a generic
 * message (see lib/admin/media.ts).
 */
async function describeFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return `${response.status} ${response.statusText}${text ? `: ${text.slice(0, 500)}` : ""}`;
}

export const s3Driver: MediaDriver = {
  provider: "S3",

  async put({ filename, mimeType, body }: PutObjectInput): Promise<StoredObject> {
    const sizeBytes = body.byteLength;
    assertUploadAllowed({ mimeType, sizeBytes });
    void filename; // the key is derived, never the client-supplied name

    const storageKey = buildStorageKey(mimeType);
    const { accessKeyId, secretAccessKey, region } = credentials();
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);

    const signed = signS3Request({
      method: "PUT",
      endpoint: bucketEndpoint(),
      key: storageKey,
      region,
      accessKeyId,
      secretAccessKey,
      body: payload,
      headers: {
        "content-type": mimeType,
        "content-length": String(sizeBytes),
        // Images are content-addressed by a random uuid key, so a given URL's
        // bytes never change. A year is safe and takes the CDN off the origin.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });

    const response = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await describeFailure(response);
      logger.error("media.s3_put_failed", { storageKey, detail });
      throw new MediaValidationError(
        "The image could not be stored. Please try again — if it keeps failing, check the media storage configuration.",
      );
    }

    logger.info("media.s3_put", { storageKey, sizeBytes, mimeType });
    return { provider: "S3", storageKey, mimeType, sizeBytes };
  },

  async delete(storageKey: string): Promise<void> {
    const { accessKeyId, secretAccessKey, region } = credentials();

    const signed = signS3Request({
      method: "DELETE",
      endpoint: bucketEndpoint(),
      key: storageKey,
      region,
      accessKeyId,
      secretAccessKey,
    });

    const response = await fetch(signed.url, {
      method: "DELETE",
      headers: signed.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // S3 returns 204 for a successful delete and, by design, also for a key that
    // was never there. 404 from an S3-compatible provider means the same thing.
    // Deleting twice is not an error — see lib/admin/media.ts, which deletes the
    // row first and treats storage cleanup as best-effort.
    if (!response.ok && response.status !== 404) {
      const detail = await describeFailure(response);
      logger.error("media.s3_delete_failed", { storageKey, detail });
      throw new Error("Object could not be deleted from storage.");
    }

    logger.info("media.s3_delete", { storageKey });
  },

  publicUrl(storageKey: string): string {
    const base = env.MEDIA_S3_PUBLIC_URL;
    if (!base) throw new Error("MEDIA_S3_PUBLIC_URL is not set.");
    return `${base.replace(/\/$/, "")}/${storageKey}`;
  },
};
