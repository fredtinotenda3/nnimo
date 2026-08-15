import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { evaluatePurchasability, PURCHASABILITY_MESSAGE } from "@/lib/commerce/purchasability";
import { productGaps } from "@/lib/admin/completeness";
import { decimalToInput, getCatalogueOptions } from "@/lib/admin/catalogue-options";
import { LIFECYCLE_LABEL } from "@/lib/admin/schemas";
import { setProductLifecycleAction, updateProductSeoAction } from "@/app/admin/products/actions";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageManager, type ProductImageRow } from "@/components/admin/product-image-manager";
import { SeoForm } from "@/components/admin/seo-form";
import { MediaSelect, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Edit piece" };
export const dynamic = "force-dynamic";

type MediaOption = {
  id: string;
  altText: string | null;
  originalFilename: string | null;
  createdAt: Date;
};

/**
 * One piece.
 *
 * Four independent forms rather than one: details, images, search settings and
 * lifecycle. They are genuinely separate decisions with separate permissions
 * consequences and separate audit entries, and combining them would mean
 * publishing a piece required re-saving its price.
 *
 * The purchasability panel at the top is the single most useful thing on the
 * page: it runs the same `evaluatePurchasability` the storefront and checkout
 * run, so the admin cannot disagree with what a customer actually experiences.
 */
export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("product:read");
  const { id } = await params;
  const query = await searchParams;

  const [product, options] = await Promise.all([
    db.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        collectionId: true,
        categoryId: true,
        artistId: true,
        description: true,
        story: true,
        material: true,
        careInstructions: true,
        heightCm: true,
        widthCm: true,
        weightKg: true,
        price: true,
        currency: true,
        lifecycleStage: true,
        availability: true,
        productionLeadTimeDays: true,
        featured: true,
        sourceNote: true,
        seoTitle: true,
        seoDescription: true,
        ogImageId: true,
        updatedAt: true,
        ogImage: {
          select: { id: true, provider: true, storageKey: true, url: true, altText: true },
        },
        images: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            isPrimary: true,
            media: {
              select: {
                id: true,
                provider: true,
                storageKey: true,
                url: true,
                altText: true,
                width: true,
                height: true,
                originalFilename: true,
                createdAt: true,
              },
            },
          },
        },
        inventory: { select: { onHand: true, reserved: true } },
      },
    }),
    getCatalogueOptions(),
  ]);

  if (!product) notFound();

  const images = product.images as ProductImageRow[];
  const attachedMediaIds = new Set(images.map((image) => image.media.id));

  // Capped rather than unbounded: the picker is a select, and a library of a
  // thousand images would be unusable as one anyway. The media library is the
  // place to work through the full set.
  const mediaPool = (await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, altText: true, originalFilename: true, createdAt: true },
  })) as MediaOption[];

  const availableMedia = mediaPool.filter((media) => !attachedMediaIds.has(media.id));

  const canWrite = can(user.role, "product:write");

  const purchasability = evaluatePurchasability({
    lifecycleStage: product.lifecycleStage,
    availability: product.availability,
    price: product.price,
    inventory: product.inventory,
  });

  const gaps = productGaps({
    lifecycleStage: product.lifecycleStage,
    availability: product.availability,
    price: product.price,
    description: product.description,
    collectionId: product.collectionId,
    imageCount: images.length,
    hasPrimaryImage: images.some((image) => image.isPrimary),
  });

  const auditEntries = (await db.auditLog.findMany({
    where: { entityType: "Product", entityId: product.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      action: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  })) as { id: string; action: string; createdAt: Date; user: { name: string } | null }[];

  const published = product.lifecycleStage === "PUBLISHED";

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/products"
        backLabel="All pieces"
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={published ? "success" : "neutral"}>
              {LIFECYCLE_LABEL[product.lifecycleStage]}
            </Badge>
            <Badge variant={purchasability.purchasable ? "success" : "outline"}>
              {purchasability.purchasable ? "Purchasable" : "Not purchasable"}
            </Badge>
            {product.featured ? <Badge variant="accent">Featured</Badge> : null}
          </span>
        }
        actions={
          published ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer">
                View on the site ↗
              </Link>
            </Button>
          ) : null
        }
      />

      {query.created ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3 text-secondary">
          Piece created. It is in the catalogue and not yet on the public site.
        </p>
      ) : null}

      {!purchasability.purchasable ? (
        <div className="rounded-[var(--radius-md)] border border-border border-l-2 border-l-accent bg-surface p-5">
          <h2 className="text-heading-3">This piece cannot currently be bought</h2>
          <p className="text-body-sm mt-2 text-muted-foreground">
            {PURCHASABILITY_MESSAGE[purchasability.reason]}
          </p>
          {gaps.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {gaps.map((gap) => (
                <li key={gap.field}>
                  <Badge variant={gap.severity === "blocking" ? "accent" : "neutral"}>
                    {gap.label}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {canWrite ? (
        <ProductForm
          values={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            sku: product.sku ?? "",
            collectionId: product.collectionId ?? "",
            categoryId: product.categoryId ?? "",
            artistId: product.artistId ?? "",
            description: product.description ?? "",
            story: product.story ?? "",
            material: product.material ?? "",
            careInstructions: product.careInstructions ?? "",
            heightCm: decimalToInput(product.heightCm),
            widthCm: decimalToInput(product.widthCm),
            weightKg: decimalToInput(product.weightKg),
            price: decimalToInput(product.price),
            currency: product.currency,
            availability: product.availability ?? "",
            productionLeadTimeDays:
              product.productionLeadTimeDays === null ? "" : String(product.productionLeadTimeDays),
            featured: product.featured,
            sourceNote: product.sourceNote ?? "",
          }}
          collections={options.collections}
          categories={options.categories}
          artists={options.artists}
          defaultCurrency={options.defaultCurrency}
          cancelHref="/admin/products"
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          Your role can view the catalogue but not change it.
        </p>
      )}

      <AdminSection
        title="Photographs"
        description="The primary image is what appears in listings and as the first image on the product page. The rest form the gallery, in the order below."
      >
        {canWrite ? (
          <ProductImageManager
            productId={product.id}
            productName={product.name}
            images={images}
            availableMedia={availableMedia}
          />
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {images.length === 0
              ? "No photographs."
              : `${images.length} photograph${images.length === 1 ? "" : "s"}.`}
          </p>
        )}
      </AdminSection>

      {canWrite ? (
        <AdminSection
          title="Search and sharing"
          description="Overrides for search results and link previews. Both optional."
        >
          <SeoForm
            action={updateProductSeoAction}
            id={product.id}
            values={{
              seoTitle: product.seoTitle ?? "",
              seoDescription: product.seoDescription ?? "",
            }}
            fallbackTitle={product.name}
            fallbackDescription={product.description ?? ""}
            mediaField={
              <div className="flex flex-col gap-2">
                <label htmlFor="field-ogImageId" className="text-label text-foreground">
                  Link preview image
                </label>
                <MediaSelect
                  name="ogImageId"
                  value={product.ogImageId}
                  current={product.ogImage as AdminMediaRef | null}
                  emptyLabel="Use the primary photograph"
                  options={mediaPool.map((media) => ({ id: media.id, label: mediaLabel(media) }))}
                />
              </div>
            }
          />
        </AdminSection>
      ) : null}

      {canWrite ? (
        <AdminSection
          title="Publishing"
          description="Catalogue pieces are invisible to customers. Archived pieces are kept for reference and history but never shown for sale."
        >
          <div className="flex flex-wrap gap-3">
            {(["CATALOGUE", "PUBLISHED", "ARCHIVED"] as const).map((stage) => (
              <form key={stage} action={setProductLifecycleAction}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="lifecycleStage" value={stage} />
                <Button
                  type="submit"
                  size="sm"
                  variant={product.lifecycleStage === stage ? "primary" : "outline"}
                  disabled={product.lifecycleStage === stage}
                >
                  {product.lifecycleStage === stage
                    ? `Currently ${LIFECYCLE_LABEL[stage].toLowerCase()}`
                    : `Move to ${LIFECYCLE_LABEL[stage].toLowerCase()}`}
                </Button>
              </form>
            ))}
          </div>
          {product.price === null ? (
            <p className="text-body-sm border-l-2 border-ochre pl-3 text-muted-foreground">
              This piece has no price. Publishing it is allowed — it will appear on the
              site with “{"Price on request"}” and an enquiry button — but nobody will be
              able to buy it until a price is set.
            </p>
          ) : null}
        </AdminSection>
      ) : null}

      <AdminSection title="History" description="Recent changes to this record.">
        {auditEntries.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No changes recorded since the audit log began.
          </p>
        ) : (
          <ol className="divide-y divide-border border-y border-border">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-4 py-3">
                <span className="text-body-sm">
                  {entry.action}
                  <span className="text-metadata ml-2 text-muted-foreground">
                    {entry.user?.name ?? "System"}
                  </span>
                </span>
                <span className="text-metadata shrink-0 tabular-nums text-muted-foreground">
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </AdminSection>
    </div>
  );
}
