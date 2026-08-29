import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { contains, pageInfo, parsePagination, parseSearch, type SearchParams } from "@/lib/admin/query";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, FilterField, FilterSearch, Pagination } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Newsletter subscribers" };
export const dynamic = "force-dynamic";

/**
 * Newsletter subscribers.
 *
 * Nested under /admin/campaigns rather than its own top-level nav entry —
 * ADMIN_SECTIONS (lib/admin-sections.ts) is deliberately kept to the sections
 * the brief actually asked to be navigable, and a subscriber list is
 * secondary to Campaigns, not a peer of it. Linked from the Campaigns list
 * page instead.
 */
export default async function NewsletterSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("campaign:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const pagination = parsePagination(params);

  const where = {
    ...(q ? { email: contains(q) } : {}),
  };

  const [subscribers, total, activeTotal] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: { id: true, email: true, source: true, consent: true, createdAt: true, unsubscribedAt: true },
    }),
    db.newsletterSubscriber.count({ where }),
    db.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
  ]);

  const info = pageInfo(pagination, total);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Marketing"
        title="Newsletter subscribers"
        backHref="/admin/campaigns"
        backLabel="Campaigns"
        description={`${activeTotal} currently subscribed, of ${total} total signups on record.`}
        actions={
          <Button asChild size="md" variant="outline">
            <Link href="/admin/campaigns/newsletter/export">Export CSV</Link>
          </Button>
        }
      />

      <FilterBar clearHref="/admin/campaigns/newsletter" hasFilters={Boolean(q)}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Email address" />
        </FilterField>
      </FilterBar>

      {subscribers.length === 0 ? (
        <EmptyState
          title={q ? "No subscribers match that search" : "No subscribers yet"}
          description={q ? "Try a different search, or clear it." : "Signups from the site footer will appear here."}
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">Newsletter subscribers</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signed up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((subscriber) => (
                <TableRow key={subscriber.id}>
                  <TableCell className="break-all font-medium">{subscriber.email}</TableCell>
                  <TableCell className="text-muted-foreground">{subscriber.source ?? "Not recorded"}</TableCell>
                  <TableCell>
                    <Badge variant={subscriber.unsubscribedAt ? "neutral" : "success"}>
                      {subscriber.unsubscribedAt ? "Unsubscribed" : "Subscribed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-metadata text-muted-foreground">
                    {subscriber.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/campaigns/newsletter" params={params} itemLabel="subscribers" />
        </>
      )}
    </div>
  );
}
