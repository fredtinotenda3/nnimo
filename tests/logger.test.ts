import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "@/lib/logger";

/**
 * Phase 5I forbids logging passwords, payment secrets, API keys, session tokens
 * and unnecessary PII. Relying on every call site to remember that is how
 * secrets end up in logs, so redaction happens structurally on the way out —
 * and these tests are what hold it there.
 */
describe("redact", () => {
  it("removes obviously secret values", () => {
    const output = redact({
      password: "hunter2",
      apiKey: "sk_live_123",
      authorization: "Bearer abc",
      cookie: "authjs.session-token=xyz",
    }) as Record<string, unknown>;

    expect(output.password).toBe(REDACTED);
    expect(output.apiKey).toBe(REDACTED);
    expect(output.authorization).toBe(REDACTED);
    expect(output.cookie).toBe(REDACTED);
  });

  /**
   * Providers are inconsistent about naming, which is exactly why matching is on
   * a normalised substring rather than an exact key list.
   */
  it("catches secret keys whatever the casing or separator", () => {
    const output = redact({
      IntegrationKey: "k",
      integration_key: "k",
      "INTEGRATION-KEY": "k",
      secretAccessKey: "k",
    }) as Record<string, unknown>;

    for (const value of Object.values(output)) expect(value).toBe(REDACTED);
  });

  it("masks PII rather than deleting it, so support can still identify a customer", () => {
    const output = redact({ email: "mary@example.com", phone: "+263771234567" }) as Record<
      string,
      unknown
    >;

    expect(output.email).toBe("m***@example.com");
    expect(output.email).not.toContain("mary@");
    expect(String(output.phone)).not.toContain("771234");
    expect(String(output.phone)).toContain("567");
  });

  it("redacts inside nested structures", () => {
    const output = redact({
      payment: { provider: "paynow", integrationKey: "leak-me" },
    }) as { payment: Record<string, unknown> };

    expect(output.payment.provider).toBe("paynow");
    expect(output.payment.integrationKey).toBe(REDACTED);
  });

  it("keeps values that are safe and useful", () => {
    const output = redact({ orderNumber: "NN-2026-00042", amountCents: 12500 }) as Record<
      string,
      unknown
    >;

    expect(output.orderNumber).toBe("NN-2026-00042");
    expect(output.amountCents).toBe(12500);
  });

  it("survives a circular structure instead of throwing", () => {
    const node: Record<string, unknown> = { name: "a" };
    node.self = node;
    expect(() => redact(node)).not.toThrow();
    expect(JSON.stringify(redact(node))).toContain("[circular]");
  });

  it("bounds an enormous payload so one log line cannot be megabytes", () => {
    const output = redact({ items: Array.from({ length: 500 }, (_, i) => i) }) as {
      items: unknown[];
    };
    expect(output.items.length).toBeLessThan(500);
  });

  it("reduces an Error to name and message", () => {
    const output = redact(new Error("boom")) as Record<string, unknown>;
    expect(output.name).toBe("Error");
    expect(output.message).toBe("boom");
  });
});
