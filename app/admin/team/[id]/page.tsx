import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { TeamForm } from "@/components/admin/team-form";
import { MediaSelect, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Team member" };
export const dynamic = "force-dynamic";

type MediaOption = { id: string; altText: string | null; originalFilename: string | null; createdAt: Date };

export default async function EditTeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("artist:read");
  const { id } = await params;
  const query = await searchParams;

  const artist = await db.artist.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      craft: true,
      bio: true,
      photoId: true,
      featured: true,
      isActive: true,
      sortOrder: true,
      sourceNote: true,
      photo: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
      products: {
        orderBy: { name: "asc" },
        take: 30,
        select: { id: true, name: true, lifecycleStage: true },
      },
    },
  });

  if (!artist) notFound();

  const canWrite = can(user.role, "artist:write");
  const products = artist.products as { id: string; name: string; lifecycleStage: string }[];

  const media = (await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, altText: true, originalFilename: true, createdAt: true },
  })) as MediaOption[];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/team"
        backLabel="The team"
        title={artist.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{artist.role}</span>
            <Badge variant={artist.isActive ? "success" : "neutral"}>
              {artist.isActive ? "On the site" : "Hidden"}
            </Badge>
          </span>
        }
      />

      {query.created ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3 text-secondary">
          Team member added.
        </p>
      ) : null}

      {artist.sourceNote?.trim() ? (
        <div className="rounded-[var(--radius-md)] border border-border border-l-2 border-l-accent bg-surface p-5">
          <h2 className="text-heading-3">Source conflict</h2>
          <p className="text-body-sm mt-2 text-muted-foreground">{artist.sourceNote}</p>
          <p className="text-body-sm mt-3 text-muted-foreground">
            The role field below holds whatever is currently shown on the site. Change it
            once someone at the studio confirms which is right, and clear this note.
          </p>
        </div>
      ) : null}

      {canWrite ? (
        <TeamForm
          values={{
            id: artist.id,
            name: artist.name,
            role: artist.role,
            craft: artist.craft ?? "",
            bio: artist.bio ?? "",
            featured: artist.featured,
            isActive: artist.isActive,
            sortOrder: String(artist.sortOrder),
            sourceNote: artist.sourceNote ?? "",
          }}
          cancelHref="/admin/team"
          photoField={
            <div className="flex flex-col gap-2">
              <label htmlFor="field-photoId" className="text-label text-foreground">
                Photograph
              </label>
              <MediaSelect
                name="photoId"
                value={artist.photoId}
                current={artist.photo as AdminMediaRef | null}
                emptyLabel="No photograph"
                options={media.map((item) => ({ id: item.id, label: mediaLabel(item) }))}
              />
            </div>
          }
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          Your role can view the team but not change it.
        </p>
      )}

      {products.length > 0 ? (
        <AdminSection
          title="Pieces credited to them"
          description="Hiding someone from the site does not remove these credits."
        >
          <ul className="divide-y divide-border border-y border-border">
            {products.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-4 py-3">
                <Link
                  href={`/admin/products/${product.id}`}
                  className="text-body-sm hover:text-primary"
                >
                  {product.name}
                </Link>
                <Badge variant={product.lifecycleStage === "PUBLISHED" ? "success" : "neutral"}>
                  {product.lifecycleStage === "PUBLISHED" ? "Published" : "Not published"}
                </Badge>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}
    </div>
  );
}
