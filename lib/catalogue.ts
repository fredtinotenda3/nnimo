import "server-only";
import { db } from "@/lib/db";
import { CollectionStatus, ProductLifecycleStage } from "@/lib/generated/prisma/enums";
import type { ProductAvailability } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DecimalLike } from "@/lib/money";

/**
 * The single place the public/draft boundary is defined.
 *
 * Every public query composes one of these constants rather than writing its own
 * `where`. That way "do not expose draft content" is enforced in one file
 * instead of being re-remembered on each new page — the failure mode being a
 * page that quietly leaks unpublished work.
 */
export const PUBLIC_PRODUCT_WHERE = {
  lifecycleStage: ProductLifecycleStage.PUBLISHED,
} as const;

export const PUBLIC_COLLECTION_WHERE = {
  status: CollectionStatus.PUBLISHED,
} as const;

/**
 * Shared product card select shape.
 *
 * The `satisfies` ensures the shape matches what Prisma expects while keeping
 * the type wide enough to be assigned to `select` in findMany/findFirst without
 * a `readonly` conflict.
 */
const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  currency: true,
  availability: true,
  heightCm: true,
  widthCm: true,
  weightKg: true,
  collection: { select: { name: true, slug: true } },
  images: {
    orderBy: [{ isPrimary: "desc" }, { position: "asc" }] as const,
    take: 1,
    select: {
      media: {
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
          width: true,
          height: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductCardData = Awaited<ReturnType<typeof getFeaturedProducts>>[number];

export async function getFeaturedProducts(limit = 6) {
  return db.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: CARD_SELECT,
  });
}

export async function getFeaturedCollections(limit = 6) {
  return db.collection.findMany({
    where: PUBLIC_COLLECTION_WHERE,
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      heroImage: {
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
        },
      },
      _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
    },
  });
}

/**
 * All published collections for the index.
 *
 * The product count is scoped to published products, so a range does not
 * advertise "12 pieces" and then show three.
 */
export async function getPublicCollections() {
  return db.collection.findMany({
    where: PUBLIC_COLLECTION_WHERE,
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      featured: true,
      heroImage: {
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
        },
      },
      _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
    },
  });
}

export async function getPublicCollectionBySlug(slug: string) {
  return db.collection.findFirst({
    where: { slug, ...PUBLIC_COLLECTION_WHERE },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      story: true,
      heroImage: {
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
          width: true,
          height: true,
        },
      },
      products: {
        where: PUBLIC_PRODUCT_WHERE,
        orderBy: [{ featured: "desc" }, { name: "asc" }],
        select: CARD_SELECT,
      },
    },
  });
}

export async function getRelatedCollections(excludeId: string, limit = 3) {
  return db.collection.findMany({
    where: { ...PUBLIC_COLLECTION_WHERE, id: { not: excludeId } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { products: { where: PUBLIC_PRODUCT_WHERE } } },
    },
  });
}

export async function getPublicProductBySlug(slug: string) {
  return db.product.findFirst({
    where: { slug, ...PUBLIC_PRODUCT_WHERE },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      description: true,
      story: true,
      material: true,
      careInstructions: true,
      heightCm: true,
      widthCm: true,
      weightKg: true,
      price: true,
      currency: true,
      availability: true,
      productionLeadTimeDays: true,
      updatedAt: true,
      collection: { select: { id: true, name: true, slug: true } },
      artist: { select: { name: true, role: true, craft: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
        select: {
          id: true,
          media: {
            select: {
              provider: true,
              storageKey: true,
              url: true,
              altText: true,
              width: true,
              height: true,
            },
          },
        },
      },
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
    },
  });
}

export async function getRelatedProducts(params: {
  productId: string;
  collectionId: string | null;
  limit?: number;
}) {
  const { productId, collectionId, limit = 4 } = params;

  // Same range first — that is the relationship customers actually browse by.
  const sameCollection = collectionId
    ? await db.product.findMany({
        where: { ...PUBLIC_PRODUCT_WHERE, collectionId, id: { not: productId } },
        orderBy: [{ featured: "desc" }, { name: "asc" }],
        take: limit,
        select: CARD_SELECT,
      })
    : [];

  if (sameCollection.length >= limit) return sameCollection;

  // Top up from the wider published catalogue rather than showing a short row.
  const exclude = [productId, ...sameCollection.map((p) => p.id)];
  const filler = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, id: { notIn: exclude } },
    orderBy: [{ featured: "desc" }, { name: "asc" }],
    take: limit - sameCollection.length,
    select: CARD_SELECT,
  });

  return [...sameCollection, ...filler];
}

/** Slugs for the sitemap. */
export async function getPublicSlugs() {
  const [products, collections] = await Promise.all([
    db.product.findMany({ where: PUBLIC_PRODUCT_WHERE, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({
      where: PUBLIC_COLLECTION_WHERE,
      select: { slug: true, updatedAt: true },
    }),
  ]);
  return { products, collections };
}

export async function getPublicTeam() {
  return db.artist.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      craft: true,
      bio: true,
      photo: {
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
          width: true,
          height: true,
        },
      },
    },
  });
}

/** Editable copy, keyed. Returns a lookup so a page needs one query, not five. */
export async function getContentBlocks(keys: string[]): Promise<Map<string, string>> {
  const blocks = await db.contentBlock.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const map = new Map<string, string>();
  for (const block of blocks) {
    if (block.value && block.value.trim()) map.set(block.key, block.value);
  }
  return map;
}

/** The global production lead time, used when a product does not override it. */
export async function getDefaultLeadTimeDays(): Promise<number | null> {
  const setting = await db.setting.findUnique({
    where: { key: "production.default_lead_time_days" },
    select: { value: true },
  });
  if (!setting) return null;
  const parsed = Number.parseInt(setting.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ---------------------------------------------------------------------------
// Availability presentation
// ---------------------------------------------------------------------------

export const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: "Available now",
  LOW_STOCK: "Only a few left",
  OUT_OF_STOCK: "Currently unavailable",
  MADE_TO_ORDER: "Made to order",
  CUSTOM_ONLY: "By commission",
  COMING_SOON: "Coming soon",
};

export function availabilityLabel(value: ProductAvailability | null): string | null {
  return value ? AVAILABILITY_LABEL[value] : null;
}

/**
 * Whether a piece can be added to a cart at all.
 *
 * Two independent conditions, both required: the business must have set an
 * availability that means "sellable" (not OUT_OF_STOCK/CUSTOM_ONLY/COMING_SOON),
 * AND a verified price must exist. A product can be published with a known
 * availability but no confirmed price yet — that combination must never be
 * purchasable, or the storefront would let someone buy something at a price
 * nobody actually set. See docs/architecture and the Phase 3 brief.
 */
export function isPurchasable(
  availability: ProductAvailability | null,
  price?: DecimalLike | null,
): boolean {
  const availabilityOk =
    availability === "IN_STOCK" || availability === "LOW_STOCK" || availability === "MADE_TO_ORDER";
  if (!availabilityOk) return false;
  // price is optional only for call sites that already know it's present
  // (e.g. a query that filtered on price not null). Any call site that has a
  // product's price on hand should always pass it.
  if (price === undefined) return true;
  return price !== null;
}