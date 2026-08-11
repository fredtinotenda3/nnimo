import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertUploadAllowed,
  buildStorageKey,
  type MediaDriver,
  type PutObjectInput,
  type StoredObject,
} from "@/lib/media/types";

const ROOT = path.join(process.cwd(), "public", "media");

/**
 * Development driver: writes into public/media, which Next serves statically.
 *
 * Not for production. It does not survive a redeploy on Vercel (the filesystem
 * is ephemeral) and it cannot be shared between instances. It exists so the
 * whole media path — upload, record, render — can be exercised locally without
 * anyone needing bucket credentials.
 */
export const localDriver: MediaDriver = {
  provider: "LOCAL",

  async put({ filename, mimeType, body }: PutObjectInput): Promise<StoredObject> {
    const sizeBytes = body.byteLength;
    assertUploadAllowed({ mimeType, sizeBytes });
    void filename; // intentionally unused: the key is derived, never the client name

    const storageKey = buildStorageKey(mimeType);
    const absolute = path.join(ROOT, storageKey);

    // Defence in depth: even though buildStorageKey generates the name, refuse
    // anything that would resolve outside the media root.
    const normalised = path.normalize(absolute);
    if (!normalised.startsWith(ROOT + path.sep)) {
      throw new Error("Resolved media path escaped the media root.");
    }

    await mkdir(path.dirname(normalised), { recursive: true });
    await writeFile(normalised, body);

    return { provider: "LOCAL", storageKey, mimeType, sizeBytes };
  },

  async delete(storageKey: string): Promise<void> {
    const absolute = path.normalize(path.join(ROOT, storageKey));
    if (!absolute.startsWith(ROOT + path.sep)) {
      throw new Error("Resolved media path escaped the media root.");
    }
    await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },

  publicUrl(storageKey: string): string {
    return `/media/${storageKey}`;
  },
};
