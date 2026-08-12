import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sandboxProvider, SANDBOX_PROVIDER_ID } from "@/lib/payments/sandbox-provider";
import { formatCents } from "@/lib/commerce/money";
import { toCents } from "@/lib/commerce/money";
import { Section } from "@/components/ui/section";
import { SandboxPaymentControls } from "@/components/commerce/sandbox-payment-controls";

export const metadata: Metadata = {
  title: "Sandbox payment",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Stand-in for a payment gateway's hosted page.
 *
 * Exists so the whole lifecycle — initiate, verify, confirm, email, admin — can
 * be exercised before Paynow credentials arrive. It is not reachable unless the
 * sandbox provider is active, and it makes no claim to be a real payment: the
 * tester chooses the outcome, which is the point.
 */
export default async function SandboxPaymentPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  if (!sandboxProvider.isConfigured()) notFound();

  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { orderNumber: true, total: true, currency: true, accessToken: true, paymentStatus: true },
  });
  if (!order) notFound();

  const totalCents = toCents(order.total) ?? 0;

  return (
    <Section className="pt-32 lg:pt-40">
      <div className="mx-auto max-w-lg">
        <p className="text-label text-muted-foreground">Test payment</p>
        <h1 className="text-heading-1 mt-3">Sandbox gateway</h1>

        <div className="mt-6 border-l-2 border-ochre pl-4">
          <p className="text-body-sm text-muted-foreground">
            This is the <strong>{SANDBOX_PROVIDER_ID}</strong> provider, not a real payment
            gateway. No money moves. Choose an outcome to exercise the rest of the order
            lifecycle.
          </p>
        </div>

        <dl className="mt-8 divide-y divide-border border-y border-border">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-metadata text-muted-foreground">Order</dt>
            <dd className="text-body-sm">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-metadata text-muted-foreground">Amount</dt>
            <dd className="text-price">{formatCents(totalCents, order.currency)}</dd>
          </div>
        </dl>

        <SandboxPaymentControls
          orderNumber={order.orderNumber}
          accessToken={order.accessToken}
        />
      </div>
    </Section>
  );
}
