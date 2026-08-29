import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { CampaignForm } from "@/components/admin/campaign-form";
import { MediaSelect, mediaLabel } from "@/components/admin/media-fields";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requirePermission("campaign:write");

  const [media, collections] = await Promise.all([
    db.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, altText: true, originalFilename: true, createdAt: true },
    }) as Promise<{ id: string; altText: string | null; originalFilename: string | null; createdAt: Date }[]>,
    db.collection.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        backHref="/admin/campaigns"
        backLabel="All campaigns"
        title="New campaign"
        description="Campaigns start as drafts. Nothing changes on the public site until the status is set to active."
      />

      <CampaignForm
        values={{
          name: "",
          slug: "",
          description: "",
          collectionId: "",
          cta: "",
          ctaLabel: "",
          startDate: "",
          endDate: "",
          status: "DRAFT",
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
