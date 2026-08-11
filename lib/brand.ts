/**
 * Verified business facts, transcribed from the supplied source documents.
 *
 * Provenance for every value is noted inline. Nothing here is inferred: where
 * the documents disagree (the street name is spelled two different ways) both
 * are recorded and the brochure — the more formal document — wins for display.
 *
 * These are constants rather than CMS content because they are contact details
 * used by the layout at build time. Editable marketing copy lives in the
 * ContentBlock table instead.
 */
export const BRAND = {
  name: "Nnino Ceramics",
  /** Nnimo.pdf p.1 and repeated on every catalogue page. */
  tagline: "Made By Hand, With Heart",
  /** Nnino Ceramics Brochure-1.pdf p.1. */
  founder: "Mary Filannino",
  city: "Bulawayo",
  country: "Zimbabwe",
  /**
   * Brochure p.88: "25 Waverley Road, Thorngrove, Bulawayo".
   * Nnimo.pdf p.1 spells it "25 Waverly Road Thorngroove" — same address.
   */
  addressLines: ["25 Waverley Road", "Thorngrove", "Bulawayo", "Zimbabwe"],
  /** Brochure p.88. */
  telephone: "+263 29 2260200",
  /** Nnimo.pdf p.1. */
  whatsapp: "+263 779 347 541",
  emails: {
    /** Brochure p.88. */
    general: "nnino.ceramics@gmail.com",
    /** Nnimo.pdf p.1. */
    sales: "marion.nninoceramics@gmail.com",
  },
  social: {
    /** Brochure p.88 lists the Facebook page name and Instagram handle. */
    facebook: "Nnino Ceramics",
    instagram: "nninoceramics",
  },
  /** Nnimo.pdf p.2: "we are a team of 10 people". */
  teamSize: 10,
  /**
   * Nnimo.pdf p.2: "Each one Piece from creating to a finished product takes
   * about 5 to 6 weeks or so depending the weather, if it's winter takes longer
   * to dry if it's Summer dries quicker."
   *
   * Stored as a Setting row (production.default_lead_time_days) so the team can
   * change it; this constant is only the seed value.
   */
  defaultProductionLeadTimeDays: 42,
} as const;

export function whatsappLink(message?: string): string {
  const digits = BRAND.whatsapp.replace(/\D/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}
