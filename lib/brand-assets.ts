/**
 * ===========================================================================
 * REAL NNINO ASSETS
 * ---------------------------------------------------------------------------
 * Every file referenced here is a photograph or brand asset supplied by the
 * business. There are no stock images, no placeholders and no generated
 * imagery anywhere in this application.
 *
 * `alt` text describes only what is visibly in the frame. It never asserts
 * which catalogue SKU a piece is, because the supplied photographs are
 * unlabelled — see the note on ATTRIBUTION below.
 *
 * WHY public/ AND NOT THE MEDIA TABLE
 * These are brand and editorial assets: the wordmark, the studio photograph,
 * the motif. They are referenced by layout code at build time, are part of the
 * repository, and are not managed by the business day to day. Product and
 * collection photography is different — that goes through the `Media` table and
 * the media driver, so it can be uploaded, reordered and given alt text by the
 * team without a deploy.
 *
 * ATTRIBUTION
 * The giraffe tureen photographs plainly show a lidded giraffe tureen, and the
 * catalogue lists a "3D Small Tureen Giraffe Collection Vase". Tying the two
 * together would still be an inference, so these are used as collection-level
 * and editorial imagery only. If the business confirms the identification, one
 * admin action attaches them to that product record.
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
): BrandImage => ({ src: `/brand/${name}.webp`, width, height, alt, source });

export const HERO_PIECE = PHOTO(
  "hero-giraffe-tureen",
  810,
  1080,
  "A hand-sculpted lidded ceramic tureen. Giraffe figures are modelled around the body and lid, and the surface is hand-painted with botanical detail.",
  "Supplied photograph",
);

export const GIRAFFE_TUREEN_VIEWS: BrandImage[] = [
  PHOTO("giraffe-tureen-front", 810, 1080, "Front view of the hand-sculpted giraffe tureen, showing a painted flower on the body.", "Supplied photograph"),
  PHOTO("giraffe-tureen-floral", 810, 1080, "The giraffe tureen photographed from the side, with a large hand-painted pink flower.", "Supplied photograph"),
  PHOTO("giraffe-tureen-side", 810, 1080, "Side view of the giraffe tureen showing the modelled giraffe heads forming the lid handle.", "Supplied photograph"),
  PHOTO("giraffe-tureen-detail", 810, 1080, "Detail of the giraffe tureen, showing the sculpted and hand-painted giraffe figures.", "Supplied photograph"),
];

export const ANTELOPE_VASE = PHOTO(
  "antelope-vase",
  1200,
  1600,
  "A tall hand-thrown ceramic vase with antelope figures sculpted in relief climbing its sides, hand-painted with foliage.",
  "Supplied photograph",
);

/**
 * The Nnino team photographed with a display of finished work.
 *
 * Deliberately not captioned with individual names: the photograph is
 * unlabelled and identifying people in it would be guesswork.
 */
export const TEAM_PHOTO = PHOTO(
  "nnino-team",
  1080,
  720,
  "Members of the Nnino Ceramics team standing behind a table laid with finished hand-painted plates, cups, platters and sculptural pieces.",
  "Supplied photograph",
);

/** Editorial imagery, in the order the homepage uses it. */
export const EDITORIAL_PIECES: BrandImage[] = [HERO_PIECE, ANTELOPE_VASE, ...GIRAFFE_TUREEN_VIEWS];
