import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import {
  buildQuery,
  hasActiveFilters,
  pageInfo,
  parsePagination,
  parseSearch,
  firstParam,
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

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
  user: { name: string; email: string } | null;
};

/**
 * The audit log.
 *
 * Gated on `audit:read`, which only OWNER holds. That is deliberate and dates
 * from Phase 1: reading the audit log and managing users are the two
 * capabilities that would let somebody quietly escalate or check whether their
 * tracks were covered, so MANAGER — who runs the business day to day — has
 * neither.
 *
 * Metadata is rendered as a short summary rather than raw JSON. Audit entries
 * are written by application code with deliberately narrow metadata (ids,
 * booleans, before/after values for money), and none of it holds payment
 * payloads or credentials — but rendering arbitrary stored JSON verbatim is a
 * habit that goes wrong the first time somebody logs something they should not
 * have, so it is summarised instead.
 */
function summarise(metadata: unknown): string {
  if (metadata === null || typeof metadata !== "object") return "—";
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return "—";

  return entries
    .slice(0, 4)
    .map(([key, value]) => {
      const rendered =
        typeof value === "string"
          ? value.length > 40
            ? `${value.slice(0, 37)}…`
            : value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : Array.isArray(value)
              ? `${value.length} item${value.length === 1 ? "" : "s"}`
              : "…";
      return `${key}: ${rendered}`;
    })
    .join(" · ");
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("audit:read");
  const params = await searchParams;

  const q = parseSearch(params, "q", 80);
  const entityType = firstParam(params.entity).trim().slice(0, 40);
  const pagination = parsePagination(params, 50);

  const where = {
    ...(q ? { action: { contains: q, mode: "insensitive" as const } } : {}),
    ...(entityType ? { entityType } : {}),
  };

  const [entries, total, entityTypes] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        // The actor's name, from the join. AuditLog.userId is SetNull on delete,
        // so an entry outlives the account that made it and shows as "System"
        // rather than disappearing.
        user: { select: { name: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
  ]);

  const rows = entries as AuditRow[];
  const info = pageInfo(pagination, total);
  const filtered = hasActiveFilters(params, ["q", "entity"]);
  const types = (entityTypes as { entityType: string }[]).map((row) => row.entityType).sort();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Governance"
        title="Audit log"
        description="Append-only record of privileged actions. Entries are never edited or removed, and are visible to owners only."
      />

      <FilterBar clearHref="/admin/audit" hasFilters={filtered}>
        <FilterField name="q" label="Action" className="lg:col-span-3">
          <FilterSearch value={q} placeholder="e.g. product.publish, settings.update" />
        </FilterField>
        <FilterField name="entity" label="Record type">
          <FilterSelect
            name="entity"
            value={entityType || null}
            anyLabel="Any type"
            options={types.map((type) => ({ value: type, label: type }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No entries match those filters" : "Nothing recorded yet"}
          description={
            filtered
              ? "Try a different action name, or clear the filters."
              : "Publishing a piece, changing a price or updating a setting will appear here."
          }
        />
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">Audit entries, most recent first</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    {entry.user ? (
                      <>
                        <span className="font-medium">{entry.user.name}</span>
                        <span className="text-metadata mt-1 block break-all text-muted-foreground">
                          {entry.user.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{entry.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.entityType}
                    <span className="text-metadata mt-1 block break-all">{entry.entityId}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {summarise(entry.metadata)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination info={info} basePath="/admin/audit" params={params} itemLabel="entries" />
        </>
      )}

      <p className="text-metadata text-muted-foreground">
        Showing {buildQuery(params, {}) ? "filtered " : ""}entries from the AuditLog table.
        Audit writes never block the action they describe — a failed write is logged for
        the operator rather than rolling back a successful business change.
      </p>
    </div>
  );
}
