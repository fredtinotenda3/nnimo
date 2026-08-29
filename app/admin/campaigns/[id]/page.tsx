import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { contains, parseSearch, type SearchParams } from "@/lib/admin/query";
import { CAMPAIGN_STATUS_LABEL, LANDING_PAGE_STATUS_LABEL, LIFECYCLE_LABEL } from "@/lib/admin/schemas";
import { setCampaignProductAction } from "@/app/admin/campaigns/actions";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { CampaignForm } from "@/components/admin/campaign-form";
import { MediaSelect, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filterControlClass } from "@/components/admin/list-controls";

export const metadata: Metadata = { title: "Edit campaign" };
export const dynamic = "force-dynamic";

type MediaOption = { id: string; altText: string | null; originalFilename: string | null; createdAt: Date };

type MemberRow = {
  id: string;
  name: string;
  sku: string | null;
  lifecycleStage: "CATALOGUE" | "PUBLISHED" | "ARCHIVED";
};

function toDateInputValue(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/**
 * One campaign.
 *
 * Product assignment is a join table (CampaignProduct), unlike a range's
 * single Product.collectionId — a piece can run in more than one campaign
 * at once — so "add a piece" searches everything not ALREADY in THIS
 * campaign, not everything with no campaign at all.
 */
export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("campaign:read");
  const { id } = await params;
  const query = await searchParams;
  const addQuery = parseSearch(query, "add");

  const campaign = await db.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      status: true,
      collectionId: true,
      cta: true,
      ctaLabel: true,
      startDate: true,
      endDate: true,
      heroImageId: true,
      heroImage: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
      products: {
        select: {
          product: { select: { id: true, name: true, sku: true, lifecycleStage: true } },
        },
      },
      landingPages: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, slug: true, status: true },
      },
    },
  });

  if (!campaign) notFound();

  const members = campaign.products.map((row) => row.product) as MemberRow[];
  const memberIds = new Set(members.map((m) => m.id));
  const canWrite = can(user.role, "campaign:write");

  const [media, collections] = await Promise.all([
    db.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, altText: true, originalFilename: true, createdAt: true },
    }) as Promise<MediaOption[]>,
    db.collection.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const candidates = addQuery
    ? ((await db.product.findMany({
        where: {
          id: { notIn: [...memberIds] },
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
        backHref="/admin/campaigns"
        backLabel="All campaigns"
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={campaign.status === "ACTIVE" ? "success" : "neutral"}>
              {CAMPAIGN_STATUS_LABEL[campaign.status as keyof typeof CAMPAIGN_STATUS_LABEL]}
            </Badge>
            <span className="text-metadata text-muted-foreground">
              {members.length} products · {campaign.landingPages.length} landing pages
            </span>
          </span>
        }
        actions={
          canWrite ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/landing-pages/new?campaignId=${campaign.id}`}>New landing page</Link>
            </Button>
          ) : null
        }
      />

      {query.created ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3 text-secondary">
          Campaign created as a draft.
        </p>
      ) : null}

      {canWrite ? (
        <CampaignForm
          values={{
            id: campaign.id,
            name: campaign.name,
            slug: campaign.slug,
            description: campaign.description ?? "",
            collectionId: campaign.collectionId ?? "",
            cta: campaign.cta ?? "",
            ctaLabel: campaign.ctaLabel ?? "",
            startDate: toDateInputValue(campaign.startDate),
            endDate: toDateInputValue(campaign.endDate),
            status: campaign.status,
          }}
          cancelHref="/admin/campaigns"
          collections={collections.map((c) => ({ id: c.id, label: c.name }))}
          heroField={
            <div className="flex flex-col gap-2">
              <label htmlFor="field-heroImageId" className="text-label text-foreground">
                Hero image
              </label>
              <MediaSelect
                name="heroImageId"
                value={campaign.heroImageId}
                current={campaign.heroImage as AdminMediaRef | null}
                options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
              />
            </div>
          }
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">Your role can view campaigns but not change them.</p>
      )}

      <AdminSection
        title="Products in this campaign"
        description="Removing a product from a campaign does not affect its range or the product itself."
      >
        {members.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No products assigned to this campaign yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {members.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${product.id}`} className="text-body-sm font-medium hover:text-primary">
                    {product.name}
                  </Link>
                  <span className="text-metadata mt-1 block text-muted-foreground">{product.sku ?? "No SKU"}</span>
                </div>
                <Badge variant={product.lifecycleStage === "PUBLISHED" ? "success" : "neutral"}>
                  {LIFECYCLE_LABEL[product.lifecycleStage]}
                </Badge>
                {canWrite ? (
                  <form action={setCampaignProductAction}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="action" value="remove" />
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                      <span className="sr-only"> {product.name} from this campaign</span>
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {canWrite ? (
        <AdminSection title="Add a product" description="Search for a product to assign to this campaign.">
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
                No products match “{addQuery}” that aren&apos;t already in this campaign.
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
                    <form action={setCampaignProductAction}>
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="action" value="add" />
                      <Button type="submit" size="sm" variant="outline">
                        Add
                        <span className="sr-only"> {product.name} to this campaign</span>
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </AdminSection>
      ) : null}

      <AdminSection
        title="Landing pages"
        description="Advertising landing pages that point at this campaign."
      >
        {campaign.landingPages.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No landing pages for this campaign yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {campaign.landingPages.map((page) => (
              <li key={page.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/landing-pages/${page.id}`} className="text-body-sm font-medium hover:text-primary">
                    {page.title}
                  </Link>
                  <span className="text-metadata mt-1 block break-all text-muted-foreground">/c/{page.slug}</span>
                </div>
                <Badge variant={page.status === "PUBLISHED" ? "success" : "neutral"}>
                  {LANDING_PAGE_STATUS_LABEL[page.status as keyof typeof LANDING_PAGE_STATUS_LABEL]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
