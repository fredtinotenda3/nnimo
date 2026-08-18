import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { healthPayload, healthStatusCode } from "@/lib/health";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentityFrom } from "@/lib/security/client-identity";

/**
 * PHASE 8 (finding M5). Liveness and readiness.
 *
 * Nothing existed for a monitor to poll or for a deploy to smoke-test, which is
 * what Section E of the Phase 8 brief asks for. The smoke-test checklist itself was
 * NOT missing — it already exists in docs/deployment.md, which Phase 8 extended to
 * use this endpoint rather than duplicating the list in a new file.
 *
 * WHAT IT CHECKS, AND WHAT IT DOES NOT
 *
 * The database only. That is the one dependency whose absence makes every page of
 * this application fail, because every route is dynamic and reads from Postgres.
 * Deliberately NOT checked:
 *
 *   media storage   With MEDIA_DRIVER=local this is the filesystem, and probing it
 *                   on every poll is a pointless write. An S3 outage degrades image
 *                   delivery; it does not stop orders.
 *   email           The transport is "dev" and sends nothing. A real transport
 *                   failing must not mark the storefront unhealthy — order emails
 *                   are recoverable after the fact, a closed shop is not.
 *   rate-limit cache The limiter is explicitly designed to fail open, so a Redis
 *                   outage is by design not a health event.
 *   payment provider Polling a provider's API on a schedule from a public endpoint
 *                   is a good way to get rate-limited by them.
 *
 * The rule applied: check what would make the site unable to serve, not everything
 * that could conceivably be wrong. A health check that goes red for a recoverable
 * degradation trains its operators to ignore it.
 *
 * NO AUTHENTICATION, BY NECESSITY — an uptime monitor cannot hold a session. That
 * is why lib/health.ts keeps the response body free of anything worth harvesting,
 * why the rate limiter is wired up, and why robots.txt disallows /api/.
 */
export const dynamic = "force-dynamic";
/** Never cached: a cached health check reports the past. */
export const revalidate = 0;

const NO_STORE = {
  // Belt and braces alongside `dynamic`/`revalidate`: this must not be held by a
  // CDN, a proxy, or the monitor's own HTTP client.
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(request: NextRequest) {
  /**
   * Rate limited, but a limited caller is NOT told the site is unhealthy.
   *
   * Reporting 503 to a throttled prober would be a false outage — and worse, it
   * would be a way for a third party to make monitoring believe the site is down
   * by flooding this endpoint. So a throttled call gets 429 and is left to back
   * off, which is a statement about the request rather than about the service.
   */
  const limit = await checkRateLimit("health", clientIdentityFrom(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } },
    );
  }

  let databaseOk = false;
  try {
    /**
     * The cheapest possible round trip. `SELECT 1` touches no table, takes no lock
     * and cannot be affected by row counts, so what it measures is exactly what
     * this endpoint is for: whether a connection can be acquired and a statement
     * executed. Counting rows in a real table would make the probe's cost grow
     * with the business.
     */
    await db.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch (error) {
    // Logged in full (scrubbed by lib/logger.ts, which strips credentials out of
    // driver error messages), returned as a bare boolean.
    logger.error("health.database_unreachable", { error });
  }

  const payload = healthPayload({ databaseOk });
  return NextResponse.json(payload, {
    status: healthStatusCode(payload),
    headers: NO_STORE,
  });
}

/**
 * HEAD is what most uptime monitors send by default, and an unhandled HEAD would
 * 405 and read as an outage. Same checks, no body.
 */
export async function HEAD(request: NextRequest) {
  const response = await GET(request);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
