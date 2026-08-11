import "server-only";
import { env } from "@/lib/env";
import { localDriver } from "@/lib/media/local-driver";
import { s3Driver } from "@/lib/media/s3-driver";
import type { MediaDriver } from "@/lib/media/types";
import type { MediaStorageProvider } from "@/lib/generated/prisma/enums";

export const mediaDriver: MediaDriver = env.MEDIA_DRIVER === "s3" ? s3Driver : localDriver;

/**
 * Resolves the URL for a stored image from provider + storageKey.
 *
 * Media.url is only a cache. Resolving here means the day the business moves
 * from local disk to a bucket, no rows need rewriting — the same records
 * suddenly resolve to CDN URLs.
 */
export function resolveMediaUrl(media: {
  provider: MediaStorageProvider;
  storageKey: string;
  url?: string | null;
}): string {
  if (media.provider === "S3") return s3Driver.publicUrl(media.storageKey);
  return localDriver.publicUrl(media.storageKey);
}

export * from "@/lib/media/types";
