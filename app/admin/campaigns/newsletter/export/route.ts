import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionOrThrow } from "@/lib/session";

/**
 * Basic CSV export of the newsletter list — "Admin should see subscribers
 * and export basic list" from the brief, read literally: every real
 * subscriber row, no filtering applied here (the admin list page's search is
 * for finding one subscriber, not for scoping an export).
 */
export async function GET() {
  await requirePermissionOrThrow("campaign:read");

  const subscribers = await db.newsletterSubscriber.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      email: true,
      consent: true,
      source: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      createdAt: true,
      unsubscribedAt: true,
    },
  });

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const header = ["email", "status", "source", "utm_source", "utm_medium", "utm_campaign", "signed_up"];
  const rows = subscribers.map((s) =>
    [
      s.email,
      s.unsubscribedAt ? "unsubscribed" : "subscribed",
      s.source ?? "",
      s.utmSource ?? "",
      s.utmMedium ?? "",
      s.utmCampaign ?? "",
      s.createdAt.toISOString(),
    ]
      .map((value) => escape(String(value)))
      .join(","),
  );

  const csv = [header.map(escape).join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
