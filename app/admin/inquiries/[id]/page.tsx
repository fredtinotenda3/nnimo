import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { INQUIRY_STATUS_LABEL } from "@/lib/admin/schemas";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { InquiryForm } from "@/components/admin/inquiry-form";
import { MediaThumb, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Enquiry" };
export const dynamic = "force-dynamic";

type AuditRow = { id: string; action: string; createdAt: Date; user: { name: string } | null };

/**
 * One enquiry.
 *
 * Everything the customer wrote is shown verbatim and read-only — an enquiry is
 * a record of what somebody actually asked for, and editing it would destroy the
 * only account of that. What the studio adds (status, quote, notes) is separate
 * and editable.
 */
export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("custom_order:read");
  const { id } = await params;

  const inquiry = await db.customOrderInquiry.findUnique({
    where: { id },
    select: {
      id: true,
      customerName: true,
      email: true,
      phone: true,
      organisation: true,
      requestType: true,
      quantity: true,
      desiredDate: true,
      budget: true,
      description: true,
      quote: true,
      internalNotes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
      campaign: { select: { id: true, name: true } },
      landingPage: { select: { id: true, title: true } },
      referenceImages: {
        select: {
          id: true,
          media: {
            select: { id: true, provider: true, storageKey: true, url: true, altText: true },
          },
        },
      },
    },
  });

  if (!inquiry) notFound();

  const canWrite = can(user.role, "custom_order:write");
  const references = inquiry.referenceImages as { id: string; media: AdminMediaRef }[];

  const [currencySetting, auditEntries] = await Promise.all([
    db.setting.findUnique({ where: { key: "commerce.currency" }, select: { value: true } }),
    db.auditLog.findMany({
      where: { entityType: "CustomOrderInquiry", entityId: inquiry.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  const currency = currencySetting?.value?.trim().toUpperCase() || "USD";
  const history = auditEntries as AuditRow[];

  const details: { label: string; value: string }[] = [
    { label: "Name", value: inquiry.customerName },
    { label: "Email", value: inquiry.email },
    { label: "Phone", value: inquiry.phone ?? "Not given" },
    { label: "Organisation", value: inquiry.organisation ?? "Not given" },
    { label: "Request type", value: inquiry.requestType },
    { label: "Quantity", value: inquiry.quantity === null ? "Not given" : String(inquiry.quantity) },
    {
      label: "Wanted by",
      value: inquiry.desiredDate ? inquiry.desiredDate.toISOString().slice(0, 10) : "Not given",
    },
    { label: "Budget", value: inquiry.budget ?? "Not given" },
    { label: "Received", value: inquiry.createdAt.toISOString().slice(0, 16).replace("T", " ") },
  ];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/inquiries"
        backLabel="All enquiries"
        title={inquiry.customerName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={inquiry.status === "NEW" ? "accent" : "neutral"}>
              {INQUIRY_STATUS_LABEL[inquiry.status as keyof typeof INQUIRY_STATUS_LABEL]}
            </Badge>
            <span>{inquiry.requestType}</span>
          </span>
        }
      />

      <div className="grid gap-12 lg:grid-cols-2">
        <AdminSection title="What they asked for" description="Exactly as submitted.">
          <dl className="divide-y divide-border border-y border-border">
            {details.map((detail) => (
              <div key={detail.label} className="flex flex-wrap justify-between gap-4 py-3">
                <dt className="text-metadata text-muted-foreground">{detail.label}</dt>
                <dd className="text-body-sm break-all text-right">{detail.value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="text-label text-muted-foreground">Description</h3>
            <p className="text-body-sm mt-2 whitespace-pre-wrap">{inquiry.description}</p>
          </div>
        </AdminSection>

        <AdminSection
          title="Studio response"
          description="None of this is shown to the customer automatically."
        >
          {canWrite ? (
            <InquiryForm
              values={{
                id: inquiry.id,
                status: inquiry.status,
                quote: inquiry.quote === null ? "" : inquiry.quote.toString(),
                internalNotes: inquiry.internalNotes ?? "",
                currency,
              }}
            />
          ) : (
            <dl className="divide-y divide-border border-y border-border">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-metadata text-muted-foreground">Quote</dt>
                <dd className="text-body-sm tabular-nums">
                  {inquiry.quote === null ? "Not quoted" : `${currency} ${inquiry.quote.toString()}`}
                </dd>
              </div>
              <div className="py-3">
                <dt className="text-metadata text-muted-foreground">Notes</dt>
                <dd className="text-body-sm mt-2 whitespace-pre-wrap">
                  {inquiry.internalNotes ?? "None."}
                </dd>
              </div>
            </dl>
          )}
        </AdminSection>
      </div>

      {references.length > 0 ? (
        <AdminSection
          title="Reference images"
          description="Supplied by the customer with their enquiry."
        >
          <ul className="flex flex-wrap gap-4">
            {references.map((reference) => (
              <li key={reference.id}>
                <MediaThumb media={reference.media} size={128} label="Customer reference image" />
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}

      <AdminSection title="Attribution" description="How this enquiry found the site, if known.">
        {inquiry.campaign || inquiry.landingPage || inquiry.utmSource || inquiry.utmMedium || inquiry.utmCampaign ? (
          <dl className="divide-y divide-border border-y border-border">
            {inquiry.campaign ? (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-metadata text-muted-foreground">Campaign</dt>
                <dd className="text-body-sm">
                  <Link href={`/admin/campaigns/${inquiry.campaign.id}`} className="hover:text-primary">
                    {inquiry.campaign.name}
                  </Link>
                </dd>
              </div>
            ) : null}
            {inquiry.landingPage ? (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-metadata text-muted-foreground">Landing page</dt>
                <dd className="text-body-sm">
                  <Link href={`/admin/landing-pages/${inquiry.landingPage.id}`} className="hover:text-primary">
                    {inquiry.landingPage.title}
                  </Link>
                </dd>
              </div>
            ) : null}
            {[
              ["Source", inquiry.utmSource],
              ["Medium", inquiry.utmMedium],
              ["Campaign tag", inquiry.utmCampaign],
              ["Term", inquiry.utmTerm],
              ["Content", inquiry.utmContent],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-3">
                  <dt className="text-metadata text-muted-foreground">{label}</dt>
                  <dd className="text-body-sm break-all">{value}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            No attribution recorded — this enquiry arrived with no campaign link or utm parameters.
          </p>
        )}
      </AdminSection>

      <AdminSection title="History">
        {history.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No changes recorded since the enquiry arrived.
          </p>
        ) : (
          <ol className="divide-y divide-border border-y border-border">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-4 py-3">
                <span className="text-body-sm">
                  {entry.action}
                  <span className="text-metadata ml-2 text-muted-foreground">
                    {entry.user?.name ?? "System"}
                  </span>
                </span>
                <span className="text-metadata shrink-0 tabular-nums text-muted-foreground">
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </AdminSection>
    </div>
  );
}
