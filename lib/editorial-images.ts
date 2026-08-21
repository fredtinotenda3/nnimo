/**
 * ===========================================================================
 * EDITORIAL IMAGE SLOT REGISTRY (Phase 9)
 * ---------------------------------------------------------------------------
 * See public/images/README.md for the full explanation. Short version: this
 * is a named list of *atmospheric/editorial* image slots — clay texture,
 * studio interior, hands at work — for photography that does not exist yet.
 *
 * Every slot below currently resolves to "not filled" because no file has
 * been placed at its path. Nothing on the live site depends on any of these
 * existing — `<EditorialImage>` renders a "coming soon" panel until a real
 * file lands at the named path. Adding a photograph later never requires
 * touching this list's consumers, only adding the file itself.
 *
 * This is deliberately server-only (uses `node:fs`) — it must be imported
 * from Server Components/pages only, the same as the rest of the app's data
 * layer.
 * ===========================================================================
 */

import fs from "node:fs";
import path from "node:path";

export type EditorialSlotKey =
  | "hero-alternate"
  | "craft-clay"
  | "craft-hands"
  | "craft-kiln"
  | "studio-interior"
  | "studio-exterior"
  | "custom-atmosphere"
  | "editorial-texture"
  | "collection-atmosphere"
  | "about-atmosphere"
  | "family-atmosphere"
  | "contact-atmosphere";

type EditorialSlotDefinition = {
  /** Path relative to /public/images/, and the folder it belongs in per the README table. */
  path: string;
  /** Alt text to use once the slot is filled. Written now so it ships with the photograph, not after. */
  alt: string;
};

const EDITORIAL_SLOTS: Record<EditorialSlotKey, EditorialSlotDefinition> = {
  "hero-alternate": { path: "hero/alternate.jfif", alt: "" },
  "craft-clay": { path: "craft/clay.jfif", alt: "" },
  "craft-hands": { path: "craft/hands.jfif", alt: "" },
  "craft-kiln": { path: "craft/kiln.jfif", alt: "" },
  "studio-interior": { path: "studio/interior.jfif", alt: "" },
  "studio-exterior": { path: "studio/exterior.jfif", alt: "" },
  "custom-atmosphere": { path: "custom/atmosphere.jfif", alt: "" },
  "editorial-texture": { path: "editorial/texture.jfif", alt: "" },
  "collection-atmosphere": { path: "collection-atmosphere/default.jfif", alt: "" },
  "about-atmosphere": { path: "about/atmosphere.jfif", alt: "" },
  "family-atmosphere": { path: "family/atmosphere.jfif", alt: "" },
  "contact-atmosphere": { path: "contact/atmosphere.jfif", alt: "" },
};

export type ResolvedEditorialImage =
  | { filled: true; src: string; alt: string }
  | { filled: false };

/**
 * Resolves a slot against the filesystem. Checked per-request rather than
 * cached at module scope: in dev this means dropping a file in is picked up
 * without a restart; in production the filesystem read is a single
 * `existsSync` call against a local disk, not a network request, so the cost
 * is negligible next to the render itself.
 */
export function resolveEditorialImage(slot: EditorialSlotKey): ResolvedEditorialImage {
  const definition = EDITORIAL_SLOTS[slot];
  const absolute = path.join(process.cwd(), "public", "images", definition.path);

  if (!fs.existsSync(absolute)) {
    return { filled: false };
  }

  return {
    filled: true,
    src: `/images/${definition.path}`,
    alt: definition.alt,
  };
}
