import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { teamGaps } from "@/lib/admin/completeness";
import { PageHeader } from "@/components/admin/page-header";
import { MediaThumb, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  role: string;
  craft: string | null;
  bio: string | null;
  isActive: boolean;
  featured: boolean;
  sortOrder: number;
  sourceNote: string | null;
  photo: AdminMediaRef | null;
  _count: { products: number };
};

/**
 * The Nnino family.
 *
 * Small enough to list whole — ten people — so no pagination. The "still needed"
 * column reads as a worklist rather than an error report: an empty biography is
 * the correct recorded state for someone whose biography nobody has written, not
 * a defect.
 */
export default async function AdminTeamPage() {
  const user = await requirePermission("artist:read");

  const artists = (await db.artist.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      craft: true,
      bio: true,
      isActive: true,
      featured: true,
      sortOrder: true,
      sourceNote: true,
      photo: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
      _count: { select: { products: true } },
    },
  })) as TeamRow[];

  const canWrite = can(user.role, "artist:write");
  const missingBio = artists.filter((artist) => !artist.bio?.trim()).length;
  const missingPhoto = artists.filter((artist) => !artist.photo).length;
  const conflicts = artists.filter((artist) => artist.sourceNote?.trim()).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="The people"
        title="Nnino family"
        description={
          artists.length === 0
            ? "Nobody recorded yet."
            : `${artists.length} people. ${missingBio} still need a biography and ${missingPhoto} need a photograph — these were left empty at import rather than written on the studio's behalf.`
        }
        actions={
          canWrite ? (
            <Button asChild size="md">
              <Link href="/admin/team/new">Add someone</Link>
            </Button>
          ) : null
        }
      />

      {conflicts > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-border border-l-2 border-l-accent bg-surface p-5">
          <h2 className="text-heading-3">
            {conflicts === 1 ? "One record has" : `${conflicts} records have`} a source conflict
          </h2>
          <p className="text-body-sm mt-2 text-muted-foreground">
            The supplied documents disagree about something. The recorded note explains
            what; open the record to read it and set whichever the studio confirms.
          </p>
        </div>
      ) : null}

      {artists.length === 0 ? (
        <EmptyState
          title="No team members yet"
          description="Add someone, or run `npm run db:seed` to import the team from the supplied material."
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Team members with roles and outstanding content
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Still needed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {artists.map((artist) => {
              const gaps = teamGaps({
                bio: artist.bio,
                hasPhoto: Boolean(artist.photo),
                sourceNote: artist.sourceNote,
              });

              return (
                <TableRow key={artist.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MediaThumb media={artist.photo} size={44} label={artist.name} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/team/${artist.id}`}
                          className="text-body-sm font-medium hover:text-primary"
                        >
                          {artist.name}
                        </Link>
                        {artist._count.products > 0 ? (
                          <span className="text-metadata mt-1 block text-muted-foreground">
                            {artist._count.products} piece
                            {artist._count.products === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {artist.featured ? <Badge variant="accent">Featured</Badge> : null}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {artist.role}
                    {artist.craft ? (
                      <span className="text-metadata mt-1 block">{artist.craft}</span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <Badge variant={artist.isActive ? "success" : "neutral"}>
                      {artist.isActive ? "On the site" : "Hidden"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    {gaps.length === 0 ? (
                      <span className="text-metadata text-muted-foreground">Complete</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {gaps.map((gap) => (
                          <Badge key={gap.field} variant="neutral">
                            {gap.label}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
