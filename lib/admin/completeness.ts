import type { ProductAvailability, ProductLifecycleStage } from "@/lib/generated/prisma/enums";

/**
 * "What is still missing from this record?"
 *
 * Pure functions with no database access, so the same rules drive the row badges
 * in the product list, the warnings on the edit form, the dashboard counters and
 * the tests. The alternative — each surface deciding for itself what "incomplete"
 * means — is how a piece ends up flagged as ready on the dashboard and
 * incomplete on its own edit page.
 *
 * The distinction that matters is BLOCKING versus ADVISORY. A missing price
 * blocks a sale outright (lib/commerce/purchasability.ts refuses it, whatever
 * this file says). A missing photograph does not — it renders as the catalogue
 * card fallback, which is deliberate and honest. Flagging both the same way
 * would train the team to ignore the flags.
 */

export type GapSeverity = "blocking" | "advisory";

export type Gap = {
  field: string;
  label: string;
  severity: GapSeverity;
};

export type ProductCompletenessInput = {
  lifecycleStage: ProductLifecycleStage;
  availability: ProductAvailability | null;
  price: unknown | null;
  description: string | null;
  collectionId: string | null;
  imageCount: number;
  hasPrimaryImage: boolean;
};

/**
 * Blocking gaps are the two conditions that make a published piece unsellable:
 * no verified price, and no availability. Both are states the import
 * deliberately left empty — most of the catalogue has neither — so this is not
 * an error report, it is a worklist.
 */
export function productGaps(product: ProductCompletenessInput): Gap[] {
  const gaps: Gap[] = [];

  if (product.price === null || product.price === undefined) {
    gaps.push({ field: "price", label: "No price set", severity: "blocking" });
  }
  if (product.lifecycleStage === "PUBLISHED" && product.availability === null) {
    gaps.push({ field: "availability", label: "No availability set", severity: "blocking" });
  }
  if (product.imageCount === 0) {
    gaps.push({ field: "images", label: "No photograph", severity: "advisory" });
  } else if (!product.hasPrimaryImage) {
    gaps.push({ field: "images", label: "No primary image chosen", severity: "advisory" });
  }
  if (!product.description || product.description.trim().length === 0) {
    gaps.push({ field: "description", label: "No description", severity: "advisory" });
  }
  if (!product.collectionId) {
    gaps.push({ field: "collection", label: "Not in a range", severity: "advisory" });
  }

  return gaps;
}

/** True when a piece could be published and immediately sold. */
export function isSaleReady(product: ProductCompletenessInput): boolean {
  return productGaps(product).every((gap) => gap.severity !== "blocking");
}

export function blockingGaps(product: ProductCompletenessInput): Gap[] {
  return productGaps(product).filter((gap) => gap.severity === "blocking");
}

/**
 * The specific case worth warning about loudly: a piece is live on the
 * storefront but cannot actually be bought. It is a legitimate state — Nnino
 * publishes catalogue pieces that are enquiry-only — but it should be a choice,
 * not an accident.
 */
export function isPublishedButUnsellable(product: ProductCompletenessInput): boolean {
  return product.lifecycleStage === "PUBLISHED" && blockingGaps(product).length > 0;
}

export type CollectionCompletenessInput = {
  description: string | null;
  hasHeroImage: boolean;
  publishedProductCount: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

/**
 * A published range containing nothing published is the one that actually
 * breaks a customer's journey: the range appears on /collections and the page
 * they land on is empty. Blocking, so it sorts to the top of the list.
 */
export function collectionGaps(collection: CollectionCompletenessInput): Gap[] {
  const gaps: Gap[] = [];

  if (collection.status === "PUBLISHED" && collection.publishedProductCount === 0) {
    gaps.push({ field: "products", label: "Published but has no published pieces", severity: "blocking" });
  }
  if (!collection.hasHeroImage) {
    gaps.push({ field: "heroImage", label: "No hero image", severity: "advisory" });
  }
  if (!collection.description || collection.description.trim().length === 0) {
    gaps.push({ field: "description", label: "No description", severity: "advisory" });
  }

  return gaps;
}

export type TeamCompletenessInput = {
  bio: string | null;
  hasPhoto: boolean;
  sourceNote: string | null;
};

/**
 * Team gaps are always advisory — never blocking.
 *
 * Ten real people were imported with the names and roles the source documents
 * actually state and nothing else. An empty biography is the correct recorded
 * state, not a defect, and the admin should read as a worklist for the studio
 * rather than as ten errors.
 */
export function teamGaps(member: TeamCompletenessInput): Gap[] {
  const gaps: Gap[] = [];
  if (!member.bio || member.bio.trim().length === 0) {
    gaps.push({ field: "bio", label: "No biography", severity: "advisory" });
  }
  if (!member.hasPhoto) {
    gaps.push({ field: "photo", label: "No photograph", severity: "advisory" });
  }
  if (member.sourceNote && member.sourceNote.trim().length > 0) {
    gaps.push({ field: "role", label: "Source conflict recorded", severity: "advisory" });
  }
  return gaps;
}
