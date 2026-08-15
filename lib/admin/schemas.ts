import { z } from "zod";
import {
  checkbox,
  currencyCode,
  intWithDefault,
  optionalDecimal,
  optionalInt,
  optionalText,
  requiredText,
} from "@/lib/admin/forms";
import { isValidSlug } from "@/lib/admin/slug";

/**
 * Server-side validation for every admin form.
 *
 * In `lib` rather than beside the actions so the rules can be unit tested
 * without importing a `"use server"` module — and so there is one place to read
 * to know what the admin will accept.
 *
 * These are the ONLY validation that counts. The forms also carry `required`,
 * `maxlength` and `type="email"`, which are a courtesy to the person typing;
 * they are trivially bypassed and are never relied on (§15 of the brief).
 *
 * Two rules recur and are worth stating once:
 *
 *  - Blank optional fields become null, never "". A biography nobody has written
 *    must stay NULL, because that is what the admin renders as "still needed"
 *    and what keeps the site from displaying an empty paragraph.
 *
 *  - Money is validated as a string and never parsed to a JS number. The column
 *    is NUMERIC(10,2); passing through a float is how a price becomes 149.99999.
 */

const SLUG_MESSAGE = "Use lower-case letters, numbers and hyphens only";

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, "Slugs must be under 80 characters")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null)
  .refine((value) => value === null || isValidSlug(value), SLUG_MESSAGE);

/** A cuid from a `<select>`. Empty means "none", which is a legitimate choice. */
const optionalId = z
  .string()
  .trim()
  .max(60)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const idParam = z.string().trim().min(1).max(60);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const PRODUCT_LIFECYCLE_VALUES = ["CATALOGUE", "PUBLISHED", "ARCHIVED"] as const;

export const PRODUCT_AVAILABILITY_VALUES = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "MADE_TO_ORDER",
  "CUSTOM_ONLY",
  "COMING_SOON",
] as const;

export const productSchema = z.object({
  name: requiredText(2, 160, "Name"),
  slug: slugField,
  sku: optionalText(60),
  collectionId: optionalId,
  categoryId: optionalId,
  artistId: optionalId,
  description: optionalText(4000),
  story: optionalText(4000),
  material: optionalText(200),
  careInstructions: optionalText(2000),
  heightCm: optionalDecimal({ max: 9999, label: "Height" }),
  widthCm: optionalDecimal({ max: 9999, label: "Width" }),
  weightKg: optionalDecimal({ max: 9999, label: "Weight" }),
  price: optionalDecimal({ max: 99_999_999, label: "Price" }),
  currency: currencyCode,
  // Blank is meaningful: a catalogue-stage piece genuinely has no availability
  // yet, and forcing a value would make the team assert something untrue.
  availability: z
    .enum(PRODUCT_AVAILABILITY_VALUES)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null))
    .transform((value) => value ?? null),
  productionLeadTimeDays: optionalInt({ max: 365, label: "Lead time" }),
  featured: checkbox,
  sourceNote: optionalText(500),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productSeoSchema = z.object({
  // 60-70 characters is what Google renders before truncating; the cap is
  // advisory in the UI and hard here only to keep the column sane.
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
  ogImageId: optionalId,
});

export const productLifecycleSchema = z.object({
  id: idParam,
  lifecycleStage: z.enum(PRODUCT_LIFECYCLE_VALUES),
});

// ---------------------------------------------------------------------------
// Product images
// ---------------------------------------------------------------------------

export const attachImageSchema = z.object({
  productId: idParam,
  mediaId: idParam,
});

export const imagePositionSchema = z.object({
  productId: idParam,
  imageId: idParam,
  direction: z.enum(["up", "down"]),
});

export const setPrimaryImageSchema = z.object({
  productId: idParam,
  imageId: idParam,
});

export const detachImageSchema = z.object({
  productId: idParam,
  imageId: idParam,
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const COLLECTION_STATUS_VALUES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const collectionSchema = z.object({
  name: requiredText(2, 160, "Name"),
  slug: slugField,
  description: optionalText(2000),
  story: optionalText(4000),
  heroImageId: optionalId,
  status: z.enum(COLLECTION_STATUS_VALUES),
  featured: checkbox,
  sortOrder: intWithDefault(0, { min: -9999, max: 9999, label: "Sort order" }),
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
  ogImageId: optionalId,
});

export const collectionMembershipSchema = z.object({
  collectionId: idParam,
  productId: idParam,
  action: z.enum(["add", "remove"]),
});

// ---------------------------------------------------------------------------
// Team (Artist)
// ---------------------------------------------------------------------------

export const teamSchema = z.object({
  name: requiredText(2, 120, "Name"),
  // Free text, not an enum. The source material describes roles as "Potter",
  // "Sculptor", "Kiln, glazing and packing" — a fixed list would force ten real
  // people into categories the business never chose. It is also why the Marion
  // Moyo conflict can be recorded rather than resolved.
  role: requiredText(2, 120, "Role"),
  craft: optionalText(120),
  bio: optionalText(4000),
  photoId: optionalId,
  featured: checkbox,
  isActive: checkbox,
  sortOrder: intWithDefault(0, { min: -9999, max: 9999, label: "Display order" }),
  sourceNote: optionalText(500),
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Name, phone, consent and internal notes only.
 *
 * Email is deliberately absent: it is the unique key that ties a customer to
 * their orders and to the access tokens in their confirmation emails. Editing it
 * from the admin would silently break a customer's order links, and there is no
 * business reason for an operator to need it. Nothing about payment is editable
 * or displayed anywhere in this section.
 */
export const customerSchema = z.object({
  name: requiredText(2, 160, "Name"),
  phone: optionalText(40),
  marketingConsent: checkbox,
  notes: optionalText(4000),
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const mediaMetadataSchema = z.object({
  id: idParam,
  // Capped at 200 because alt text longer than that stops being an alternative
  // and starts being a description a screen reader user has to sit through.
  altText: optionalText(200),
  sourceNote: optionalText(300),
});

export const mediaUploadMetadataSchema = z.object({
  altText: optionalText(200),
  sourceNote: optionalText(300),
});

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export const CONTENT_TYPE_VALUES = ["TEXT", "RICH_TEXT", "IMAGE", "JSON"] as const;

export const contentBlockSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3, "A key is required")
    .max(120)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Use lower-case words separated by dots, e.g. about.intro"),
  type: z.enum(CONTENT_TYPE_VALUES),
  value: optionalText(20_000),
  mediaId: optionalId,
});

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

/**
 * The Phase 1 lifecycle, reused verbatim.
 *
 * The brief suggested NEW → REVIEWING → QUOTED → ACCEPTED → IN_PRODUCTION →
 * COMPLETED → DECLINED, but `CustomOrderStatus` already models the same journey
 * with two states the suggestion lacks: PAYMENT (quote accepted, money not yet
 * taken) and DELIVERED (made and handed over, distinct from COMPLETED). Adding a
 * parallel enum would mean a migration, a mapping, and two vocabularies for one
 * process — so the existing one stands, as §11 allows.
 */
export const INQUIRY_STATUS_VALUES = [
  "NEW",
  "REVIEWING",
  "QUOTED",
  "APPROVED",
  "PAYMENT",
  "IN_PRODUCTION",
  "COMPLETED",
  "DELIVERED",
  "CLOSED",
] as const;

export const inquiryUpdateSchema = z.object({
  id: idParam,
  status: z.enum(INQUIRY_STATUS_VALUES),
  quote: optionalDecimal({ max: 99_999_999, label: "Quote" }),
  internalNotes: optionalText(5000),
});

export const WHOLESALE_STATUS_VALUES = ["NEW", "REVIEWING", "QUOTED", "APPROVED", "CLOSED"] as const;

export const wholesaleUpdateSchema = z.object({
  id: idParam,
  status: z.enum(WHOLESALE_STATUS_VALUES),
  internalNotes: optionalText(5000),
});

// ---------------------------------------------------------------------------
// Presentation labels
// ---------------------------------------------------------------------------

export const LIFECYCLE_LABEL: Record<(typeof PRODUCT_LIFECYCLE_VALUES)[number], string> = {
  CATALOGUE: "Catalogue",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const COLLECTION_STATUS_LABEL: Record<(typeof COLLECTION_STATUS_VALUES)[number], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const INQUIRY_STATUS_LABEL: Record<(typeof INQUIRY_STATUS_VALUES)[number], string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  PAYMENT: "Awaiting payment",
  IN_PRODUCTION: "In production",
  COMPLETED: "Completed",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
};

export const WHOLESALE_STATUS_LABEL: Record<(typeof WHOLESALE_STATUS_VALUES)[number], string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  CLOSED: "Closed",
};

export const CONTENT_TYPE_LABEL: Record<(typeof CONTENT_TYPE_VALUES)[number], string> = {
  TEXT: "Short text",
  RICH_TEXT: "Long text",
  IMAGE: "Image",
  JSON: "Structured",
};
