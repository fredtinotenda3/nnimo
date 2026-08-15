import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { formatPrice } from "@/lib/money";
import { INQUIRY_STATUS_LABEL, INQUIRY_STATUS_VALUES } from "@/lib/admin/schemas";
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
import {
  FilterBar,
  FilterField,
  FilterSearch,
  FilterSelect,
  Pagination,
} from "@/components/admin/list-controls";
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

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

type InquiryRow = {
  id: string;
  customerName: string;
  email: string;
  organisation: string | null;
  requestType: string;
  quantity: number | null;
  quote: { toString(): string; toFixed(dp: number): string } | null;
  status: keyof typeof INQUIRY_STATUS_LABEL;
  createdAt: Date;
  _count: { referenceImages: number };
};

/**
 * Commission enquiries.
 *
 * These arrive from the Phase 2 /custom form and, because `requestType` is free
 * text in the schema, from /contact as well — a general enquiry shares the table
 * rather than needing its own model. The request type is shown as a column so
 * the two are still distinguishable at a glance.
 *
 * Open enquiries sort first regardless of age: an enquiry nobody has answered is
 * more urgent than one that was closed last week, and the default ordering
 * should match what the person opening this page is actually looking for.
 */
export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("custom_order:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const status = parseEnum(params, "status", INQUIRY_STATUS_VALUES);
  const pagination = parsePagination(params);

  const where = {
    ...(q
      ? {
          OR: [
            { customerName: contains(q) },
            { email: contains(q) },
            { organisation: contains(q) },
            { description: contains(q) },
            { requestType: contains(q) },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
  };

  const [inquiries, total, newCount, openCount] = await Promise.all([
    db.customOrderInquiry.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        customerName: true,
        email: true,
        organisation: true,
        requestType: true,
        quantity: true,
        quote: true,
        status: true,
        createdAt: true,
        _count: { select: { referenceImages: true } },
      },
    }),
    db.customOrderInquiry.count({ where }),
    db.customOrderInquiry.count({ where: { status: "NEW" } }),
    db.customOrderInquiry.count({ where: { status: { notIn: ["CLOSED", "DELIVERED"] } } }),
  ]);

  const rows = inquiries as InquiryRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "status"]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Enquiries"
        description={
          total === 0
            ? "Commission and general enquiries submitted through the site appear here."
            : `${newCount} new, ${openCount} still open.`
        }
      />

      <FilterBar clearHref="/admin/inquiries" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Name, email, organisation or description" />
        </FilterField>
        <FilterField name="status" label="Status">
          <FilterSelect
            name="status"
            value={status}
            options={INQUIRY_STATUS_VALUES.map((value) => ({
              value,
              label: INQUIRY_STATUS_LABEL[value],
            }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No enquiries match those filters" : "No enquiries yet"}
          description={
            filtered
              ? "Try a broader search, or clear the filters."
              : "Enquiries from the commission and contact forms appear here as soon as they are submitted."
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">
              Commission enquiries, open ones first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Wants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Quote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inquiry) => (
                <TableRow key={inquiry.id}>
                  <TableCell>
                    <Link
                      href={`/admin/inquiries/${inquiry.id}`}
                      className="text-body-sm font-medium hover:text-primary"
                    >
                      {inquiry.customerName}
                    </Link>
                    <span className="text-metadata mt-1 block break-all text-muted-foreground">
                      {inquiry.organisation ?? inquiry.email}
                    </span>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {inquiry.requestType}
                    {inquiry.quantity ? (
                      <span className="text-metadata mt-1 block">Quantity {inquiry.quantity}</span>
                    ) : null}
                    {inquiry._count.referenceImages > 0 ? (
                      <span className="text-metadata mt-1 block">
                        {inquiry._count.referenceImages} reference image
                        {inquiry._count.referenceImages === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={
                        inquiry.status === "NEW"
                          ? "accent"
                          : inquiry.status === "CLOSED" || inquiry.status === "DELIVERED"
                            ? "outline"
                            : "neutral"
                      }
                    >
                      {INQUIRY_STATUS_LABEL[inquiry.status]}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {inquiry.createdAt.toISOString().slice(0, 10)}
                  </TableCell>

                  <TableNumericCell>
                    {formatPrice(inquiry.quote) ?? (
                      <span className="text-metadata text-muted-foreground">Not quoted</span>
                    )}
                  </TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/inquiries" params={params} itemLabel="enquiries" />
        </>
      )}
    </div>
  );
}
