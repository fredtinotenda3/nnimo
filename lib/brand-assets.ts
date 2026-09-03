/**
 * ===========================================================================
 * BRAND IDENTITY ASSETS
 * ---------------------------------------------------------------------------
 * Everything referenced here is either a genuine photograph the business
 * supplied (the team photo) or brand/identity artwork (wordmark, tagline
 * lockup, motif texture) — never a product photograph standing in for real
 * catalogue imagery.
 *
 * A previous version of this file also exported several "product" images
 * (a giraffe tureen, an antelope vase, a leopard/sable/elephant range, a
 * "Big Five" piece, a "hero" tureen). Those were AI-generated, not real
 * photographs of Nnino ceramics, and have been removed along with the
 * corresponding files in public/brand/. Product, collection and team
 * photography now comes from two places only:
 *
 *  1. The `Media` table (uploaded via Admin → Media, attached to a specific
 *     product/collection/team member) — the normal, day-to-day path. Pages
 *     that used to reference the removed static images now pull a real,
 *     currently-published product photo instead (see app/(site)/page.tsx,
 *     app/(site)/about/page.tsx, app/(site)/custom/page.tsx) via MediaImage,
 *     which shows an honest "coming soon" panel if nothing is uploaded yet.
 *  2. Real supplied photography dropped into public/brand/ or public/images/
 *     as a named brand asset, exactly like this file's remaining exports.
 *
 * Nothing on the site should ever fall back to a generated or stock image.
 * ===========================================================================
 */

export type BrandImage = {
  src: string;
  width: number;
  height: number;
  /** Describes what is in the frame. No claims beyond that. */
  alt: string;
  /** Which supplied file this came from. */
  source: string;
};

export const WORDMARK = {
  src: "/brand/nnino-wordmark.png",
  width: 778,
  height: 226,
  alt: "Nnino Arts & Ceramics",
  source: "Supplied brand asset (business card artwork)",
} as const;

export const TAGLINE_MARK = {
  src: "/brand/nnino-tagline.png",
  width: 778,
  height: 93,
  alt: "Made By Hand, With Heart",
  source: "Supplied brand asset (business card artwork)",
} as const;

/** The brand's own motif texture. Used once, at low opacity. */
export const MOTIF = {
  src: "/brand/nnino-motif.png",
  width: 512,
  height: 210,
  alt: "",
  source: "Supplied brand asset (business card artwork)",
} as const;

const PHOTO = (
  name: string,
  width: number,
  height: number,
  alt: string,
  source: string,
): BrandImage => ({ src: `/brand/${name}.png`, width, height, alt, source });

/**
 * The Nnino team photographed with a display of finished work. This is a
 * genuine photograph, not generated — kept distinct from the deleted
 * "product" images described above.
 *
 * Deliberately not captioned with individual names: the photograph is
 * unlabelled and identifying people in it would be guesswork.
 */
export const TEAM_PHOTO = PHOTO(
  "nnino-team",
  1536,
  1024,
  "Members of the Nnino Ceramics team standing behind a table laid with finished hand-painted plates, cups, platters and sculptural pieces.",
  "Supplied photograph",
);
