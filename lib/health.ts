/**
 * Health check payload shaping.
 *
 * PHASE 8 (finding M5). Pure and dependency-free, separately from the route, for
 * one reason: the interesting property of a health endpoint is what it does NOT
 * say, and that is only testable if the shaping is not tangled up with a database
 * call. app/api/health/route.ts performs the check; this decides what the world is
 * told about it.
 *
 * WHAT A HEALTH ENDPOINT MUST NOT DISCLOSE
 *
 * This endpoint is unauthenticated by necessity — an uptime monitor cannot hold a
 * session — which makes it the most-probed URL on the deployment. The reflex is to
 * make it informative: version, commit SHA, environment name, uptime, which
 * dependency failed and why. Every one of those is reconnaissance. A build SHA
 * dates the deployment against published CVEs; a driver error message names the
 * database host and often its version; "environment: staging" tells an attacker
 * which host to prefer.
 *
 * So the contract is deliberately thin: a status, a per-dependency ok/failed flag,
 * and a timestamp. An operator who needs to know WHY reads the platform log, where
 * the failure is recorded with its correlation id. The monitor only needs to know
 * WHETHER.
 */

export type HealthCheckName = "database";

export type HealthStatus = "ok" | "degraded";

export type HealthPayload = {
  status: HealthStatus;
  checks: Record<HealthCheckName, "ok" | "failed">;
  /** ISO 8601, so a monitor can detect a stale cached response. */
  time: string;
};

export type HealthInput = {
  /** Whether the readiness probe reached the database. */
  databaseOk: boolean;
  /** Injected so the payload is deterministic under test. */
  now?: Date;
};

/**
 * Builds the response body.
 *
 * "degraded" rather than "down": if this handler ran at all the process is alive,
 * which is precisely the distinction between liveness and readiness. A monitor that
 * gets no response at all knows the deployment is down; one that gets this knows
 * the deployment is up and a dependency is not.
 */
export function healthPayload(input: HealthInput): HealthPayload {
  return {
    status: input.databaseOk ? "ok" : "degraded",
    checks: { database: input.databaseOk ? "ok" : "failed" },
    time: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * HTTP status for a payload.
 *
 * 503 on a failed dependency, because that is what makes an uptime monitor and a
 * load balancer both treat the instance as not-ready without further
 * configuration. 200 with `{"status":"degraded"}` in the body would be silently
 * green on every monitoring product in existence.
 */
export function healthStatusCode(payload: HealthPayload): number {
  return payload.status === "ok" ? 200 : 503;
}
