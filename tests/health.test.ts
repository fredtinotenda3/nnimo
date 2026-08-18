import { describe, expect, it } from "vitest";
import { healthPayload, healthStatusCode } from "@/lib/health";

/**
 * Tests for Phase 8 finding M5.
 *
 * The behavioural assertions here are ordinary. The ones that matter are the
 * negative assertions at the bottom: /api/health is unauthenticated by necessity,
 * so it is the most-probed URL on the deployment, and the risk is not that it
 * reports wrongly but that it reports too much. Those tests fail if someone later
 * adds a build SHA, an environment name or a driver error message "to make
 * debugging easier".
 */
describe("healthPayload", () => {
  const now = new Date("2026-08-17T09:30:00.000Z");

  it("reports ok when the database is reachable", () => {
    const payload = healthPayload({ databaseOk: true, now });
    expect(payload.status).toBe("ok");
    expect(payload.checks.database).toBe("ok");
  });

  it("reports degraded, not down, when the database is unreachable", () => {
    // The handler ran, so the process is alive. That distinction is the whole
    // difference between liveness and readiness.
    const payload = healthPayload({ databaseOk: false, now });
    expect(payload.status).toBe("degraded");
    expect(payload.checks.database).toBe("failed");
  });

  it("stamps an ISO timestamp so a monitor can spot a stale cached response", () => {
    expect(healthPayload({ databaseOk: true, now }).time).toBe("2026-08-17T09:30:00.000Z");
  });

  it("defaults the timestamp to now", () => {
    const before = Date.now();
    const parsed = Date.parse(healthPayload({ databaseOk: true }).time);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("healthStatusCode", () => {
  it("returns 200 when healthy", () => {
    expect(healthStatusCode(healthPayload({ databaseOk: true }))).toBe(200);
  });

  it("returns 503 when degraded", () => {
    // Not 200-with-a-degraded-body: every monitoring product on the market reads
    // the status code, and a 200 would be silently green during an outage.
    expect(healthStatusCode(healthPayload({ databaseOk: false }))).toBe(503);
  });
});

describe("healthPayload — information disclosure", () => {
  const serialised = (databaseOk: boolean) =>
    JSON.stringify(healthPayload({ databaseOk, now: new Date("2026-08-17T09:30:00.000Z") }));

  it("exposes exactly three top-level keys and no more", () => {
    expect(Object.keys(healthPayload({ databaseOk: true })).sort()).toEqual([
      "checks",
      "status",
      "time",
    ]);
  });

  it.each(["version", "commit", "sha", "env", "environment", "uptime", "hostname", "region"])(
    "does not disclose %s",
    (key) => {
      expect(serialised(true)).not.toContain(key);
      expect(serialised(false)).not.toContain(key);
    },
  );

  it("reduces a dependency failure to a flag, never a reason", () => {
    // The driver's own message names the database host and often its version. It
    // belongs in the platform log, which is access-controlled; not in a public
    // response body.
    const payload = healthPayload({ databaseOk: false });
    expect(payload.checks.database).toBe("failed");
    expect(JSON.stringify(payload)).not.toMatch(/postgres|prisma|connect|ECONN|timeout/i);
  });

  it("carries no free-text field an error string could later be dropped into", () => {
    const values = Object.values(healthPayload({ databaseOk: false }).checks);
    for (const value of values) {
      expect(["ok", "failed"]).toContain(value);
    }
  });
});
