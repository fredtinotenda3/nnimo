import "server-only";
import { z } from "zod";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Fail fast on misconfiguration. A missing AUTH_SECRET or DATABASE_URL should
 * stop the process at boot, not surface as a confusing runtime error later.
 *
 * Only `NEXT_PUBLIC_*` values are safe to read on the client; everything in
 * here is server-only and enforced by the "server-only" import above.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection string"),
  DIRECT_DATABASE_URL: z.string().url().optional(),

  /**
   * PHASE 8 (finding M1). Upper bound on pg connections held per instance.
   *
   * Left unset, node-postgres defaults to a pool of 10 PER PROCESS. On Vercel
   * that is 10 per concurrently-warm serverless instance, so twenty instances
   * under load reach for two hundred connections against a managed Postgres whose
   * ceiling is commonly a few hundred — and the failure mode is not a slow site,
   * it is "too many clients already" on every route at once.
   *
   * Validated but read directly by lib/db.ts, which is documented there.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters — generate one with `npx auth secret`"),
  AUTH_URL: z.string().url().optional(),

  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  MEDIA_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_S3_BUCKET: z.string().min(1).optional(),
  MEDIA_S3_REGION: z.string().min(1).optional(),
  MEDIA_S3_ENDPOINT: z.string().url().optional(),
  MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_S3_PUBLIC_URL: z.string().url().optional(),

  // --- Commerce (Phase 3) --------------------------------------------------
  // Defaults to the sandbox provider so a fresh checkout never accidentally
  // points at a live payment network.
  PAYMENT_PROVIDER: z.enum(["sandbox", "paynow"]).default("sandbox"),
  PAYNOW_INTEGRATION_ID: z.string().min(1).optional(),
  PAYNOW_INTEGRATION_KEY: z.string().min(1).optional(),
  PAYNOW_RETURN_URL: z.string().url().optional(),
  PAYNOW_RESULT_URL: z.string().url().optional(),

  EMAIL_TRANSPORT: z.enum(["dev", "none", "resend"]).default("dev"),
  EMAIL_FROM: z.string().min(3).default("Nnino Ceramics <orders@example.invalid>"),
  EMAIL_API_KEY: z.string().min(1).optional(),

  // --- Phase 5: production hardening ---------------------------------------

  /**
   * Distributed rate-limit backend (Upstash Redis REST, or anything speaking the
   * same shape). Optional: without it the limiter falls back to a per-instance
   * in-memory counter, which is correct for development and materially weaker on
   * Vercel. lib/rate-limit.ts logs a warning when that fallback happens in
   * production rather than failing the boot — refusing to start a storefront
   * because a cache is unconfigured would be the wrong trade.
   */
  RATE_LIMIT_REDIS_URL: z.string().url().optional(),
  RATE_LIMIT_REDIS_TOKEN: z.string().min(1).optional(),

  /**
   * Header carrying the true client IP, when the platform is not Vercel.
   * Left unset, lib/security/client-identity.ts uses x-forwarded-for's leftmost
   * entry, which is correct on Vercel and wrong behind some other proxies.
   */
  TRUSTED_PROXY_HEADER: z.string().min(1).optional(),

  /** Origin the active payment provider redirects to, for the CSP form-action. */
  PAYMENT_REDIRECT_ORIGIN: z.string().url().optional(),

  /** Ship the CSP in report-only mode for one deploy while tightening it. */
  CSP_REPORT_ONLY: z.enum(["true", "false"]).optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

  /**
   * Deliberate, loud opt-in to the test payment provider in production.
   * Named to be obvious in a log and in the Vercel dashboard.
   */
  PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: z.enum(["true", "false"]).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const base = parsed.data;

/**
 * PHASE 8 (finding H1). The Zod default above keeps development and test working
 * without configuration, but a default is the wrong behaviour in production: an
 * unset NEXT_PUBLIC_SITE_URL would silently publish canonical URLs, OpenGraph
 * tags and a sitemap full of http://localhost:3000.
 *
 * The rule lives in lib/site-url.ts so there is exactly one implementation; this
 * call is here so the failure happens at boot rather than at first render.
 */
resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, base.NODE_ENV);

// The S3 driver needs its whole credential set or none of it — a half-configured
// bucket silently writing nowhere is worse than refusing to start.
if (base.MEDIA_DRIVER === "s3") {
  const required = [
    "MEDIA_S3_BUCKET",
    "MEDIA_S3_REGION",
    "MEDIA_S3_ACCESS_KEY_ID",
    "MEDIA_S3_SECRET_ACCESS_KEY",
    "MEDIA_S3_PUBLIC_URL",
  ] as const;
  const missing = required.filter((k) => !base[k]);
  if (missing.length > 0) {
    throw new Error(
      `MEDIA_DRIVER=s3 requires: ${missing.join(", ")}. Set them or use MEDIA_DRIVER=local.`,
    );
  }
}

// Paynow needs its whole credential set or none of it. A half-configured
// provider that silently fails mid-checkout is worse than refusing to boot.
if (base.PAYMENT_PROVIDER === "paynow") {
  const required = [
    "PAYNOW_INTEGRATION_ID",
    "PAYNOW_INTEGRATION_KEY",
    "PAYNOW_RETURN_URL",
    "PAYNOW_RESULT_URL",
  ] as const;
  const missing = required.filter((key) => !base[key]);
  if (missing.length > 0) {
    throw new Error(
      `PAYMENT_PROVIDER=paynow requires: ${missing.join(", ")}. ` +
        "Set them, or use PAYMENT_PROVIDER=sandbox until the credentials arrive.",
    );
  }
}

// The production email transport needs its key AND a from-address. A transport
// selected but unable to send is worse than one that was never selected: order
// confirmations would silently fall back to the log.
if (base.EMAIL_TRANSPORT === "resend" && !base.EMAIL_API_KEY) {
  throw new Error(
    'EMAIL_TRANSPORT="resend" requires EMAIL_API_KEY. ' +
      'Set it, or use EMAIL_TRANSPORT="dev" until the sending domain is configured.',
  );
}

// The distributed limiter is all-or-nothing: a URL with no token cannot
// authenticate, and would silently degrade to the in-memory limiter.
if (Boolean(base.RATE_LIMIT_REDIS_URL) !== Boolean(base.RATE_LIMIT_REDIS_TOKEN)) {
  throw new Error(
    "RATE_LIMIT_REDIS_URL and RATE_LIMIT_REDIS_TOKEN must be set together, or neither.",
  );
}

/**
 * Production refuses to boot with the sandbox payment provider unless someone
 * has explicitly said so.
 *
 * The sandbox provider lets a caller choose whether a payment "succeeded". That
 * is exactly right in development and catastrophic in production, so reaching it
 * takes a deliberate variable rather than an unnoticed default. The check lives
 * here, at boot, rather than at checkout time — discovering it when a customer
 * tries to pay is too late.
 */
if (
  base.NODE_ENV === "production" &&
  base.PAYMENT_PROVIDER === "sandbox" &&
  base.PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION !== "true"
) {
  throw new Error(
    'PAYMENT_PROVIDER="sandbox" in production. The sandbox provider lets the caller ' +
      "choose the payment outcome and must never handle real orders. Configure a real " +
      'provider, or set PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION="true" if this is a ' +
      "staging environment that deliberately uses test payments.",
  );
}

export const env = base;
export type Env = typeof env;
