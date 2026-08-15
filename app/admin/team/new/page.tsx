import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/admin/page-header";
import { TeamForm } from "@/components/admin/team-form";
import { MediaSelect, mediaLabel } from "@/components/admin/media-fields";

export const metadata: Metadata = { title: "Add a team member" };
export const dynamic = "force-dynamic";

export default async function NewTeamMemberPage() {
  await requirePermission("artist:write");

  const media = (await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, altText: true, originalFilename: true, createdAt: true },
  })) as { id: string; altText: string | null; originalFilename: string | null; createdAt: Date }[];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        backHref="/admin/team"
        backLabel="The team"
        title="Add someone"
        description="Only the name and role are required. Leave anything the studio has not confirmed blank."
      />

      <TeamForm
        values={{
          name: "",
          role: "",
          craft: "",
          bio: "",
          featured: false,
          isActive: true,
          sortOrder: "0",
          sourceNote: "",
        }}
        cancelHref="/admin/team"
        photoField={
          <div className="flex flex-col gap-2">
            <label htmlFor="field-photoId" className="text-label text-foreground">
              Photograph
            </label>
            <MediaSelect
              name="photoId"
              value={null}
              current={null}
              emptyLabel="No photograph"
              options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
            />
          </div>
        }
      />
    </div>
  );
}
