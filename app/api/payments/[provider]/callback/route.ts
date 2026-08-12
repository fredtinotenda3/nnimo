import { NextResponse, type NextRequest } from "next/server";
import { getProvider, isKnownProvider } from "@/lib/payments";
import { WebhookSignatureError } from "@/lib/payments/types";
import {
  markWebhookProcessed,
  recordWebhookOnce,
  verifyAndApplyPayment,
} from "@/lib/commerce/payment-service";

// Callbacks must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * Provider payment callback.
 *
 * Four rules this endpoint follows, all of which have burned real shops:
 *
 * 1. The payload is never trusted. `parseWebhook` authenticates it and throws
 *    WebhookSignatureError on anything it cannot verify; an unauthenticated
 *    callback claiming "paid" is discarded.
 * 2. The payload is never believed about the outcome either. Even after
 *    authentication, the status is re-fetched from the provider by
 *    verifyAndApplyPayment. A forged-but-well-formed callback still cannot mark
 *    an order paid.
 * 3. Processing happens at most once. recordWebhookOnce relies on a UNIQUE index,
 *    not on a "have we seen this?" query, so simultaneous duplicate deliveries
 *    cannot both proceed.
 * 4. Providers retry on non-2xx. We therefore return 200 for anything we have
 *    definitively handled or definitively rejected, and only signal failure for
 *    genuinely transient problems so the provider retries usefully.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;

  if (!isKnownProvider(providerId)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const provider = getProvider(providerId);
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let parsed;
  try {
    parsed = await provider.parseWebhook({ rawBody, headers });
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      // Do not retry an unauthenticated callback, and do not explain why.
      console.warn(`[webhook:${providerId}] rejected unauthenticated callback`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    console.error(`[webhook:${providerId}] parse failed`, error);
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  if (!parsed.orderNumber) {
    // Nothing actionable, but it authenticated — record and acknowledge so the
    // provider stops retrying.
    await recordWebhookOnce({
      provider: providerId,
      eventType: parsed.eventType,
      idempotencyKey: parsed.idempotencyKey,
      payload: parsed.raw,
    });
    return NextResponse.json({ received: true });
  }

  const { firstTime } = await recordWebhookOnce({
    provider: providerId,
    eventType: parsed.eventType,
    idempotencyKey: parsed.idempotencyKey,
    payload: parsed.raw,
  });

  if (!firstTime) {
    // Already handled. Acknowledge so the provider stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Note what is NOT passed: the reference from the payload. The service
    // re-reads our own Payment row for the provider reference and asks the
    // provider directly, so a forged callback cannot redirect verification at an
    // attacker-controlled transaction.
    await verifyAndApplyPayment({
      providerId,
      orderNumber: parsed.orderNumber,
    });
    await markWebhookProcessed(parsed.idempotencyKey);
  } catch (error) {
    // Transient: leave processedAt null so it can be replayed or swept, and
    // signal failure so the provider retries.
    console.error(`[webhook:${providerId}] verification failed`, error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Some providers (Paynow among them) issue a GET to the result URL. Same rules:
 * authenticate, record once, verify server-side.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  return POST(request, context);
}
