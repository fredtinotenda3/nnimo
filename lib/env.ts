import "server-only";
import { z } from "zod";
import { resolveSiteUrl } from "@/lib/site-url";
import { logger } from "@/lib/logger";
import {
  resolveDeploymentEnv,
  testPaymentsAllowed,
  usesDeprecatedSandboxFlag,
} from "@/lib/payments/environment";

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

  /**
   * Which environment this deployment IS, stated rather than inferred.
   *
   * `next build` sets NODE_ENV=production for staging and preview deployments
   * too, so NODE_ENV cannot distinguish the real shop from a staging copy — and
   * that distinction is what decides whether a test payment provider may
   * operate. Optional: lib/payments/environment.ts falls back to NODE_ENV plus
   * the deprecated PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION flag, defaulting to
   * "production" (the safe assumption) when neither says otherwise.
   */
  DEPLOYMENT_ENV: z.enum(["development", "staging", "production"]).optional(),

  // --- Commerce (Phase 3) --------------------------------------------------
  // Defaults to the sandbox provider so a fresh checkout never accidentally
  // points at a live payment network. "manual" is the production setting until
  // Paynow credentials exist: checkout stays open, orders are created UNPAID,
  // and the studio records payment in the admin.
  PAYMENT_PROVIDER: z.enum(["sandbox", "paynow", "manual"]).default("sandbox"),
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
   * DEPRECATED — use DEPLOYMENT_ENV="staging" instead.
   *
   * Still honoured so existing staging deployments do not change behaviour on
   * this release, but the framing is wrong: it reads as permission to loosen
   * production rather than as a statement about which environment this is, and
   * that framing is how a real shop ends up settling sandbox transactions.
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
 * The sandbox provider must never settle a real order.
 *
 * WHY THIS NO LONGER THROWS
 *
 * It used to. A production build configured with PAYMENT_PROVIDER=sandbox
 * refused to boot, and the error text suggested setting
 * PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION to get past it — which is exactly the
 * setting that lets a caller-chosen payment outcome mark a real customer's order
 * paid. So the design offered two ways out, and the convenient one was the
 * dangerous one. That is a bad guard, however loudly it fails.
 *
 * Manual settlement gives a third answer that is strictly better than both:
 * lib/payments/index.ts resolves the request down to the `manual` provider, and
 * the storefront keeps working with orders created UNPAID. Nothing can be
 * recorded as paid without an operator saying so, so continuing here is failing
 * SAFE rather than failing open — the fallback is the most conservative provider
 * in the registry.
 *
 * The condition is still reported at boot, at error level, because it means the
 * deployment is not configured the way whoever deployed it believed. It is
 * visible in three places: this log line, the one-time log in
 * lib/payments/index.ts, and the admin Settings screen, which reports the
 * RESOLVED provider rather than the requested one.
 */
if (base.PAYMENT_PROVIDER === "sandbox" && !testPaymentsAllowed(process.env)) {
  logger.error("config.sandbox_provider_in_production", {
    deploymentEnv: resolveDeploymentEnv(process.env),
    detail:
      'PAYMENT_PROVIDER="sandbox" on a production deployment. The sandbox provider lets ' +
      "the caller choose the payment outcome, so it has been resolved to manual " +
      "settlement instead: checkout stays open, orders are created UNPAID, and the studio " +
      'confirms payment in the admin. Set PAYMENT_PROVIDER="manual" to make this ' +
      'explicit, or DEPLOYMENT_ENV="staging" if this deployment is not the real shop.',
  });
}

/**
 * Test payments enabled on a production build. Legitimate for staging, and worth
 * a line in the log either way — this is the one setting that allows a payment
 * nobody made to be recorded as real.
 */
if (base.NODE_ENV === "production" && testPaymentsAllowed(process.env)) {
  logger.warn("config.test_payments_enabled", {
    deploymentEnv: resolveDeploymentEnv(process.env),
    deprecatedFlag: usesDeprecatedSandboxFlag(process.env),
    detail:
      "Test payments are enabled on a production build. Correct for staging; wrong for " +
      "the live shop. PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION is deprecated — prefer " +
      'DEPLOYMENT_ENV="staging".',
  });
}

export const env = base;
export type Env = typeof env;
