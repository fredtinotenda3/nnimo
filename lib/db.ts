import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The Prisma client, one per process.
 *
 * PHASE 8 CHANGES (finding M1) — connection management for serverless.
 *
 * Two things were wrong for a Vercel deployment, neither of which shows up locally:
 *
 * 1. NO POOL BOUND. `PrismaPg` passes its options through to node-postgres, whose
 *    default pool size is 10 per process. On a single long-lived server that is
 *    fine. On Vercel it is 10 per concurrently-warm instance, so a traffic spike
 *    that warms twenty instances reaches for two hundred connections against a
 *    managed Postgres whose limit is typically in the low hundreds. The symptom is
 *    not gradual: it is "too many clients already" on every route simultaneously,
 *    including /admin, so the studio cannot even log in to see what is happening.
 *
 *    `max` is now bounded and configurable. The default of 5 is a compromise, not
 *    a magic number: the public pages issue 3–4 queries in a `Promise.all` (see
 *    app/(site)/page.tsx and shop/page.tsx), so a pool of 1 would serialise them
 *    and make every page slower, while 5 leaves headroom for those to run in
 *    parallel and still keeps 20 warm instances under 100 connections.
 *
 * 2. NO IDLE REAPING. An instance that served one request then went quiet held its
 *    connections open until the platform froze it. `idleTimeoutMillis` returns them
 *    to the server instead, which is what makes the arithmetic above hold at all —
 *    otherwise the ceiling is the number of instances ever warmed, not the number
 *    currently working.
 *
 * MARKED AS REASONED, NOT MEASURED. Phase 8 could not run a load test, so these
 * numbers are derived from the query patterns in the repository and the documented
 * connection ceilings of managed Postgres, not from observed saturation. Revisit
 * with real numbers once there is production traffic — docs/operations.md records
 * what to look at.
 *
 * PGBOUNCER / POOLED ENDPOINT IS STILL REQUIRED. This bound reduces the damage; it
 * is not a substitute for pointing DATABASE_URL at the provider's pooled endpoint.
 * See docs/deployment.md.
 *
 * WHY process.env AND NOT lib/env.ts: importing the env module here would make the
 * database client depend on validation of every unrelated variable (media, payments,
 * email), so a typo'd EMAIL_FROM would surface as a database import failure.
 * DATABASE_POOL_MAX is declared and validated in lib/env.ts for documentation and
 * boot-time checking; the read here is defensive and independently safe.
 */
function poolMax(): number {
  const parsed = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) return parsed;
  return 5;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: poolMax(),
    // Hand idle connections back rather than holding them for the lifetime of a
    // frozen serverless instance.
    idleTimeoutMillis: 10_000,
    // Fail a connection attempt rather than hanging a request for the platform's
    // whole function timeout. A fast error reaches the error boundary and the
    // health check; a hang reaches neither.
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Cached on globalThis in EVERY environment as of Phase 8.
 *
 * Previously the cache was populated only outside production, which is the
 * well-known recipe for surviving dev-server hot reload. That reasoning is sound
 * but incomplete: in production the module is normally evaluated once per instance,
 * so the cache appears unnecessary — until something evaluates it twice (two
 * bundles including it, or a route in a different runtime), at which point a second
 * pool silently doubles the connection count with nothing in the logs to say so.
 * Caching unconditionally makes "one client per process" true by construction
 * rather than by assumption, and costs nothing.
 */
export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
