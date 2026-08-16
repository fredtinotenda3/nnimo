import { NextResponse, type NextRequest } from "next/server";
import { getProvider, isKnownProvider } from "@/lib/payments";
import { WebhookSignatureError } from "@/lib/payments/types";
import {
  markWebhookProcessed,
  recordWebhookOnce,
  verifyAndApplyPayment,
} from "@/lib/commerce/payment-service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentityFrom } from "@/lib/security/client-identity";
import { requestIdFrom } from "@/lib/http/errors";

// Callbacks must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * Largest callback body we will read.
 *
 * PHASE 5 ADDITION. `await request.text()` with no bound will happily buffer
 * whatever is sent, so an unauthenticated endpoint that reads the whole body
 * before authenticating it is a memory-exhaustion primitive. Provider callbacks
 * are a few hundred bytes; 64 KB is generous and still bounded.
 */
const MAX_CALLBACK_BYTES = 64 * 1024;

/**
 * Provider payment callback.
 *
 * Rules this endpoint follows, all of which have burned real shops:
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
 *
 * PHASE 5 ADDITIONS: a body size cap, a flood limiter, and a correlation id
 * carried through every log line and returned in the response so a provider's
 * delivery log can be joined to ours during reconciliation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const requestId = requestIdFrom(request.headers);
  const log = logger.child({ requestId, provider: providerId, event_source: "webhook" });

  if (!isKnownProvider(providerId)) {
    // 404 rather than 400: an unknown provider path is not a malformed request,
    // and the response should not enumerate which providers exist.
    log.warn("webhook.unknown_provider");
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  /**
   * Flood guard, NOT an access control.
   *
   * Set deliberately high (see RATE_LIMIT_RULES.paymentCallback) because a
   * provider legitimately retries, and throttling a real settlement notification
   * would be worse than the abuse it prevents. Authentication of the callback is
   * the actual control. Fails open for the same reason.
   */
  const limit = await checkRateLimit("paymentCallback", clientIdentityFrom(request.headers));
  if (!limit.allowed) {
    log.warn("webhook.rate_limited");
    // 429 so a genuine provider backs off and retries rather than giving up.
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const provider = getProvider(providerId);

  // Bound the read before authenticating anything.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CALLBACK_BYTES) {
    log.warn("webhook.body_too_large", { declaredLength });
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_CALLBACK_BYTES) {
    // A missing or lying content-length is caught here.
    log.warn("webhook.body_too_large", { actualLength: rawBody.length });
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

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
      log.warn("webhook.rejected_unauthenticated");
      return NextResponse.json({ error: "Invalid signature", requestId }, { status: 400 });
    }
    log.error("webhook.parse_failed", { error });
    return NextResponse.json({ error: "Malformed payload", requestId }, { status: 400 });
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
    log.info("webhook.acknowledged_no_order", { eventType: parsed.eventType });
    return NextResponse.json({ received: true, requestId });
  }

  const { firstTime } = await recordWebhookOnce({
    provider: providerId,
    eventType: parsed.eventType,
    idempotencyKey: parsed.idempotencyKey,
    payload: parsed.raw,
  });

  if (!firstTime) {
    // Already handled. Acknowledge so the provider stops retrying.
    log.info("webhook.duplicate", { orderNumber: parsed.orderNumber });
    return NextResponse.json({ received: true, duplicate: true, requestId });
  }

  try {
    // Note what is NOT passed: the reference from the payload. The service
    // re-reads our own Payment row for the provider reference and asks the
    // provider directly, so a forged callback cannot redirect verification at an
    // attacker-controlled transaction.
    const result = await verifyAndApplyPayment({
      providerId,
      orderNumber: parsed.orderNumber,
    });
    await markWebhookProcessed(parsed.idempotencyKey);

    log.info("webhook.processed", {
      orderNumber: parsed.orderNumber,
      eventType: parsed.eventType,
      status: result.status,
    });
  } catch (error) {
    // Transient: leave processedAt null so it can be replayed or swept, and
    // signal failure so the provider retries. The unprocessed-event index added
    // in the Phase 5 migration is what makes the sweep cheap.
    log.error("webhook.verification_failed", { orderNumber: parsed.orderNumber, error });
    return NextResponse.json({ error: "Verification failed", requestId }, { status: 500 });
  }

  return NextResponse.json({ received: true, requestId });
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
