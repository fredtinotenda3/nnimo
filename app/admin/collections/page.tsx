import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { CollectionStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Collections" };
export const dynamic = "force-dynamic";

type BadgeTone = "neutral" | "success" | "outline";

const STATUS_LABEL: Record<CollectionStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_TONE: Record<CollectionStatus, BadgeTone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "outline",
};

function statusLabel(status: CollectionStatus): string {
  return STATUS_LABEL[status];
}

function statusTone(status: CollectionStatus): BadgeTone {
  return STATUS_TONE[status];
}

export default async function AdminCollectionsPage() {
  await requirePermission("collection:read");

  const collections = await db.collection.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      featured: true,
      sortOrder: true,
      _count: { select: { products: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-label text-muted-foreground">Catalogue</p>
        <h1 className="text-heading-1 mt-3">Collections</h1>
        <p className="text-body-sm mt-4 max-w-2xl text-muted-foreground">
          Every range named in the Nnino brochure, imported in document order. All are
          drafts: the brochure shows a range existed, not that it is currently in
          production.
        </p>
      </header>

      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Run `npm run db:seed` to import the ranges from the supplied brochure."
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            All collections with status and product counts
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Range</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pieces</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collections.map((collection) => (
              <TableRow key={collection.id}>
                <TableCell>
                  <span className="font-medium">{collection.name}</span>
                  {collection.featured ? (
                    <Badge variant="accent" className="ml-2">
                      Featured
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{collection.slug}</TableCell>
                <TableCell>
                  <Badge variant={statusTone(collection.status)}>
                    {statusLabel(collection.status)}
                  </Badge>
                </TableCell>
                <TableNumericCell>{collection._count.products}</TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
