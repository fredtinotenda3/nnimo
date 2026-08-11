import "server-only";

/**
 * Per-process submission throttle for the public forms.
 *
 * Honest about its limits: this is in-memory, so on Vercel each serverless
 * instance keeps its own counter and a flood spread across instances gets
 * through. It stops the common case — one bot hammering one endpoint — at zero
 * infrastructure cost.
 *
 * Before launch this should move to a shared store (Upstash Redis, or a Postgres
 * table with a TTL sweep). Flagged as a pre-launch item in the Phase 2 report
 * rather than presented as finished.
 *
 * Lives in its own module because lib/inquiries.ts is imported by client
 * components for its schemas and option lists, and a `server-only` import
 * anywhere in that graph fails the build.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_PER_WINDOW) return false;

  entry.count += 1;
  return true;
}
