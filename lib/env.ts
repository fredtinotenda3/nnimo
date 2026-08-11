import "server-only";
import { z } from "zod";

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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const base = parsed.data;

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

export const env = base;
export type Env = typeof env;
