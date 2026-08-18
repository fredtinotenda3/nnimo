import { describe, expect, it, vi } from "vitest";
import { manualProvider, MANUAL_PROVIDER_ID } from "@/lib/payments/manual-provider";
import { sandboxProvider } from "@/lib/payments/sandbox-provider";
import { paynowProvider } from "@/lib/payments/paynow-provider";
import { settlementModeOf, WebhookSignatureError } from "@/lib/payments/types";
import {
  customerFacingStatus,
  MANUAL_SETTLEMENT_MESSAGE,
  paymentStatusLabel,
} from "@/lib/commerce/fulfilment";

/**
 * Manual settlement is the production position until Paynow credentials exist.
 * These tests pin the two properties the whole design rests on:
 *
 *   1. the manual provider has no code path that reports payment;
 *   2. what the customer is told matches what the order actually says.
 */
describe("manual payment provider", () => {
  it("is always available, because it needs no credentials", () => {
    // The point of the fallback: it cannot be the reason checkout stops working.
    expect(manualProvider.isConfigured()).toBe(true);
  });

  it("declares itself as manual settlement", () => {
    expect(manualProvider.kind).toBe("manual");
    expect(settlementModeOf(manualProvider)).toBe("manual");
  });

  it("classifies the other providers as automatic settlement", () => {
    expect(settlementModeOf(sandboxProvider)).toBe("automatic");
    expect(settlementModeOf(paynowProvider)).toBe("automatic");
    expect(sandboxProvider.kind).toBe("test");
    expect(paynowProvider.kind).toBe("live");
  });

  it("never sends the customer to a payment page", async () => {
    const intent = await manualProvider.createPayment({
      orderId: "order_1",
      orderNumber: "NN-2026-00001",
      amountCents: 12500,
      currency: "USD",
      customerEmail: "someone@example.invalid",
      customerPhone: null,
      returnUrl: "https://example.invalid/orders/token",
      orderAccessToken: "token",
      resultUrl: "https://example.invalid/api/payments/manual/callback",
      idempotencyKey: "key",
    });

    expect(intent.redirectUrl).toBeNull();
    expect(intent.providerRef).toMatch(/^man_/);
  });

  /**
   * The load-bearing assertion in this file. Not "returns PENDING when
   * unconfigured" — there is no input at all that yields PAID.
   */
  it("cannot report a payment as received", async () => {
    const verification = await manualProvider.verifyPayment({
      providerRef: "man_anything",
      orderNumber: "NN-2026-00001",
    });

    expect(verification.status).toBe("PENDING");
    expect(verification.status).not.toBe("PAID");
    // It reports no amount or currency either, so it can never satisfy the
    // amount/currency checks in evaluateVerification by accident.
    expect(verification.amountCents).toBeNull();
    expect(verification.currency).toBeNull();
  });

  it("rejects any inbound callback", async () => {
    await expect(
      manualProvider.parseWebhook({
        rawBody: JSON.stringify({ orderNumber: "NN-2026-00001", status: "PAID" }),
        headers: {},
      }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("uses a stable provider id, because it is written to Payment rows", () => {
    expect(manualProvider.id).toBe(MANUAL_PROVIDER_ID);
    expect(MANUAL_PROVIDER_ID).toBe("manual");
  });
});

describe("customer-facing settlement messaging", () => {
  it("gives the required message for an unpaid manually-settled order", () => {
    const message = customerFacingStatus(
      { paymentStatus: "UNPAID", fulfilmentStatus: "PENDING" },
      "manual",
    );
    expect(message).toBe(MANUAL_SETTLEMENT_MESSAGE);
    expect(message).toContain("The studio will confirm availability, delivery, and payment");
  });

  it("never tells a manual-settlement customer to go and pay", () => {
    for (const status of ["UNPAID", "PENDING", "FAILED"] as const) {
      const message = customerFacingStatus(
        { paymentStatus: status, fulfilmentStatus: "PENDING" },
        "manual",
      );
      expect(message).not.toContain("Awaiting payment");
      expect(message).not.toContain("Payment processing");
      expect(message).not.toContain("Payment failed");
    }
  });

  it("leaves automatic settlement wording exactly as it was", () => {
    expect(
      customerFacingStatus({ paymentStatus: "UNPAID", fulfilmentStatus: "PENDING" }),
    ).toBe("Awaiting payment");
    expect(
      customerFacingStatus({ paymentStatus: "PENDING", fulfilmentStatus: "PENDING" }),
    ).toBe("Payment processing");
    expect(
      customerFacingStatus({ paymentStatus: "FAILED", fulfilmentStatus: "PENDING" }),
    ).toBe("Payment failed");
  });

  it("reports fulfilment normally once a manual order is settled", () => {
    expect(
      customerFacingStatus({ paymentStatus: "PAID", fulfilmentStatus: "IN_PRODUCTION" }, "manual"),
    ).toBe("In production");
  });

  it("still reports cancellation and refunds ahead of settlement wording", () => {
    expect(
      customerFacingStatus({ paymentStatus: "UNPAID", fulfilmentStatus: "CANCELLED" }, "manual"),
    ).toBe("Cancelled");
    expect(
      customerFacingStatus({ paymentStatus: "REFUNDED", fulfilmentStatus: "PENDING" }, "manual"),
    ).toBe("Refunded");
  });

  it("softens the payment badge without changing the stored status", () => {
    expect(paymentStatusLabel("UNPAID", "manual")).toBe("Awaiting studio confirmation");
    expect(paymentStatusLabel("PENDING", "manual")).toBe("Awaiting studio confirmation");
    // Paid is paid, however it settled.
    expect(paymentStatusLabel("PAID", "manual")).toBe("Paid");
    // Automatic settlement keeps the original labels.
    expect(paymentStatusLabel("UNPAID")).toBe("Unpaid");
    expect(paymentStatusLabel("PENDING")).toBe("Payment processing");
  });
});

/**
 * Provider RESOLUTION — the behaviour that actually protects a production order.
 *
 * Exercised through a fresh module import per case, because the registry holds
 * one piece of module state (the once-only downgrade log) and because
 * `getActiveProviderId` reads process.env at call time.
 *
 * This is the test that would have caught the original defect: production
 * configured with the sandbox provider must not end up with the sandbox
 * provider.
 */
describe("active provider resolution", () => {
  async function resolveWith(vars: Record<string, string | undefined>) {
    vi.resetModules();
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
      previous[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      const payments = await import("@/lib/payments");
      return payments.getActiveProviderId();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("downgrades the sandbox provider to manual settlement in production", async () => {
    await expect(
      resolveWith({
        PAYMENT_PROVIDER: "sandbox",
        NODE_ENV: "production",
        DEPLOYMENT_ENV: undefined,
        PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: undefined,
      }),
    ).resolves.toBe("manual");
  });

  it("keeps the sandbox provider in development", async () => {
    await expect(
      resolveWith({
        PAYMENT_PROVIDER: "sandbox",
        NODE_ENV: "development",
        DEPLOYMENT_ENV: undefined,
      }),
    ).resolves.toBe("sandbox");
  });

  it("keeps the sandbox provider on a declared staging deployment", async () => {
    await expect(
      resolveWith({
        PAYMENT_PROVIDER: "sandbox",
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "staging",
      }),
    ).resolves.toBe("sandbox");
  });

  it("falls back to manual, not sandbox, when nothing is configured in production", async () => {
    await expect(
      resolveWith({
        PAYMENT_PROVIDER: undefined,
        NODE_ENV: "production",
        DEPLOYMENT_ENV: undefined,
        PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: undefined,
      }),
    ).resolves.toBe("manual");
  });

  it("does not downgrade an explicitly selected manual or live provider", async () => {
    await expect(
      resolveWith({ PAYMENT_PROVIDER: "manual", NODE_ENV: "production" }),
    ).resolves.toBe("manual");
    // Paynow stays selected even in production: an unconfigured LIVE provider is
    // a misconfiguration for the operator to fix, not something to silently
    // swap out. getActiveProvider() throws on it; only test providers downgrade.
    await expect(
      resolveWith({ PAYMENT_PROVIDER: "paynow", NODE_ENV: "production" }),
    ).resolves.toBe("paynow");
  });
});
