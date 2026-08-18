import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getActiveProvider, getProvider } from "@/lib/payments";
import { MANUAL_PROVIDER_ID } from "@/lib/payments/manual-provider";
import { testPaymentsAllowed } from "@/lib/payments/environment";
import { toCents } from "@/lib/commerce/money";
import { logger } from "@/lib/logger";
import { commitOrderInventory, releaseOrderInventory } from "@/lib/commerce/inventory-lifecycle";
import { evaluateVerification } from "@/lib/commerce/payment-verification";
import { settlementModeOf, type VerifiedPaymentStatus } from "@/lib/payments/types";

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

  /**
   * Order moves to PENDING, not PAID. Only verification can do that.
   *
   * UNDER MANUAL SETTLEMENT IT DOES NOT MOVE AT ALL.
   *
   * PENDING renders to the customer as "Payment processing" (PAYMENT_LABEL),
   * which would be a straightforward lie when nothing is processing and nobody
   * has been asked for money yet. The order stays UNPAID — "the studio will
   * confirm payment with you" — until an operator records receipt through
   * `settlePaymentManually()`. The Payment row above is still written, because
   * an outstanding balance is a fact worth recording; it is the ORDER's
   * denormalised status that must not overstate what has happened.
   */
  const settlement = settlementModeOf(provider);

  if (settlement === "automatic") {
    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PENDING" },
    });
  }

  logger.info("payment.initiated", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: provider.id,
    settlement,
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
export type VerificationOutcome = {
  status: VerifiedPaymentStatus;
  /**
   * True when the provider claimed PAID and the environment guard refused it.
   *
   * Callers need to tell this apart from an ordinary PENDING: a blocked
   * settlement must not send the customer a "your payment failed" email, because
   * nothing failed.
   */
  blocked: boolean;
};

export async function verifyAndApplyPayment(params: {
  orderNumber: string;
  providerId?: string;
}): Promise<VerificationOutcome> {
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

  if (order.paymentStatus === "PAID") return { status: "PAID", blocked: false };

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

  /**
   * THE PRODUCTION SETTLEMENT GUARD.
   *
   * The last line of defence, and deliberately not the only one. Provider
   * selection (lib/payments/index.ts) already refuses to hand checkout a test
   * provider on the real shop, and the sandbox provider already reports itself
   * unconfigured there. This check exists because neither of those covers an
   * order that was STARTED under a test provider and is being verified later —
   * by a replayed callback, a reconciliation sweep, or a database restored from
   * a staging environment into production.
   *
   * A test provider's PAID claim becomes PENDING: the order is not settled, and
   * it is not marked FAILED either, because nothing about the payment failed. It
   * simply may not be recognised here, and the studio can settle it manually if
   * the money genuinely arrived.
   *
   * Logged at error, because this firing means something upstream is
   * misconfigured and someone needs to look at it.
   */
  const blockedByEnvironment =
    decision.status === "PAID" && provider.kind === "test" && !testPaymentsAllowed();

  if (blockedByEnvironment) {
    logger.error("payment.test_provider_settlement_blocked", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.id,
      detail:
        "A test payment provider reported PAID on a production deployment. The order has " +
        "NOT been settled. If payment genuinely arrived, record it in the admin.",
    });
  }

  const effectiveStatus: VerifiedPaymentStatus = blockedByEnvironment
    ? "PENDING"
    : decision.status;

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

  return { status: effectiveStatus, blocked: blockedByEnvironment };
}

export class ManualSettlementError extends Error {}

export type ManualSettlementResult = {
  /** False when the order was already paid — a no-op, not a failure. */
  settled: boolean;
  orderNumber: string;
};

/**
 * The studio recording that payment actually arrived.
 *
 * THE ONE PLACE MONEY IS RECOGNISED WITHOUT A PROVIDER
 *
 * Everything else in this module refuses to mark an order paid unless a payment
 * network says so. That refusal is only safe if there is a legitimate way to
 * record the payments Nnino genuinely takes offline — bank transfer, cash on
 * collection, a mobile-money transfer arranged over WhatsApp. Without this
 * function the alternative would be an operator being tempted to run a sandbox
 * transaction to "make the order look right", which is the exact failure this
 * whole change exists to prevent.
 *
 * WHAT MAKES IT DIFFERENT FROM A PROVIDER SETTLEMENT
 *
 *   - It requires an authenticated operator holding `order:settle`, checked by
 *     the caller (app/admin/orders/actions.ts) before this is reached.
 *   - It records WHO did it. `userId` is written to the audit log, so a
 *     mistaken or dishonest settlement is attributable. A provider settlement
 *     records a null user because no human made the decision.
 *   - The Payment row is stamped with provider `manual`, so reconciliation can
 *     always separate "money a gateway confirmed" from "money a person said
 *     arrived". Analytics reading Payment.provider gets that distinction for
 *     free.
 *
 * Idempotent on the order's paid state and on the Payment unique key, so a
 * double-submitted form settles once.
 */
export async function settlePaymentManually(params: {
  orderId: string;
  userId: string;
  /** The studio's own reference — a bank or mobile-money transaction id. */
  reference: string | null;
  /** How the money arrived, in the operator's words. Never invented for them. */
  method: string | null;
  note: string | null;
}): Promise<ManualSettlementResult> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      currency: true,
      paymentStatus: true,
    },
  });
  if (!order) throw new ManualSettlementError("Order not found.");

  // Already settled. Not an error — two operators can reasonably reach for the
  // same button — but nothing further happens, and no second Payment row is
  // written.
  if (order.paymentStatus === "PAID") {
    return { settled: false, orderNumber: order.orderNumber };
  }

  if (order.paymentStatus === "REFUNDED" || order.paymentStatus === "PARTIALLY_REFUNDED") {
    throw new ManualSettlementError(
      "This order has been refunded. Settling it again would misstate the account.",
    );
  }

  const amountCents = toCents(order.total);
  if (amountCents === null || amountCents <= 0) {
    throw new ManualSettlementError("This order has no payable total.");
  }

  const now = new Date();

  await db
    .$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: MANUAL_PROVIDER_ID,
          providerRef: params.reference,
          status: "PAID",
          amount: order.total,
          currency: order.currency,
          // Keyed on the order alone: a second manual settlement of the same
          // order is the double-submit case, and the unique index is what
          // rejects it rather than a prior read that could race.
          idempotencyKey: createHash("sha256")
            .update(`manual-settlement:${order.id}`)
            .digest("hex"),
          rawPayload: {
            settlement: "manual",
            settledByUserId: params.userId,
            method: params.method,
            note: params.note,
            reference: params.reference,
          } as object,
          // Verified by a person rather than a provider, which is what the
          // audit entry below records.
          verifiedAt: now,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", paidAt: now },
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unique constraint") || message.includes("idempotencyKey")) {
        // Concurrent settlement of the same order. The other one won; the state
        // this would have written already exists.
        logger.info("payment.manual_settlement_duplicate", {
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
        return;
      }
      throw error;
    });

  /**
   * Stock commitment, outside the transaction — same reasoning as
   * `verifyAndApplyPayment`: `commitReservation` opens its own transaction, and
   * a stock bookkeeping failure must not roll back a settlement that reflects
   * money genuinely received.
   */
  await commitOrderInventory({ orderId: order.id, orderNumber: order.orderNumber });

  logger.info("payment.manually_settled", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: params.userId,
    amountCents,
    currency: order.currency,
  });

  await recordAudit({
    userId: params.userId,
    action: "payment.manually_settled",
    entityType: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      amountCents,
      currency: order.currency,
      method: params.method,
      // The reference is the studio's own record of the transfer, not card data
      // or a provider secret, so it is safe to keep in the audit trail — and it
      // is the thing a reconciliation would need.
      reference: params.reference,
    },
  });

  return { settled: true, orderNumber: order.orderNumber };
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
