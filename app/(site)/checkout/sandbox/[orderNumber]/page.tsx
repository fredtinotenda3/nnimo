import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sandboxProvider, SANDBOX_PROVIDER_ID } from "@/lib/payments/sandbox-provider";
import { formatCents, toCents } from "@/lib/commerce/money";
import { timingSafeEqualString } from "@/lib/security/tokens";
import { Section } from "@/components/ui/section";
import { SandboxPaymentControls } from "@/components/commerce/sandbox-payment-controls";

export const metadata: Metadata = {
  title: "Sandbox payment",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Stand-in for a payment gateway's hosted page.
 *
 * PHASE 5 SECURITY FIX — this page previously took ONLY an order number.
 *
 * Order numbers are sequential (`NN-2026-00001`, `NN-2026-00002`, …) because
 * they come from a Postgres sequence. The page looked the order up by that
 * number and rendered `order.accessToken` into the form. Anyone could therefore
 * walk the sequence, harvest an access token per order, and open
 * `/orders/[accessToken]` — which shows the customer's name, email, phone and
 * delivery address. A sequential identifier plus an unauthenticated lookup that
 * returns the unguessable identifier defeats the whole point of having one.
 *
 * The fix is that the token must now be SUPPLIED, not disclosed: the caller
 * proves they already hold it via `?token=`, and it is compared in constant time
 * against the stored value. The page can no longer tell anyone anything they did
 * not already know, which is the property `/orders/[accessToken]` was relying on.
 *
 * A wrong or missing token returns notFound() rather than a distinct error, so
 * the response does not confirm whether the order number exists.
 */
export default async function SandboxPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  if (!sandboxProvider.isConfigured()) notFound();

  const [{ orderNumber }, query] = await Promise.all([params, searchParams]);

  const suppliedToken = typeof query.token === "string" ? query.token : "";
  // Bounded before it reaches the database: an unbounded value is a pointless
  // query and a pointless comparison.
  if (!suppliedToken || suppliedToken.length > 100 || orderNumber.length > 60) notFound();

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      total: true,
      currency: true,
      accessToken: true,
      paymentStatus: true,
    },
  });
  if (!order) notFound();

  // Constant-time: a length-varying or early-exit comparison on a secret is a
  // timing oracle, and this one is reachable anonymously.
  if (!timingSafeEqualString(suppliedToken, order.accessToken)) notFound();

  // Already settled — nothing to simulate, and re-running the flow would only
  // generate a duplicate verification.
  if (order.paymentStatus === "PAID") {
    return (
      <Section className="pt-32 lg:pt-40">
        <div className="mx-auto max-w-lg">
          <h1 className="text-heading-1">Already paid</h1>
          <p className="text-body-sm mt-4 text-muted-foreground">
            Order {order.orderNumber} has already been marked paid. There is nothing
            further to simulate.
          </p>
        </div>
      </Section>
    );
  }

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

        {/*
          The token echoed into the form is the one the CALLER supplied and we
          verified — never one read out of the database for them. That
          distinction is the whole fix.
        */}
        <SandboxPaymentControls
          orderNumber={order.orderNumber}
          accessToken={suppliedToken}
        />
      </div>
    </Section>
  );
}
