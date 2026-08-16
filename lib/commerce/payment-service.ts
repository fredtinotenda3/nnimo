import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getActiveProvider, getProvider } from "@/lib/payments";
import { toCents } from "@/lib/commerce/money";
import { logger } from "@/lib/logger";
import { commitOrderInventory, releaseOrderInventory } from "@/lib/commerce/inventory-lifecycle";
import { evaluateVerification } from "@/lib/commerce/payment-verification";
import type { VerifiedPaymentStatus } from "@/lib/payments/types";

/**
 * The only path by which an order may become PAID.
 *
 * Nothing here trusts a browser. A redirect back from a provider is treated as
 * "go and ask the provider what happened", never as evidence of payment.
 */

/** Deterministic per (order, attempt) so a retried submit reuses the same key. */
function buildIdempotencyKey(orderId: string, attempt: number): string {
  return createHash("sha256").update(`${orderId}:${attempt}`).digest("hex");
}

export async function startPayment(params: {
  orderId: string;
  returnUrl: string;
  resultUrl: string;
}): Promise<{ redirectUrl: string | null; paymentId: string }> {
  const provider = getActiveProvider();

  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      currency: true,
      guestEmail: true,
      guestPhone: true,
      paymentStatus: true,
      accessToken: true,
    },
  });
  if (!order) throw new Error("Order not found.");
  if (order.paymentStatus === "PAID") throw new Error("This order is already paid.");

  const amountCents = toCents(order.total);
  if (amountCents === null || amountCents <= 0) {
    throw new Error("Order total is not payable.");
  }

  // Attempt count drives the idempotency key: a genuine retry after a failure is
  // a new attempt, while a double-clicked button is the same one.
  const attempts = await db.payment.count({ where: { orderId: order.id } });
  const idempotencyKey = buildIdempotencyKey(order.id, attempts);

  const existing = await db.payment.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    // Same attempt already recorded — do not create a second provider payment.
    return { redirectUrl: null, paymentId: existing.id };
  }

  const intent = await provider.createPayment({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountCents,
    currency: order.currency,
    customerEmail: order.guestEmail ?? "",
    customerPhone: order.guestPhone,
    returnUrl: params.returnUrl,
    resultUrl: params.resultUrl,
    orderAccessToken: order.accessToken,
    idempotencyKey,
  });

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: provider.id,
      providerRef: intent.providerRef,
      status: "PENDING",
      amount: order.total,
      currency: order.currency,
      idempotencyKey,
      rawPayload: intent.raw as object,
    },
    select: { id: true },
  });

  // Order moves to PENDING, not PAID. Only verification can do that.
  await db.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PENDING" },
  });

  logger.info("payment.initiated", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: provider.id,
    amountCents,
    currency: order.currency,
    attempt: attempts,
  });

  return { redirectUrl: intent.redirectUrl, paymentId: payment.id };
}

/**
 * Asks the provider what happened and reconciles our records.
 *
 * Safe to call repeatedly: an order already PAID is returned unchanged rather
 * than paid twice, and each verification writes a new append-only Payment row so
 * the history stays reconstructable.
 */
export async function verifyAndApplyPayment(params: {
  orderNumber: string;
  providerId?: string;
}): Promise<{ status: VerifiedPaymentStatus }> {
  const order = await db.order.findUnique({
    where: { orderNumber: params.orderNumber },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      currency: true,
      paymentStatus: true,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { provider: true, providerRef: true },
      },
    },
  });
  if (!order) throw new Error("Order not found.");

  if (order.paymentStatus === "PAID") return { status: "PAID" };

  const providerId = params.providerId ?? order.payments[0]?.provider;
  const provider = providerId ? getProvider(providerId) : getActiveProvider();

  const verification = await provider.verifyPayment({
    providerRef: order.payments[0]?.providerRef ?? null,
    orderNumber: order.orderNumber,
  });

  /**
   * The decision that matters: may this verification move the order to PAID?
   *
   * Lives in lib/commerce/payment-verification.ts as a pure function so every
   * branch — underpayment, wrong currency, provider silent on both — is unit
   * tested rather than only reachable through a database and a live provider.
   */
  const expectedCents = toCents(order.total);
  const decision = evaluateVerification({
    reportedStatus: verification.status,
    reportedAmountCents: verification.amountCents,
    reportedCurrency: verification.currency,
    expectedAmountCents: expectedCents,
    expectedCurrency: order.currency,
  });

  const { amountMismatch, currencyMismatch, rejected } = decision;
  const effectiveStatus: VerifiedPaymentStatus = decision.status;

  if (rejected) {
    // A provider disagreeing with us about what was paid is a reconciliation
    // incident, not a routine failure. Logged at error so it is alertable.
    logger.error("payment.verification_mismatch", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.id,
      amountMismatch,
      currencyMismatch,
      expectedCents,
      reportedCents: verification.amountCents,
      expectedCurrency: order.currency,
      reportedCurrency: verification.currency,
    });
  }

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: provider.id,
        providerRef: verification.providerRef,
        status:
          effectiveStatus === "PAID"
            ? "PAID"
            : effectiveStatus === "FAILED" || effectiveStatus === "CANCELLED"
              ? "FAILED"
              : "PENDING",
        amount: order.total,
        currency: order.currency,
        // Verification rows carry their own key so a repeated verification of the
        // same outcome cannot create duplicates.
        idempotencyKey: createHash("sha256")
          .update(`verify:${order.id}:${effectiveStatus}:${verification.providerRef ?? ""}`)
          .digest("hex"),
        rawPayload: {
          verification: verification.raw,
          ...(amountMismatch ? { amountMismatch: true } : {}),
          ...(currencyMismatch ? { currencyMismatch: true } : {}),
        } as object,
        verifiedAt: effectiveStatus === "PAID" ? new Date() : null,
      },
    });

    if (effectiveStatus === "PAID") {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", paidAt: new Date() },
      });
    } else if (effectiveStatus === "FAILED" || effectiveStatus === "CANCELLED") {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED" },
      });
    }
  }).catch(async (error: unknown) => {
    // A unique-key collision means this exact outcome was already applied by an
    // earlier verification. Not an error — but it does mean the transaction
    // above rolled back, so the state it would have written must already exist.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Unique constraint") && !message.includes("idempotencyKey")) {
      throw error;
    }
    logger.info("payment.verification_duplicate", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.id,
      status: effectiveStatus,
    });
  });

  /**
   * Resolve the order's stock reservations.
   *
   * Deliberately OUTSIDE the transaction above. Two reasons:
   *
   *   1. `commitReservation` and `releaseReservation` open their own
   *      transactions, and nesting an independent transaction inside another
   *      Prisma transaction runs it on a different connection — the exact bug
   *      lib/inventory.ts warns about in `reserveStockWithin`.
   *   2. Money has already moved. A stock bookkeeping failure must not roll back
   *      a payment that genuinely settled; it must be recorded loudly and
   *      corrected by an operator. Both helpers log at error and return counts
   *      rather than throwing, which is what makes that possible.
   *
   * Both are idempotent against InventoryMovement, so a replayed callback or a
   * second verification cannot double-commit or double-release.
   */
  if (effectiveStatus === "PAID") {
    await commitOrderInventory({ orderId: order.id, orderNumber: order.orderNumber });
  } else if (effectiveStatus === "FAILED" || effectiveStatus === "CANCELLED") {
    await releaseOrderInventory({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason: `Payment ${effectiveStatus.toLowerCase()} for order ${order.orderNumber}`,
    });
  }

  if (effectiveStatus === "PAID") {
    logger.info("payment.verified", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.id,
    });
    await recordAudit({
      userId: null,
      action: "payment.verified",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, provider: provider.id },
    });
  } else {
    logger.info("payment.verification_result", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.id,
      status: effectiveStatus,
      rejected,
    });
  }

  return { status: effectiveStatus };
}

/**
 * Records an inbound webhook, exactly once.
 *
 * The unique index on PaymentWebhookEvent.idempotencyKey is what makes this
 * idempotent — a replayed callback fails the insert and is skipped. It is not an
 * application-level "have we seen this?" check, which would race.
 */
export async function recordWebhookOnce(params: {
  provider: string;
  eventType: string;
  idempotencyKey: string;
  payload: unknown;
}): Promise<{ firstTime: boolean }> {
  try {
    await db.paymentWebhookEvent.create({
      data: {
        provider: params.provider,
        eventType: params.eventType,
        idempotencyKey: params.idempotencyKey,
        payload: params.payload as object,
      },
    });
    return { firstTime: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint") || message.includes("idempotencyKey")) {
      return { firstTime: false };
    }
    throw error;
  }
}

/**
 * Stamps an event as processed.
 *
 * Failure here is genuinely non-fatal — the business effect already happened and
 * `processedAt` is a sweep marker, not a correctness guard (the UNIQUE key is).
 * But it must not vanish: an event stuck with processedAt NULL is what the
 * reconciliation sweep looks for, so a silent failure here creates a phantom
 * "stuck" event that an operator will chase. Logged rather than swallowed.
 */
export async function markWebhookProcessed(idempotencyKey: string): Promise<void> {
  try {
    await db.paymentWebhookEvent.update({
      where: { idempotencyKey },
      data: { processedAt: new Date() },
    });
  } catch (error) {
    logger.warn("webhook.mark_processed_failed", { error });
  }
}

export function newPaymentReference(): string {
  return randomUUID();
}
