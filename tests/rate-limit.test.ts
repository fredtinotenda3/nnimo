import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMIT_RULES, __resetRateLimiter, checkRateLimit, rateLimit } from "@/lib/rate-limit";

/**
 * The in-memory backend is what these exercise — the Upstash path needs a
 * network and belongs in an integration test. What matters here is the decision
 * logic: counting, window isolation, per-identity separation, and the
 * fail-closed rule for login.
 */
beforeEach(() => {
  __resetRateLimiter();
});

describe("checkRateLimit", () => {
  it("allows up to the limit and refuses the request after it", async () => {
    const { max } = RATE_LIMIT_RULES.contact;

    for (let i = 0; i < max; i += 1) {
      const result = await checkRateLimit("contact", "identity-a");
      expect(result.allowed).toBe(true);
    }

    const overflow = await checkRateLimit("contact", "identity-a");
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
  });

  it("counts each identity separately", async () => {
    const { max } = RATE_LIMIT_RULES.contact;
    for (let i = 0; i < max; i += 1) await checkRateLimit("contact", "identity-a");

    expect((await checkRateLimit("contact", "identity-a")).allowed).toBe(false);
    expect((await checkRateLimit("contact", "identity-b")).allowed).toBe(true);
  });

  it("counts each rule separately, so one form cannot exhaust another", async () => {
    const { max } = RATE_LIMIT_RULES.contact;
    for (let i = 0; i < max; i += 1) await checkRateLimit("contact", "shared");

    expect((await checkRateLimit("contact", "shared")).allowed).toBe(false);
    expect((await checkRateLimit("commission", "shared")).allowed).toBe(true);
  });

  it("reports remaining requests as the window is consumed", async () => {
    const first = await checkRateLimit("checkout", "identity-c");
    expect(first.remaining).toBe(RATE_LIMIT_RULES.checkout.max - 1);

    const second = await checkRateLimit("checkout", "identity-c");
    expect(second.remaining).toBe(RATE_LIMIT_RULES.checkout.max - 2);
  });

  it("returns a reset time in the future", async () => {
    const result = await checkRateLimit("cart", "identity-d");
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe("rule configuration", () => {
  /**
   * Login is the ONE rule that must fail closed. Unlimited password guessing
   * because a cache is unreachable is a worse outcome than a login outage, and
   * that decision should not be reversible by accident.
   */
  it("makes login fail closed and leaves every other rule fail-open", () => {
    expect(RATE_LIMIT_RULES.login.failClosed).toBe(true);

    for (const [name, rule] of Object.entries(RATE_LIMIT_RULES)) {
      if (name === "login") continue;
      expect(rule.failClosed ?? false).toBe(false);
    }
  });

  it("covers every externally reachable sensitive operation", () => {
    // Phase 5F's list. A rule going missing should fail this test.
    for (const required of [
      "login",
      "contact",
      "commission",
      "cart",
      "checkout",
      "paymentCallback",
      "orderAccess",
      "mediaUpload",
      "adminMutation",
    ]) {
      expect(RATE_LIMIT_RULES).toHaveProperty(required);
    }
  });

  it("sets every limit and window to a sane positive value", () => {
    for (const rule of Object.values(RATE_LIMIT_RULES)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });
});

describe("rateLimit compatibility wrapper", () => {
  it("routes a prefixed key to the matching rule", async () => {
    const { max } = RATE_LIMIT_RULES.commission;
    for (let i = 0; i < max; i += 1) {
      expect(await rateLimit("commission:1.2.3.4")).toBe(true);
    }
    expect(await rateLimit("commission:1.2.3.4")).toBe(false);
  });

  /**
   * An unrecognised prefix must not mean "no limit". It falls back to the
   * strictest public-form rule instead.
   */
  it("falls back to a real limit for an unknown prefix", async () => {
    const { max } = RATE_LIMIT_RULES.contact;
    for (let i = 0; i < max; i += 1) {
      expect(await rateLimit("nonsense:5.6.7.8")).toBe(true);
    }
    expect(await rateLimit("nonsense:5.6.7.8")).toBe(false);
  });
});

/**
 * Regression tests for Phase 8 finding M3.
 *
 * `adminMutation` was defined in Phase 5 and called from nowhere. These lock in the
 * two properties that make it worth having: it exists with sane bounds, and it fails
 * open. A future edit that flips `failClosed` on this rule would mean a Redis outage
 * stops the studio from fulfilling orders — which is precisely the trade Phase 5
 * decided against everywhere except login.
 */
describe("adminMutation rule (Phase 8)", () => {
  it("is defined and bounded", () => {
    const rule = RATE_LIMIT_RULES.adminMutation;
    expect(rule.max).toBeGreaterThan(0);
    expect(rule.windowMs).toBeGreaterThan(0);
  });

  it("is generous enough not to interrupt legitimate bulk admin work", () => {
    // Reordering a collection's images or working an order queue is bursty. A limit
    // that interrupts real work is a limit that gets deleted.
    expect(RATE_LIMIT_RULES.adminMutation.max).toBeGreaterThanOrEqual(60);
  });

  it("fails OPEN, so a cache outage cannot stop the studio taking action", () => {
    expect(RATE_LIMIT_RULES.adminMutation.failClosed ?? false).toBe(false);
  });
});

describe("health rule (Phase 8)", () => {
  it("absorbs a realistic monitoring poll interval", () => {
    // Uptime services poll every 30–60s; this must not flag them.
    const rule = RATE_LIMIT_RULES.health;
    expect(rule.max).toBeGreaterThanOrEqual(60);
    expect(rule.windowMs).toBeLessThanOrEqual(60_000);
  });

  it("fails open, so the limiter cannot manufacture a false outage", () => {
    expect(RATE_LIMIT_RULES.health.failClosed ?? false).toBe(false);
  });
});

describe("login remains the only fail-closed rule (Phase 8 guard)", () => {
  it("keeps exactly one fail-closed rule, and it is login", () => {
    // If a second rule ever becomes fail-closed, that is a deliberate availability
    // trade and should be argued for explicitly rather than arrived at by edit.
    const failClosed = Object.entries(RATE_LIMIT_RULES)
      .filter(([, rule]) => (rule as { failClosed?: boolean }).failClosed)
      .map(([name]) => name);
    expect(failClosed).toEqual(["login"]);
  });
});
