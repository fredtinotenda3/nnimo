import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_VALUES } from "@/lib/admin/schemas";
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
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  status: (typeof CAMPAIGN_STATUS_VALUES)[number];
  startDate: Date | null;
  endDate: Date | null;
  heroImage: AdminMediaRef | null;
  _count: { products: number; landingPages: number };
};

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("campaign:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const status = parseEnum(params, "status", CAMPAIGN_STATUS_VALUES);
  const pagination = parsePagination(params);

  const where = {
    ...(q ? { OR: [{ name: contains(q) }, { slug: contains(q) }, { description: contains(q) }] } : {}),
    ...(status ? { status } : {}),
  };

  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        startDate: true,
        endDate: true,
        heroImage: { select: { id: true, provider: true, storageKey: true, url: true, altText: true } },
        _count: { select: { products: true, landingPages: true } },
      },
    }),
    db.campaign.count({ where }),
  ]);

  const rows = campaigns as CampaignRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "status"]);
  const canWrite = can(user.role, "campaign:write");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Marketing"
        title="Campaigns"
        description="A campaign groups products or a range under one push, with its own landing pages and performance."
        actions={
          <div className="flex items-center gap-3">
            <Button asChild size="md" variant="outline">
              <Link href="/admin/campaigns/newsletter">Newsletter subscribers</Link>
            </Button>
            {canWrite ? (
              <Button asChild size="md">
                <Link href="/admin/campaigns/new">New campaign</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <FilterBar clearHref="/admin/campaigns" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Name or description" />
        </FilterField>
        <FilterField name="status" label="Status">
          <FilterSelect
            name="status"
            value={status}
            options={CAMPAIGN_STATUS_VALUES.map((value) => ({ value, label: CAMPAIGN_STATUS_LABEL[value] }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No campaigns match those filters" : "No campaigns yet"}
          description={
            filtered ? "Try a broader search, or clear the filters." : "Create a campaign to get started."
          }
          action={
            canWrite && !filtered ? (
              <Button asChild size="sm">
                <Link href="/admin/campaigns/new">New campaign</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">Campaigns with status, products and landing pages</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Landing pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MediaThumb media={campaign.heroImage} size={44} label={campaign.name} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/campaigns/${campaign.id}`}
                          className="text-body-sm font-medium hover:text-primary"
                        >
                          {campaign.name}
                        </Link>
                        <span className="text-metadata mt-1 block break-all text-muted-foreground">
                          /{campaign.slug}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={campaign.status === "ACTIVE" ? "success" : "neutral"}>
                      {CAMPAIGN_STATUS_LABEL[campaign.status]}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-metadata text-muted-foreground">
                    {campaign.startDate || campaign.endDate
                      ? [
                          campaign.startDate?.toISOString().slice(0, 10),
                          campaign.endDate?.toISOString().slice(0, 10),
                        ]
                          .filter(Boolean)
                          .join(" – ")
                      : "No dates set"}
                  </TableCell>

                  <TableNumericCell>{campaign._count.products}</TableNumericCell>
                  <TableNumericCell>{campaign._count.landingPages}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/campaigns" params={params} itemLabel="campaigns" />
        </>
      )}
    </div>
  );
}
