import { describe, expect, it } from "vitest";
import { REDACTED, redact, scrubSecrets } from "@/lib/logger";

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

/**
 * Regression tests for Phase 8 finding H4.
 *
 * Thirteen `console.error(..., error)` calls were replaced with `logger.error`.
 * That alone would NOT have fixed the leak: `redact()` returned `Error.message`
 * verbatim, and a PrismaClientInitializationError message embeds the datasource
 * URL — username, password, host and database. The password would simply have
 * moved from console-to-stdout to logger-to-stdout and still landed in the
 * platform log, where it is retained and searchable.
 *
 * So the sink was changed too. These tests cover the sink, because that is the
 * part a future call site cannot get wrong.
 */
describe("scrubSecrets", () => {
  it("removes the password from a Postgres connection string", () => {
    const output = scrubSecrets(
      "Can't reach database server at `postgresql://nnino:S3cr3tP@ss@db.example.com:5432/nnino`",
    );
    expect(output).not.toContain("S3cr3t");
    expect(output).toContain(REDACTED);
  });

  it("keeps the username and host, which are what make the line diagnosable", () => {
    const output = scrubSecrets("postgresql://nnino:hunter2@db.example.com:5432/nnino");
    expect(output).toContain("nnino");
    expect(output).toContain("db.example.com");
    expect(output).not.toContain("hunter2");
  });

  it.each([
    "postgres://u:pw@h/d",
    "postgresql://u:pw@h:5432/d",
    "redis://default:pw@h:6379",
    "rediss://default:pw@h:6379",
    "https://key:pw@api.example.com/v1",
    "amqp://u:pw@h",
  ])("scrubs credentials from %s regardless of scheme", (value) => {
    expect(scrubSecrets(value)).not.toContain("pw");
  });

  it("scrubs every occurrence, not just the first", () => {
    const output = scrubSecrets(
      "primary postgres://u:aaa@h/d replica postgres://u:bbb@h2/d",
    );
    expect(output).not.toContain("aaa");
    expect(output).not.toContain("bbb");
  });

  it("leaves a credential-free URL untouched", () => {
    const value = "https://nnino.vercel.app/products/giraffe-tureen?utm=x";
    expect(scrubSecrets(value)).toBe(value);
  });

  it("does not eat an email address", () => {
    // An @ with no preceding scheme:// is not userinfo. Order numbers, cuids and
    // masked emails must survive — a log that has swallowed the identifier you
    // were tracing is its own kind of outage.
    const value = "order NN-2026-00042 for m***@example.com";
    expect(scrubSecrets(value)).toBe(value);
  });

  it("leaves a bare scheme-less string untouched", () => {
    expect(scrubSecrets("user:password@host")).toBe("user:password@host");
  });
});

describe("redact — credential scrubbing at the sink (Phase 8)", () => {
  it("scrubs an Error message carrying a connection string", () => {
    const error = new Error(
      "P1001: Can't reach database server at postgresql://nnino:leakme@db.example.com:5432/nnino",
    );
    const output = redact(error) as Record<string, unknown>;
    expect(String(output.message)).not.toContain("leakme");
  });

  it("scrubs a connection string nested in a plain string field", () => {
    const output = redact({ detail: "using postgres://u:leakme@h/d" }) as Record<string, unknown>;
    expect(String(output.detail)).not.toContain("leakme");
  });

  it("preserves a machine-readable error code, which is the useful part", () => {
    const error = Object.assign(new Error("nope"), { code: "P2002" });
    const output = redact(error) as Record<string, unknown>;
    expect(output.code).toBe("P2002");
  });

  it("scrubs before truncating, so a cut cannot expose the tail of a secret", () => {
    const padding = "x".repeat(2100);
    const output = String(redact(`${padding} postgres://u:leakme@h/d`));
    expect(output).not.toContain("leakme");
  });
});
