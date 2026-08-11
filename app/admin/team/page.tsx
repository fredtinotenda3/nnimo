import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
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

/**
 * The Nnino family. Names and roles are the only fields the source material
 * establishes, so biography, craft, story and photograph are all empty and
 * flagged as such. Writing plausible-sounding biographies for ten real people
 * would be inventing facts about them.
 */
export default async function AdminTeamPage() {
  await requirePermission("artist:read");

  const artists = await db.artist.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      craft: true,
      bio: true,
      photoId: true,
      isActive: true,
    },
  });

  const missingBio = artists.filter((a) => !a.bio).length;
  const missingPhoto = artists.filter((a) => !a.photoId).length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-label text-muted-foreground">The people</p>
        <h1 className="text-heading-1 mt-3">Nnino family</h1>
        <p className="text-body-sm mt-4 max-w-2xl text-muted-foreground">
          {artists.length} team members, with the names and roles given in the supplied
          material. {missingBio} still need a biography and {missingPhoto} need a
          photograph — these were left empty rather than written for them.
        </p>
      </header>

      {artists.length === 0 ? (
        <EmptyState
          title="No team members yet"
          description="Run `npm run db:seed` to import the team from the supplied material."
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Team members with roles and content completeness
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Craft</TableHead>
              <TableHead>Biography</TableHead>
              <TableHead>Photograph</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {artists.map((artist) => (
              <TableRow key={artist.id}>
                <TableCell className="font-medium">{artist.name}</TableCell>
                <TableCell className="text-muted-foreground">{artist.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {artist.craft ?? "—"}
                </TableCell>
                <TableCell>
                  {artist.bio ? (
                    <Badge variant="success">Written</Badge>
                  ) : (
                    <Badge variant="neutral">Needed</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {artist.photoId ? (
                    <Badge variant="success">Uploaded</Badge>
                  ) : (
                    <Badge variant="neutral">Needed</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
