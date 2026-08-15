import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { formatCents, toCents } from "@/lib/commerce/money";
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

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const CONSENT_FILTERS = ["yes", "no"] as const;

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  marketingConsent: boolean;
  createdAt: Date;
  _count: { orders: number };
  orders: {
    total: { toString(): string };
    currency: string;
    createdAt: Date;
    paymentStatus: string;
  }[];
};

/**
 * The customer directory.
 *
 * Total spend counts settled money only — PAID and PARTIALLY_REFUNDED. Counting
 * an abandoned checkout towards someone's lifetime value is how a CRM ends up
 * telling the studio a customer is worth three times what they actually spent.
 *
 * Guest orders are not customers. Checkout creates a Customer row when an email
 * is supplied and leaves guest details on the order otherwise, so this directory
 * is people the business can actually contact — which is what a directory is
 * for. Every order remains visible under Orders regardless.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("customer:read");
  const params = await searchParams;

  const q = parseSearch(params);
  const consent = parseEnum(params, "consent", CONSENT_FILTERS);
  const pagination = parsePagination(params);

  const where = {
    ...(q ? { OR: [{ name: contains(q) }, { email: contains(q) }, { phone: contains(q) }] } : {}),
    ...(consent === "yes" ? { marketingConsent: true } : {}),
    ...(consent === "no" ? { marketingConsent: false } : {}),
  };

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        marketingConsent: true,
        createdAt: true,
        _count: { select: { orders: true } },
        // Settled orders only, and only the three fields the totals need.
        orders: {
          where: { paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
          select: { total: true, currency: true, createdAt: true, paymentStatus: true },
        },
      },
    }),
    db.customer.count({ where }),
  ]);

  const rows = customers as CustomerRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "consent"]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Customers"
        description="People who have given the studio their details at checkout. Spend counts settled payments only."
      />

      <FilterBar clearHref="/admin/customers" hasFilters={filtered}>
        <FilterField name="q" label="Search" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="Name, email or phone" />
        </FilterField>
        <FilterField name="consent" label="Marketing consent">
          <FilterSelect
            name="consent"
            value={consent}
            options={[
              { value: "yes", label: "Given" },
              { value: "no", label: "Not given" },
            ]}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No customers match those filters" : "No customers yet"}
          description={
            filtered
              ? "Try a broader search, or clear the filters."
              : "A customer record is created the first time someone completes checkout with their details."
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">
              Customers with order counts and settled spend
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Marketing</TableHead>
                <TableHead>Latest order</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((customer) => {
                const paidOrders = customer.orders;
                const spendCents = paidOrders.reduce(
                  (sum, order) => sum + (toCents(order.total) ?? 0),
                  0,
                );
                const currency = paidOrders[0]?.currency ?? "USD";
                const latest = paidOrders.reduce<Date | null>(
                  (newest, order) =>
                    newest === null || order.createdAt > newest ? order.createdAt : newest,
                  null,
                );

                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="text-body-sm font-medium hover:text-primary"
                      >
                        {customer.name}
                      </Link>
                      <span className="text-metadata mt-1 block break-all text-muted-foreground">
                        {customer.email}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge variant={customer.marketingConsent ? "success" : "neutral"}>
                        {customer.marketingConsent ? "Consented" : "No consent"}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {latest ? latest.toISOString().slice(0, 10) : "No settled orders"}
                    </TableCell>

                    <TableNumericCell>{customer._count.orders}</TableNumericCell>
                    <TableNumericCell>{formatCents(spendCents, currency)}</TableNumericCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/customers" params={params} itemLabel="customers" />
        </>
      )}
    </div>
  );
}
