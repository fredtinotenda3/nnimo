import "server-only";
import { logger } from "@/lib/logger";

/**
 * Rate limiting for every externally reachable sensitive operation.
 *
 * WHY THIS CHANGED IN PHASE 5
 *
 * The Phase 2 implementation was a per-process Map. On Vercel each serverless
 * instance keeps its own counter, so a flood spread across instances multiplies
 * the effective limit by the instance count — and login was not throttled at
 * all. That is fine for a single dev process and not fine for production.
 *
 * WHY NO NEW DEPENDENCY
 *
 * `@upstash/ratelimit` would be the obvious reach, but it pulls in a client, a
 * scripting layer and its own algorithm selection for what is, at bottom, one
 * atomic INCR with a TTL. Upstash exposes exactly that over an authenticated
 * HTTPS endpoint, so the "driver" here is a fetch call. Zero dependencies, and
 * the same REST shape works against Upstash Redis or any Redis proxy that speaks
 * it. Swapping in a different backend means implementing one interface.
 *
 * ALGORITHM
 *
 * Fixed window, not a sliding log. A fixed window can let up to 2x the limit
 * through across a window boundary; a sliding window costs a sorted set and
 * several round trips per request. For abuse protection on a small studio's
 * storefront, the boundary burst is an acceptable trade against latency on every
 * checkout — and the limits below are set low enough that 2x is still safe.
 *
 * FAILURE POLICY
 *
 * Fail-OPEN on backend errors, and log loudly. A Redis outage must not stop
 * Nnino taking orders. The exception is the login limiter, which fails CLOSED —
 * see `RateLimitRule.failClosed`. Letting unlimited password guesses through
 * because a cache is down is the wrong trade.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix ms when the window resets. */
  resetAt: number;
  /** True when the decision came from the fail-open path rather than a counter. */
  degraded: boolean;
};

export type RateLimitRule = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum permitted hits per window. */
  max: number;
  /**
   * Deny the request when the backend is unreachable. Only appropriate where
   * unlimited attempts are worse than a temporary outage — i.e. authentication.
   */
  failClosed?: boolean;
};

interface RateLimitBackend {
  readonly id: string;
  /** Increments the counter for `key` and returns the new count plus reset time. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

// ---------------------------------------------------------------------------
// Development / single-instance backend
// ---------------------------------------------------------------------------

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Bounded so a key-space flood (one entry per spoofed IP) cannot grow the map
 * until the process runs out of memory. When the cap is hit, expired entries are
 * swept first and only then is the oldest window discarded.
 */
const MEMORY_MAX_KEYS = 10_000;

function sweepMemory(now: number): void {
  for (const [key, entry] of memory) {
    if (entry.resetAt <= now) memory.delete(key);
  }
}

const memoryBackend: RateLimitBackend = {
  id: "memory",
  async hit(key, windowMs) {
    const now = Date.now();
    const entry = memory.get(key);

    if (!entry || entry.resetAt <= now) {
      if (memory.size >= MEMORY_MAX_KEYS) {
        sweepMemory(now);
        if (memory.size >= MEMORY_MAX_KEYS) {
          const oldest = memory.keys().next().value;
          if (oldest !== undefined) memory.delete(oldest);
        }
      }
      const fresh = { count: 1, resetAt: now + windowMs };
      memory.set(key, fresh);
      return fresh;
    }

    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  },
};

// ---------------------------------------------------------------------------
// Production backend — Upstash Redis REST
// ---------------------------------------------------------------------------

/**
 * INCR then, only on the first hit of a window, PEXPIRE.
 *
 * Setting the TTL only when the counter is 1 is what makes this a fixed window
 * rather than one that never expires: re-issuing PEXPIRE on every hit would push
 * the reset forward indefinitely and a busy key would never clear.
 *
 * INCR and PTTL are sent as one pipeline, so the decision costs a single round
 * trip. PTTL of -1 (key exists, no TTL) is treated as "needs a window", which
 * closes the gap left by a crash between the two commands.
 */
function upstashBackend(url: string, token: string): RateLimitBackend {
  const base = url.replace(/\/$/, "");

  return {
    id: "upstash",
    async hit(key, windowMs) {
      const namespaced = `rl:${key}`;
      const response = await fetch(`${base}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", namespaced],
          ["PTTL", namespaced],
        ]),
        // Never let a slow cache hold a checkout open.
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Upstash responded ${response.status}`);
      }

      const body = (await response.json()) as { result?: number; error?: string }[];
      const count = Number(body[0]?.result ?? 0);
      const pttl = Number(body[1]?.result ?? -1);

      if (!Number.isFinite(count) || count <= 0) {
        throw new Error("Upstash returned an unusable counter");
      }

      // -1 means the key exists with no TTL, -2 means it is already gone. Either
      // way it needs a window, and so does the first hit.
      if (count === 1 || pttl < 0) {
        await fetch(`${base}/pexpire/${encodeURIComponent(namespaced)}/${windowMs}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(1500),
          cache: "no-store",
        }).catch(() => undefined);
        return { count, resetAt: Date.now() + windowMs };
      }

      return { count, resetAt: Date.now() + pttl };
    },
  };
}

let cachedBackend: RateLimitBackend | null = null;

function backend(): RateLimitBackend {
  if (cachedBackend) return cachedBackend;

  const url = process.env.RATE_LIMIT_REDIS_URL?.trim();
  const token = process.env.RATE_LIMIT_REDIS_TOKEN?.trim();

  if (url && token) {
    cachedBackend = upstashBackend(url, token);
  } else {
    if (process.env.NODE_ENV === "production") {
      // Not fatal — the app must still serve — but this is a real reduction in
      // protection and an operator needs to know it happened.
      logger.warn("rate_limit.backend_degraded", {
        detail:
          "RATE_LIMIT_REDIS_URL/RATE_LIMIT_REDIS_TOKEN are unset in production; " +
          "falling back to a per-instance in-memory limiter, which does not hold across instances.",
      });
    }
    cachedBackend = memoryBackend;
  }

  return cachedBackend;
}

/** Test seam — resets the memoised backend and the in-memory counters. */
export function __resetRateLimiter(): void {
  cachedBackend = null;
  memory.clear();
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;

/**
 * One named rule per protected operation.
 *
 * Named rather than ad-hoc numbers at each call site so the whole abuse surface
 * is reviewable in one place, and so a limit can be tuned without hunting
 * through route handlers.
 */
export const RATE_LIMIT_RULES = {
  /**
   * Fails CLOSED. Ten attempts per fifteen minutes per IP is generous for a
   * ten-person studio and hostile to credential stuffing.
   */
  login: { windowMs: 15 * MINUTE, max: 10, failClosed: true },

  /** Public enquiry forms — the Phase 2 limits, preserved. */
  commission: { windowMs: 10 * MINUTE, max: 5, failClosed: false },
  contact: { windowMs: 10 * MINUTE, max: 5, failClosed: false },

  /** Cart mutation. Loose: a real shopper clicks +/- repeatedly. */
  cart: { windowMs: MINUTE, max: 60, failClosed: false },

  /** Order placement. A human places one order; a script places hundreds. */
  checkout: { windowMs: 10 * MINUTE, max: 10, failClosed: false },

  /**
   * Provider callbacks. High, because a provider legitimately retries and
   * throttling a real settlement callback would be worse than the abuse it
   * prevents — this is a flood guard, not an access control. Authentication of
   * the callback is the actual control.
   */
  paymentCallback: { windowMs: MINUTE, max: 120, failClosed: false },

  /**
   * Guest order lookup. The token is a UUIDv4, so brute force is already
   * infeasible; this caps the enumeration attempt's cost to us.
   */
  orderAccess: { windowMs: 5 * MINUTE, max: 60, failClosed: false },

  /** Admin media upload. Authenticated already; this bounds accidental floods. */
  mediaUpload: { windowMs: 10 * MINUTE, max: 60, failClosed: false },

  /** Catch-all for authenticated admin mutations. */
  adminMutation: { windowMs: MINUTE, max: 120, failClosed: false },

  /**
   * PHASE 8. /api/health.
   *
   * Bounded because the endpoint touches the database, so an unauthenticated
   * caller could otherwise use it to generate one query per request — cheap
   * individually, not cheap at volume, and pointed at the one resource whose
   * exhaustion takes the storefront down with it.
   *
   * Set high enough for real monitoring: 120/minute per IP absorbs a 1-second
   * poll interval with room to spare, and uptime services poll every 30–60s.
   * Fails OPEN, and the route treats a rate-limited call as still-healthy rather
   * than reporting a false outage — see app/api/health/route.ts.
   */
  health: { windowMs: MINUTE, max: 120, failClosed: false },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMIT_RULES;

/**
 * Applies a named rule to an identity bucket.
 *
 * `identity` is whatever distinguishes one caller from another — usually a
 * client IP, sometimes an account id.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identity: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMIT_RULES[name] as RateLimitRule;
  const key = `${name}:${identity}`;

  try {
    const { count, resetAt } = await backend().hit(key, rule.windowMs);
    const allowed = count <= rule.max;

    if (!allowed) {
      logger.warn("rate_limit.exceeded", { rule: name, count, limit: rule.max });
    }

    return { allowed, remaining: Math.max(0, rule.max - count), resetAt, degraded: false };
  } catch (error) {
    logger.error("rate_limit.backend_error", { rule: name, error });

    if (rule.failClosed) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + rule.windowMs, degraded: true };
    }
    return {
      allowed: true,
      remaining: rule.max,
      resetAt: Date.now() + rule.windowMs,
      degraded: true,
    };
  }
}

/**
 * Backwards-compatible wrapper for the Phase 2 call sites.
 *
 * The public forms call `rateLimit("commission:1.2.3.4")`. Keeping the shape
 * means those call sites did not have to change, and the boolean still means
 * "may proceed". An unrecognised prefix falls back to the strictest public-form
 * rule rather than to no limit.
 */
export async function rateLimit(key: string): Promise<boolean> {
  const [prefix, ...rest] = key.split(":");
  const name: RateLimitName =
    prefix && prefix in RATE_LIMIT_RULES ? (prefix as RateLimitName) : "contact";
  const result = await checkRateLimit(name, rest.join(":") || "unknown");
  return result.allowed;
}
