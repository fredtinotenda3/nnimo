import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { LANDING_PAGE_STATUS_LABEL } from "@/lib/admin/schemas";
import { PageHeader } from "@/components/admin/page-header";
import { LandingPageForm } from "@/components/admin/landing-page-form";
import { MediaSelect, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Edit landing page" };
export const dynamic = "force-dynamic";

type MediaOption = { id: string; altText: string | null; originalFilename: string | null; createdAt: Date };

export default async function EditLandingPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requirePermission("campaign:read");
  const { id } = await params;
  const query = await searchParams;

  const landingPage = await db.landingPage.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      campaignId: true,
      message: true,
      storyContent: true,
      cta: true,
      ctaLabel: true,
      status: true,
      heroImageId: true,
      heroImage: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
      defaultUtmSource: true,
      defaultUtmMedium: true,
      defaultUtmCampaign: true,
      defaultUtmTerm: true,
      defaultUtmContent: true,
    },
  });

  if (!landingPage) notFound();

  const canWrite = can(user.role, "campaign:write");

  const [media, campaigns] = await Promise.all([
    db.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, altText: true, originalFilename: true, createdAt: true },
    }) as Promise<MediaOption[]>,
    db.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/landing-pages"
        backLabel="All landing pages"
        title={landingPage.title}
        description={
          <Badge variant={landingPage.status === "PUBLISHED" ? "success" : "neutral"}>
            {LANDING_PAGE_STATUS_LABEL[landingPage.status as keyof typeof LANDING_PAGE_STATUS_LABEL]}
          </Badge>
        }
        actions={
          landingPage.status === "PUBLISHED" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/c/${landingPage.slug}`} target="_blank" rel="noreferrer">
                View on the site ↗
              </Link>
            </Button>
          ) : null
        }
      />

      {query.created ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3 text-secondary">
          Landing page created as a draft.
        </p>
      ) : null}

      {canWrite ? (
        <LandingPageForm
          values={{
            id: landingPage.id,
            title: landingPage.title,
            slug: landingPage.slug,
            campaignId: landingPage.campaignId ?? "",
            message: landingPage.message ?? "",
            storyContent: landingPage.storyContent ?? "",
            cta: landingPage.cta ?? "",
            ctaLabel: landingPage.ctaLabel ?? "",
            status: landingPage.status,
            defaultUtmSource: landingPage.defaultUtmSource ?? "",
            defaultUtmMedium: landingPage.defaultUtmMedium ?? "",
            defaultUtmCampaign: landingPage.defaultUtmCampaign ?? "",
            defaultUtmTerm: landingPage.defaultUtmTerm ?? "",
            defaultUtmContent: landingPage.defaultUtmContent ?? "",
          }}
          cancelHref="/admin/landing-pages"
          campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
          heroField={
            <div className="flex flex-col gap-2">
              <label htmlFor="field-heroImageId" className="text-label text-foreground">
                Hero image
              </label>
              <MediaSelect
                name="heroImageId"
                value={landingPage.heroImageId}
                current={landingPage.heroImage as AdminMediaRef | null}
                options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
              />
            </div>
          }
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">Your role can view landing pages but not change them.</p>
      )}
    </div>
  );
}
