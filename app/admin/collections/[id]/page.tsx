import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { contains, parseSearch, type SearchParams } from "@/lib/admin/query";
import { COLLECTION_STATUS_LABEL, LIFECYCLE_LABEL } from "@/lib/admin/schemas";
import { setCollectionMembershipAction } from "@/app/admin/collections/actions";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { CollectionForm } from "@/components/admin/collection-form";
import { MediaSelect, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filterControlClass } from "@/components/admin/list-controls";

export const metadata: Metadata = { title: "Edit range" };
export const dynamic = "force-dynamic";

type MediaOption = { id: string; altText: string | null; originalFilename: string | null; createdAt: Date };

type MemberRow = {
  id: string;
  name: string;
  sku: string | null;
  lifecycleStage: "CATALOGUE" | "PUBLISHED" | "ARCHIVED";
};

/**
 * One range.
 *
 * Membership is managed here rather than only from the product side, because
 * "put these eight pieces in the Zebra range" is the way the studio actually
 * thinks about it. The search box for adding pieces is server-side and capped —
 * offering all ~330 pieces in a select would be unusable, and loading them to
 * filter in the browser is the pattern §20 rules out.
 */
export default async function EditCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("collection:read");
  const { id } = await params;
  const query = await searchParams;
  const addQuery = parseSearch(query, "add");

  const collection = await db.collection.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      story: true,
      status: true,
      featured: true,
      sortOrder: true,
      heroImageId: true,
      seoTitle: true,
      seoDescription: true,
      heroImage: {
        select: { id: true, provider: true, storageKey: true, url: true, altText: true },
      },
      products: {
        orderBy: [{ lifecycleStage: "asc" }, { name: "asc" }],
        select: { id: true, name: true, sku: true, lifecycleStage: true },
      },
    },
  });

  if (!collection) notFound();

  const members = collection.products as MemberRow[];
  const publishedCount = members.filter((p) => p.lifecycleStage === "PUBLISHED").length;
  const canWrite = can(user.role, "collection:write");

  const media = (await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, altText: true, originalFilename: true, createdAt: true },
  })) as MediaOption[];

  // Only searched, never listed wholesale. An empty search shows nothing, which
  // is the honest response to "which of 330 pieces do you mean".
  const candidates = addQuery
    ? ((await db.product.findMany({
        where: {
          collectionId: null,
          OR: [{ name: contains(addQuery) }, { sku: contains(addQuery) }],
        },
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, sku: true, lifecycleStage: true },
      })) as MemberRow[])
    : [];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/collections"
        backLabel="All ranges"
        title={collection.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={collection.status === "PUBLISHED" ? "success" : "neutral"}>
              {COLLECTION_STATUS_LABEL[collection.status as keyof typeof COLLECTION_STATUS_LABEL]}
            </Badge>
            <span className="text-metadata text-muted-foreground">
              {publishedCount} published of {members.length} pieces
            </span>
          </span>
        }
        actions={
          collection.status === "PUBLISHED" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/collections/${collection.slug}`} target="_blank" rel="noreferrer">
                View on the site ↗
              </Link>
            </Button>
          ) : null
        }
      />

      {query.created ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3 text-secondary">
          Range created as a draft.
        </p>
      ) : null}

      {canWrite ? (
        <CollectionForm
          values={{
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            description: collection.description ?? "",
            story: collection.story ?? "",
            status: collection.status,
            featured: collection.featured,
            sortOrder: String(collection.sortOrder),
            seoTitle: collection.seoTitle ?? "",
            seoDescription: collection.seoDescription ?? "",
          }}
          cancelHref="/admin/collections"
          publishedProductCount={publishedCount}
          heroField={
            <div className="flex flex-col gap-2">
              <label htmlFor="field-heroImageId" className="text-label text-foreground">
                Hero image
              </label>
              <MediaSelect
                name="heroImageId"
                value={collection.heroImageId}
                current={collection.heroImage as AdminMediaRef | null}
                options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
              />
            </div>
          }
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          Your role can view ranges but not change them.
        </p>
      )}

      <AdminSection
        title="Pieces in this range"
        description="Removing a piece from a range does not delete it — it simply stops belonging to any range."
      >
        {members.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No pieces in this range yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {members.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="text-body-sm font-medium hover:text-primary"
                  >
                    {product.name}
                  </Link>
                  <span className="text-metadata mt-1 block text-muted-foreground">
                    {product.sku ?? "No SKU"}
                  </span>
                </div>
                <Badge variant={product.lifecycleStage === "PUBLISHED" ? "success" : "neutral"}>
                  {LIFECYCLE_LABEL[product.lifecycleStage]}
                </Badge>
                {canWrite ? (
                  <form action={setCollectionMembershipAction}>
                    <input type="hidden" name="collectionId" value={collection.id} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="action" value="remove" />
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                      <span className="sr-only"> {product.name} from this range</span>
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {canWrite ? (
        <AdminSection
          title="Add a piece"
          description="Search pieces that are not currently in any range."
        >
          <form method="get" role="search" className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1">
              <label htmlFor="add" className="text-label text-muted-foreground">
                Search
              </label>
              <input
                id="add"
                name="add"
                type="search"
                defaultValue={addQuery}
                placeholder="Name or SKU"
                className={`${filterControlClass} mt-2`}
              />
            </div>
            <Button type="submit" size="md" variant="outline">
              Search
            </Button>
          </form>

          {addQuery ? (
            candidates.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                No unassigned pieces match “{addQuery}”. A piece already in another range
                must be moved from its own page.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {candidates.map((product) => (
                  <li key={product.id} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-body-sm font-medium">{product.name}</span>
                      <span className="text-metadata mt-1 block text-muted-foreground">
                        {product.sku ?? "No SKU"}
                      </span>
                    </div>
                    <Badge variant="neutral">{LIFECYCLE_LABEL[product.lifecycleStage]}</Badge>
                    <form action={setCollectionMembershipAction}>
                      <input type="hidden" name="collectionId" value={collection.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="action" value="add" />
                      <Button type="submit" size="sm" variant="outline">
                        Add
                        <span className="sr-only"> {product.name} to this range</span>
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </AdminSection>
      ) : null}
    </div>
  );
}
