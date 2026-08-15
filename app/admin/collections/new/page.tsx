import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { CollectionForm } from "@/components/admin/collection-form";
import { MediaSelect, mediaLabel } from "@/components/admin/media-fields";

export const metadata: Metadata = { title: "Add a range" };
export const dynamic = "force-dynamic";

export default async function NewCollectionPage() {
  await requirePermission("collection:write");

  const media = (await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, altText: true, originalFilename: true, createdAt: true },
  })) as { id: string; altText: string | null; originalFilename: string | null; createdAt: Date }[];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        backHref="/admin/collections"
        backLabel="All ranges"
        title="Add a range"
        description="Ranges start as drafts. Nothing appears on the public site until the status is set to published."
      />

      <CollectionForm
        values={{
          name: "",
          slug: "",
          description: "",
          story: "",
          status: "DRAFT",
          featured: false,
          sortOrder: "0",
          seoTitle: "",
          seoDescription: "",
        }}
        cancelHref="/admin/collections"
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
