import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { collectionGaps } from "@/lib/admin/completeness";
import { COLLECTION_STATUS_LABEL, COLLECTION_STATUS_VALUES } from "@/lib/admin/schemas";
import {
  contains,
  hasActiveFilters,
  pageInfo,
  parseEnum,
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

export const metadata: Metadata = { title: "Collections" };
export const dynamic = "force-dynamic";

type CollectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featured: boolean;
  sortOrder: number;
  heroImage: AdminMediaRef | null;
  _count: { products: number };
  /** Published pieces only — the relation is filtered in the query. */
  products: { id: string }[];
};

/**
 * The ranges.
 *
 * The count that matters is published pieces, not total pieces: a range showing
 * "12 pieces" whose page renders three is the exact mismatch the public
 * catalogue query already avoids, and the admin should not disagree with it.
 * Both numbers are shown so the gap is visible rather than hidden.
 */
export default async function AdminCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("collection:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const status = parseEnum(params, "status", COLLECTION_STATUS_VALUES);
  const pagination = parsePagination(params);

  const where = {
    ...(q ? { OR: [{ name: contains(q) }, { slug: contains(q) }, { description: contains(q) }] } : {}),
    ...(status ? { status } : {}),
  };

  const [collections, total] = await Promise.all([
    db.collection.findMany({
      where,
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        featured: true,
        sortOrder: true,
        heroImage: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
        // Two different counts of the same relation. `_count` gives the total;
        // the filtered relation below gives the published subset as ids, counted
        // in memory. Prisma has no relation aliasing, so these cannot both be
        // `_count` — and the published number is the one that must match what a
        // customer sees, since the public range page filters the same way.
        _count: { select: { products: true } },
        products: {
          where: { lifecycleStage: "PUBLISHED" },
          select: { id: true },
        },
      },
    }),
    db.collection.count({ where }),
  ]);

  const rows = collections as CollectionRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "status"]);
  const canWrite = can(user.role, "collection:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Collections"
        description="Ranges group pieces on the public site. A published range shows only its published pieces."
        actions={
          canWrite ? (
            <Button asChild size="md">
              <Link href="/admin/collections/new">Add a range</Link>
            </Button>
          ) : null
        }
      />

      <FilterBar clearHref="/admin/collections" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Name or description" />
        </FilterField>
        <FilterField name="status" label="Status">
          <FilterSelect
            name="status"
            value={status}
            options={COLLECTION_STATUS_VALUES.map((value) => ({
              value,
              label: COLLECTION_STATUS_LABEL[value],
            }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No ranges match those filters" : "No ranges yet"}
          description={
            filtered
              ? "Try a broader search, or clear the filters."
              : "Add a range, or run `npm run db:seed` to import them from the supplied brochure."
          }
          action={
            canWrite && !filtered ? (
              <Button asChild size="sm">
                <Link href="/admin/collections/new">Add a range</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">Ranges with status and piece counts</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Still needed</TableHead>
                <TableHead className="text-right">Published</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((collection) => {
                const publishedCount = collection.products.length;
                const gaps = collectionGaps({
                  description: collection.description,
                  hasHeroImage: Boolean(collection.heroImage),
                  publishedProductCount: publishedCount,
                  status: collection.status,
                });

                return (
                  <TableRow key={collection.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MediaThumb media={collection.heroImage} size={44} label={collection.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/collections/${collection.id}`}
                            className="text-body-sm font-medium hover:text-primary"
                          >
                            {collection.name}
                          </Link>
                          <span className="text-metadata mt-1 block break-all text-muted-foreground">
                            /{collection.slug}
                          </span>
                        </div>
                        {collection.featured ? <Badge variant="accent">Featured</Badge> : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant={collection.status === "PUBLISHED" ? "success" : "neutral"}>
                        {COLLECTION_STATUS_LABEL[collection.status]}
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

                    <TableNumericCell>{publishedCount}</TableNumericCell>
                    <TableNumericCell className="text-muted-foreground">
                      {collection._count.products}
                    </TableNumericCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/collections" params={params} itemLabel="ranges" />
        </>
      )}
    </div>
  );
}
