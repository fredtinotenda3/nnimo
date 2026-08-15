import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { env } from "@/lib/env";
import {
  contains,
  hasActiveFilters,
  pageInfo,
  parseEnum,
  parsePagination,
  parseSearch,
  type SearchParams,
} from "@/lib/admin/query";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import {
  FilterBar,
  FilterField,
  FilterSearch,
  FilterSelect,
  Pagination,
} from "@/components/admin/list-controls";
import { MediaThumb, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import {
  MediaDeleteForm,
  MediaMetadataForm,
  MediaUploadForm,
} from "@/components/admin/media-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

const DESCRIBED_FILTERS = ["described", "undescribed"] as const;
const USAGE_FILTERS = ["used", "unused"] as const;

type MediaRow = AdminMediaRef & {
  originalFilename: string | null;
  sourceNote: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  _count: { productImages: number };
  productOgImages: { id: string }[];
  collectionHeroes: { id: string }[];
  collectionOgImages: { id: string }[];
  artistPhotos: { id: string }[];
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The media library.
 *
 * Built entirely on the Phase 1 driver abstraction — every URL comes from
 * `resolveMediaUrl`, every upload from `mediaDriver.put`, and nothing here knows
 * whether the bytes live on local disk or in a bucket. Moving to S3/R2 is a
 * change to MEDIA_DRIVER and five env vars, with no code change and no
 * migration; lib/env.ts already refuses to boot on a half-configured bucket.
 *
 * The "needs alt text" filter earns its place: an image without alt text is a
 * WCAG 1.1.1 failure on whatever page renders it, and it is invisible unless
 * something surfaces it.
 */
export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("media:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const described = parseEnum(params, "described", DESCRIBED_FILTERS);
  const usage = parseEnum(params, "usage", USAGE_FILTERS);
  const pagination = parsePagination(params, 20);

  // "Unused" means referenced by nothing at all — the same set the delete action
  // will allow through.
  const unusedWhere = {
    productImages: { none: {} },
    productOgImages: { none: {} },
    collectionHeroes: { none: {} },
    collectionOgImages: { none: {} },
    artistPhotos: { none: {} },
    campaignHeroes: { none: {} },
    landingHeroes: { none: {} },
    customInquiryRefs: { none: {} },
  };

  const where = {
    ...(q ? { OR: [{ altText: contains(q) }, { originalFilename: contains(q) }, { sourceNote: contains(q) }] } : {}),
    ...(described === "described" ? { altText: { not: null } } : {}),
    ...(described === "undescribed" ? { OR: [{ altText: null }, { altText: "" }] } : {}),
    ...(usage === "unused" ? unusedWhere : {}),
    ...(usage === "used"
      ? {
          NOT: unusedWhere,
        }
      : {}),
  };

  const [media, total, undescribedCount] = await Promise.all([
    db.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        provider: true,
        storageKey: true,
        url: true,
        altText: true,
        width: true,
        height: true,
        mimeType: true,
        sizeBytes: true,
        sourceNote: true,
        originalFilename: true,
        createdAt: true,
        _count: { select: { productImages: true } },
        productOgImages: { select: { id: true }, take: 1 },
        collectionHeroes: { select: { id: true }, take: 1 },
        collectionOgImages: { select: { id: true }, take: 1 },
        artistPhotos: { select: { id: true }, take: 1 },
      },
    }),
    db.media.count({ where }),
    db.media.count({ where: { OR: [{ altText: null }, { altText: "" }] } }),
  ]);

  const rows = media as MediaRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "described", "usage"]);
  const canWrite = can(user.role, "media:write");
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Assets"
        title="Media"
        description="Every image on the site. One file can be used by several pieces — attaching it to a product does not copy it."
        actions={
          returnTo?.startsWith("/admin/") ? (
            <Button asChild size="sm" variant="outline">
              <Link href={returnTo}>← Back to where you were</Link>
            </Button>
          ) : null
        }
      />

      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <p className="text-body-sm text-muted-foreground">
          Storage:{" "}
          <span className="text-foreground">
            {env.MEDIA_DRIVER === "s3" ? "S3-compatible bucket" : "Local disk (development)"}
          </span>
          {env.MEDIA_DRIVER === "local" ? (
            <>
              {" "}
              — files are written to <code>public/media</code>. This does not survive a
              redeploy on Vercel; set <code>MEDIA_DRIVER=s3</code> with bucket credentials
              before going live.
            </>
          ) : null}
        </p>
      </div>

      {canWrite ? (
        <AdminSection title="Upload" description="One image at a time, described as it goes in.">
          <div className="max-w-xl rounded-[var(--radius-md)] border border-border bg-surface p-5">
            <MediaUploadForm />
          </div>
        </AdminSection>
      ) : null}

      <AdminSection
        title="Library"
        description={
          undescribedCount > 0
            ? `${undescribedCount} image${undescribedCount === 1 ? "" : "s"} still need alt text.`
            : "Every image has alt text."
        }
      >
        <FilterBar clearHref="/admin/media" hasFilters={filtered}>
          <FilterField name="q" label="Search" className="lg:col-span-2">
            <FilterSearch value={q} placeholder="Alt text, filename or source" />
          </FilterField>
          <FilterField name="described" label="Alt text">
            <FilterSelect
              name="described"
              value={described}
              options={[
                { value: "undescribed", label: "Needs alt text" },
                { value: "described", label: "Described" },
              ]}
            />
          </FilterField>
          <FilterField name="usage" label="Usage">
            <FilterSelect
              name="usage"
              value={usage}
              options={[
                { value: "used", label: "In use" },
                { value: "unused", label: "Not used anywhere" },
              ]}
            />
          </FilterField>
        </FilterBar>

        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No images match those filters" : "No images yet"}
            description={
              filtered
                ? "Try a broader search, or clear the filters."
                : "Upload a photograph above. Until then, pieces render on the site as catalogue cards rather than broken images."
            }
          />
        ) : (
          <>
            <ul className="grid gap-5 lg:grid-cols-2">
              {rows.map((item) => {
                const usedCount =
                  item._count.productImages +
                  item.productOgImages.length +
                  item.collectionHeroes.length +
                  item.collectionOgImages.length +
                  item.artistPhotos.length;

                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-border bg-surface p-5 sm:flex-row"
                  >
                    <MediaThumb media={item} size={112} />

                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm truncate font-medium">{mediaLabel(item)}</p>
                      <p className="text-metadata mt-1 text-muted-foreground">
                        {item.width && item.height ? `${item.width}×${item.height} · ` : ""}
                        {formatBytes(item.sizeBytes)}
                        {item.mimeType ? ` · ${item.mimeType.replace("image/", "").toUpperCase()}` : ""}
                        {" · "}
                        {item.createdAt.toISOString().slice(0, 10)}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.altText?.trim() ? null : <Badge variant="accent">Needs alt text</Badge>}
                        <Badge variant={usedCount > 0 ? "neutral" : "outline"}>
                          {usedCount === 0
                            ? "Not used"
                            : `Used in ${usedCount} place${usedCount === 1 ? "" : "s"}`}
                        </Badge>
                      </div>

                      {canWrite ? (
                        <div className="mt-4 flex flex-col gap-4">
                          <MediaMetadataForm
                            id={item.id}
                            altText={item.altText ?? ""}
                            sourceNote={item.sourceNote ?? ""}
                          />
                          {usedCount === 0 ? (
                            <MediaDeleteForm id={item.id} label={mediaLabel(item)} />
                          ) : (
                            <p className="text-metadata text-muted-foreground">
                              In use, so it cannot be deleted. Remove it from those places first.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination info={info} basePath="/admin/media" params={params} itemLabel="images" />
          </>
        )}
      </AdminSection>
    </div>
  );
}
