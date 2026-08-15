import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatPrice, PRICE_ON_REQUEST } from "@/lib/money";
import { AVAILABILITY_LABEL } from "@/lib/catalogue";
import { productGaps } from "@/lib/admin/completeness";
import {
  LIFECYCLE_LABEL,
  PRODUCT_AVAILABILITY_VALUES,
  PRODUCT_LIFECYCLE_VALUES,
} from "@/lib/admin/schemas";
import {
  contains,
  hasActiveFilters,
  pageInfo,
  parseEnum,
  parseId,
  parsePagination,
  parseSearch,
  type SearchParams,
} from "@/lib/admin/query";
import { PageHeader } from "@/components/admin/page-header";
import {
  FilterBar,
  FilterField,
  FilterSearch,
  FilterSelect,
  Pagination,
} from "@/components/admin/list-controls";
import { MediaThumb, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const PRICING_FILTERS = ["priced", "unpriced"] as const;
const COMPLETENESS_FILTERS = ["needs_image", "needs_description", "no_range", "unsellable"] as const;

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  lifecycleStage: "CATALOGUE" | "PUBLISHED" | "ARCHIVED";
  availability: keyof typeof AVAILABILITY_LABEL | null;
  price: { toString(): string; toFixed(dp: number): string } | null;
  currency: string;
  description: string | null;
  collectionId: string | null;
  collection: { name: string } | null;
  images: { isPrimary: boolean; media: AdminMediaRef }[];
  _count: { images: number };
};

/**
 * The catalogue.
 *
 * ~330 imported pieces, so every filter, sort and page is applied in Postgres
 * and only one page of rows crosses the wire (§20). Loading all of them to
 * filter in React would work today and stop working the moment the catalogue
 * doubles, by which point the fix is a rewrite rather than an adjustment.
 *
 * The completeness filters are the operationally useful ones: "which live pieces
 * cannot actually be bought" is the question the studio needs answered, and it
 * is a `where` clause, not a report anyone has to compile.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("product:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const stage = parseEnum(params, "stage", PRODUCT_LIFECYCLE_VALUES);
  const availability = parseEnum(params, "availability", PRODUCT_AVAILABILITY_VALUES);
  const collectionId = parseId(params, "collection");
  const pricing = parseEnum(params, "pricing", PRICING_FILTERS);
  const needs = parseEnum(params, "needs", COMPLETENESS_FILTERS);
  const pagination = parsePagination(params);

  const where = {
    ...(q
      ? {
          OR: [
            { name: contains(q) },
            { sku: contains(q) },
            { slug: contains(q) },
            { description: contains(q) },
          ],
        }
      : {}),
    ...(stage ? { lifecycleStage: stage } : {}),
    ...(availability ? { availability } : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(pricing === "priced" ? { price: { not: null } } : {}),
    ...(pricing === "unpriced" ? { price: null } : {}),
    ...(needs === "needs_image" ? { images: { none: {} } } : {}),
    ...(needs === "needs_description" ? { OR: [{ description: null }, { description: "" }] } : {}),
    ...(needs === "no_range" ? { collectionId: null } : {}),
    // Published but unbuyable: no confirmed price, or no availability at all.
    ...(needs === "unsellable"
      ? { lifecycleStage: "PUBLISHED" as const, OR: [{ price: null }, { availability: null }] }
      : {}),
  };

  const [products, total, collections] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      // Only the columns this list renders — not every field on every row.
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        lifecycleStage: true,
        availability: true,
        price: true,
        currency: true,
        description: true,
        collectionId: true,
        collection: { select: { name: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
          take: 1,
          select: {
            isPrimary: true,
            media: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
          },
        },
        _count: { select: { images: true } },
      },
    }),
    db.product.count({ where }),
    db.collection.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = products as ProductRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, [
    "q",
    "stage",
    "availability",
    "collection",
    "pricing",
    "needs",
  ]);
  const canWrite = can(user.role, "product:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="A piece existing in the catalogue does not mean it is for sale. Publishing, pricing and availability are separate decisions, all made here."
        actions={
          canWrite ? (
            <Button asChild size="md">
              <Link href="/admin/products/new">Add a piece</Link>
            </Button>
          ) : null
        }
      />

      <FilterBar clearHref="/admin/products" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-2">
          <FilterSearch value={q} placeholder="Name, SKU or description" />
        </FilterField>

        <FilterField name="collection" label="Range">
          <FilterSelect
            name="collection"
            value={collectionId}
            anyLabel="Any range"
            options={(collections as { id: string; name: string }[]).map((collection) => ({
              value: collection.id,
              label: collection.name,
            }))}
          />
        </FilterField>

        <FilterField name="stage" label="Stage">
          <FilterSelect
            name="stage"
            value={stage}
            options={PRODUCT_LIFECYCLE_VALUES.map((value) => ({
              value,
              label: LIFECYCLE_LABEL[value],
            }))}
          />
        </FilterField>

        <FilterField name="availability" label="Availability">
          <FilterSelect
            name="availability"
            value={availability}
            options={PRODUCT_AVAILABILITY_VALUES.map((value) => ({
              value,
              label: AVAILABILITY_LABEL[value],
            }))}
          />
        </FilterField>

        <FilterField name="pricing" label="Pricing">
          <FilterSelect
            name="pricing"
            value={pricing}
            options={[
              { value: "priced", label: "Has a price" },
              { value: "unpriced", label: "No price set" },
            ]}
          />
        </FilterField>

        <FilterField name="needs" label="Needs attention" className="lg:col-span-2">
          <FilterSelect
            name="needs"
            value={needs}
            anyLabel="Anything"
            options={[
              { value: "unsellable", label: "Published but not purchasable" },
              { value: "needs_image", label: "No photograph" },
              { value: "needs_description", label: "No description" },
              { value: "no_range", label: "Not in a range" },
            ]}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No pieces match those filters" : "No pieces yet"}
          description={
            filtered
              ? "Try a broader search, or clear the filters."
              : "Add a piece, or run `npm run db:seed` to import the catalogue from the supplied brochures."
          }
          action={
            canWrite && !filtered ? (
              <Button asChild size="sm">
                <Link href="/admin/products/new">Add a piece</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">
              Catalogue pieces with stage, price and outstanding gaps
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Piece</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Still needed</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((product) => {
                const gaps = productGaps({
                  lifecycleStage: product.lifecycleStage,
                  availability: product.availability,
                  price: product.price,
                  description: product.description,
                  collectionId: product.collectionId,
                  imageCount: product._count.images,
                  hasPrimaryImage: product.images.some((image) => image.isPrimary),
                });
                const primary = product.images[0]?.media ?? null;

                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MediaThumb media={primary} size={44} label={product.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="text-body-sm font-medium hover:text-primary"
                          >
                            {product.name}
                          </Link>
                          <span className="text-metadata mt-1 block text-muted-foreground">
                            {product.sku ?? "No SKU"}
                            {product.availability
                              ? ` · ${AVAILABILITY_LABEL[product.availability]}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {product.collection?.name ?? "—"}
                    </TableCell>

                    <TableCell>
                      <Badge variant={product.lifecycleStage === "PUBLISHED" ? "success" : "neutral"}>
                        {LIFECYCLE_LABEL[product.lifecycleStage]}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {gaps.length === 0 ? (
                        <span className="text-metadata text-muted-foreground">Complete</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {gaps.map((gap) => (
                            <Badge
                              key={gap.field}
                              variant={gap.severity === "blocking" ? "accent" : "neutral"}
                            >
                              {gap.label}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TableCell>

                    <TableNumericCell>
                      {formatPrice(product.price, product.currency) ?? (
                        <span className="text-metadata text-muted-foreground">{PRICE_ON_REQUEST}</span>
                      )}
                    </TableNumericCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/products" params={params} itemLabel="pieces" />
        </>
      )}
    </div>
  );
}
