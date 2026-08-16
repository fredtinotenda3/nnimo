import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  PUBLIC_COLLECTION_WHERE,
  PUBLIC_PRODUCT_WHERE,
  AVAILABILITY_LABEL,
} from "@/lib/catalogue";
import { breadcrumbJsonLd } from "@/lib/seo";
import { serialiseJsonLd } from "@/lib/security/json-ld";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "@/components/catalogue/product-card";
import { ShopFilters, SORT_OPTIONS } from "@/components/catalogue/shop-filters";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Hand-sculpted, hand-painted ceramics from the Nnino studio in Bulawayo, Zimbabwe. Browse by range and availability.",
  alternates: { canonical: "/shop" },
  openGraph: { title: "Shop · Nnino Ceramics", url: "/shop" },
};

export const dynamic = "force-dynamic";

const AVAILABILITY_VALUES = Object.keys(AVAILABILITY_LABEL);
const SORT_VALUES: string[] = SORT_OPTIONS.map((option) => option.value);

type OrderBy = Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];

function buildOrderBy(sort: string): OrderBy {
  switch (sort) {
    case "name-asc":
      return { name: "asc" };
    case "name-desc":
      return { name: "desc" };
    // Nulls last on both directions: "price ascending" must not open with 200
    // pieces that have no price yet.
    case "price-asc":
      return [{ price: "asc" }, { name: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { name: "asc" }];
    case "newest":
      return { createdAt: "desc" };
    default:
      return [{ featured: "desc" }, { name: "asc" }];
  }
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  // Every parameter is validated against a known set before it reaches Prisma.
  // Unrecognised values are dropped rather than echoed back into a query.
  const q = first(raw.q).trim().slice(0, 80);
  const collectionSlug = first(raw.collection).trim().slice(0, 120);
  const availabilityParam = first(raw.availability).trim();
  const availability = AVAILABILITY_VALUES.includes(availabilityParam)
    ? availabilityParam
    : "";
  const sortParam = first(raw.sort).trim();
  const sort = SORT_VALUES.includes(sortParam) ? sortParam : "featured";

  const where = {
    ...PUBLIC_PRODUCT_WHERE,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { collection: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(collectionSlug
      ? { collection: { slug: collectionSlug, ...PUBLIC_COLLECTION_WHERE } }
      : {}),
    ...(availability ? { availability: availability as never } : {}),
  };

  const [pieces, collections, totalPublished] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: buildOrderBy(sort),
      take: 60,
      select: {
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
          orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
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
      },
    }),
    db.collection.findMany({
      where: PUBLIC_COLLECTION_WHERE,
      orderBy: { sortOrder: "asc" },
      select: { name: true, slug: true },
    }),
    db.product.count({ where: PUBLIC_PRODUCT_WHERE }),
  ]);

  const filtered = Boolean(q || collectionSlug || availability);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serialiseJsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Shop", path: "/shop" },
            ]),
          ),
        }}
      />

      <Section className="pt-32 lg:pt-40">
        <p className="text-label text-muted-foreground">The catalogue</p>
        <h1 className="text-display mt-4">Shop</h1>
        <p className="text-body-lg mt-8 max-w-2xl text-muted-foreground">
          Every piece is made by hand, so no two are identical. Where a piece is made
          to order, the studio needs five to six weeks depending on drying conditions.
        </p>

        <ShopFilters
          className="mt-14"
          state={{ q, collection: collectionSlug, availability, sort }}
          collections={collections}
        />

        <div className="mt-10 flex items-baseline justify-between gap-4">
          <p className="text-metadata text-muted-foreground">
            {pieces.length === 1 ? "1 piece" : `${pieces.length} pieces`}
            {filtered && totalPublished > 0 ? ` of ${totalPublished}` : ""}
          </p>
        </div>

        <div className="mt-8">
          {pieces.length === 0 ? (
            filtered ? (
              <EmptyState
                title="Nothing matches those filters"
                description="Try a different range, or clear the filters to see everything currently published."
                action={
                  <Button asChild variant="outline" size="sm">
                    <a href="/shop">Clear filters</a>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No pieces are published yet"
                description="The full Nnino catalogue has been imported from the brochure and price list, but importing is not the same as offering something for sale. Each piece is published deliberately, from the admin."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin/products">Open the catalogue in admin</Link>
                  </Button>
                }
              />
            )
          ) : (
            <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {pieces.map((piece, index) => (
                <li key={piece.id}>
                  <ProductCard product={piece} priority={index < 3} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {pieces.length === 60 ? (
          <p className="text-body-sm mt-12 text-muted-foreground">
            Showing the first 60 pieces. Narrow by range to see more — pagination
            arrives with the cart in Phase 3.
          </p>
        ) : null}
      </Section>
    </>
  );
}
