import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { LandingPageForm } from "@/components/admin/landing-page-form";
import { MediaSelect, mediaLabel } from "@/components/admin/media-fields";
import type { SearchParams } from "@/lib/admin/query";

export const metadata: Metadata = { title: "New landing page" };
export const dynamic = "force-dynamic";

export default async function NewLandingPagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("campaign:write");
  const params = await searchParams;
  const preselectedCampaignId = typeof params.campaignId === "string" ? params.campaignId : "";

  const [media, campaigns] = await Promise.all([
    db.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, altText: true, originalFilename: true, createdAt: true },
    }) as Promise<{ id: string; altText: string | null; originalFilename: string | null; createdAt: Date }[]>,
    db.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        backHref="/admin/landing-pages"
        backLabel="All landing pages"
        title="New landing page"
        description="Starts as a draft, invisible to the public. Set the status to Published when it's ready to go live at /c/{web address}."
      />

      <LandingPageForm
        values={{
          title: "",
          slug: "",
          campaignId: preselectedCampaignId,
          message: "",
          storyContent: "",
          cta: "",
          ctaLabel: "",
          status: "DRAFT",
          defaultUtmSource: "",
          defaultUtmMedium: "",
          defaultUtmCampaign: "",
          defaultUtmTerm: "",
          defaultUtmContent: "",
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
              value={null}
              current={null}
              options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
            />
          </div>
        }
      />
    </div>
  );
}
