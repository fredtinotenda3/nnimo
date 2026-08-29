import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { LANDING_PAGE_STATUS_LABEL, LANDING_PAGE_STATUS_VALUES } from "@/lib/admin/schemas";
import {
  contains,
  hasActiveFilters,
  pageInfo,
  parseEnum,
  parsePagination,
  parseSearch,
  type SearchParams,
} from "@/lib/admin/query";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, FilterField, FilterSearch, FilterSelect, Pagination } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Landing pages" };
export const dynamic = "force-dynamic";

type LandingPageRow = {
  id: string;
  title: string;
  slug: string;
  status: (typeof LANDING_PAGE_STATUS_VALUES)[number];
  campaign: { id: string; name: string } | null;
};

export default async function AdminLandingPagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("campaign:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const status = parseEnum(params, "status", LANDING_PAGE_STATUS_VALUES);
  const pagination = parsePagination(params);

  const where = {
    ...(q ? { OR: [{ title: contains(q) }, { slug: contains(q) }] } : {}),
    ...(status ? { status } : {}),
  };

  const [pages, total] = await Promise.all([
    db.landingPage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        campaign: { select: { id: true, name: true } },
      },
    }),
    db.landingPage.count({ where }),
  ]);

  const rows = pages as LandingPageRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "status"]);
  const canWrite = can(user.role, "campaign:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Marketing"
        title="Landing pages"
        description="Renders publicly at /c/{web address}. Draft and archived pages are not visible to the public, even with the direct link."
        actions={
          canWrite ? (
            <Button asChild size="md">
              <Link href="/admin/landing-pages/new">New landing page</Link>
            </Button>
          ) : null
        }
      />

      <FilterBar clearHref="/admin/landing-pages" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Title or web address" />
        </FilterField>
        <FilterField name="status" label="Status">
          <FilterSelect
            name="status"
            value={status}
            options={LANDING_PAGE_STATUS_VALUES.map((value) => ({
              value,
              label: LANDING_PAGE_STATUS_LABEL[value],
            }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No landing pages match those filters" : "No landing pages yet"}
          description={
            filtered ? "Try a broader search, or clear the filters." : "Create a landing page to get started."
          }
          action={
            canWrite && !filtered ? (
              <Button asChild size="sm">
                <Link href="/admin/landing-pages/new">New landing page</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">Landing pages with status and linked campaign</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((page) => (
                <TableRow key={page.id}>
                  <TableCell>
                    <Link href={`/admin/landing-pages/${page.id}`} className="text-body-sm font-medium hover:text-primary">
                      {page.title}
                    </Link>
                    <span className="text-metadata mt-1 block break-all text-muted-foreground">/c/{page.slug}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={page.status === "PUBLISHED" ? "success" : "neutral"}>
                      {LANDING_PAGE_STATUS_LABEL[page.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {page.campaign ? (
                      <Link href={`/admin/campaigns/${page.campaign.id}`} className="hover:text-primary">
                        {page.campaign.name}
                      </Link>
                    ) : (
                      "No campaign"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/landing-pages" params={params} itemLabel="landing pages" />
        </>
      )}
    </div>
  );
}
