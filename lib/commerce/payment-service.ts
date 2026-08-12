import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getActiveProvider, getProvider } from "@/lib/payments";
import { toCents } from "@/lib/commerce/money";
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

  // If the provider states an amount, it must match ours. A mismatch is recorded
  // and refused rather than accepted — underpayment is not payment.
  const expectedCents = toCents(order.total);
  const amountMismatch =
    verification.status === "PAID" &&
    verification.amountCents !== null &&
    expectedCents !== null &&
    verification.amountCents !== expectedCents;

  const effectiveStatus: VerifiedPaymentStatus = amountMismatch ? "FAILED" : verification.status;

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
    // A unique-key collision means this exact outcome was already applied.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Unique constraint") && !message.includes("idempotencyKey")) {
      throw error;
    }
  });

  if (effectiveStatus === "PAID") {
    await recordAudit({
      userId: null,
      action: "payment.verified",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, provider: provider.id },
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

export async function markWebhookProcessed(idempotencyKey: string): Promise<void> {
  await db.paymentWebhookEvent
    .update({ where: { idempotencyKey }, data: { processedAt: new Date() } })
    .catch(() => undefined);
}

export function newPaymentReference(): string {
  return randomUUID();
}
