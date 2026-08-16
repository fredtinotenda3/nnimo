# Deployment

Target: Vercel + managed Postgres (Neon or Supabase) + S3-compatible object
storage.

## ⚠️ Read this before the first production deploy

`prisma/sql/0002_constraints.sql` and `0003_order_number_sequence.sql` were never
folded into migration history in Phases 1–3. They were applied by hand to the
development database. A fresh `prisma migrate deploy` therefore produced a
database with **no CHECK constraints and no `nnino_order_number_seq`** — and
checkout calls `SELECT nextval('nnino_order_number_seq')` inside its transaction,
so **every checkout would fail** on a brand-new production database.

Migration `20260815090000_phase5_production_constraints` fixes this. It is
idempotent (every statement is guarded by an existence check), so it applies
cleanly both to a fresh database and to the existing one where these objects were
created by hand.

**`npm run db:verify` must pass before you take a single real order.** It checks
for exactly these objects.

## Environment variables

Never commit real values. Set these in the Vercel dashboard.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **Pooled** connection string. Used by the app at runtime. |
| `DIRECT_DATABASE_URL` | **Unpooled**. Used by `prisma migrate`. |
| `AUTH_SECRET` | ≥32 chars. `npx auth secret` or `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical origin, `https://…`. Required for correct cookies. |
| `NEXT_PUBLIC_SITE_URL` | Canonical public origin. Drives canonical URLs, sitemap, OG tags and absolute links in email. |
| `NODE_ENV` | `production` (Vercel sets this). |

### Media — required for production

| Variable | Notes |
|---|---|
| `MEDIA_DRIVER` | **`s3`**. `local` writes to `public/media`, which is ephemeral and per-instance on Vercel — uploads vanish on redeploy. |
| `MEDIA_S3_BUCKET` | |
| `MEDIA_S3_REGION` | |
| `MEDIA_S3_ACCESS_KEY_ID` | |
| `MEDIA_S3_SECRET_ACCESS_KEY` | |
| `MEDIA_S3_PUBLIC_URL` | CDN base URL. Also drives `images.remotePatterns` and the CSP `img-src`. |
| `MEDIA_S3_ENDPOINT` | Only for R2 / B2 / MinIO. Omit for AWS S3. |

`lib/env.ts` refuses to boot with a half-configured S3 driver.

### Payments

| Variable | Notes |
|---|---|
| `PAYMENT_PROVIDER` | `sandbox` or `paynow`. |
| `PAYNOW_INTEGRATION_ID` | Required when `paynow`. |
| `PAYNOW_INTEGRATION_KEY` | Required when `paynow`. |
| `PAYNOW_RETURN_URL` | Absolute https. |
| `PAYNOW_RESULT_URL` | Absolute https — `https://…/api/payments/paynow/callback`. |
| `PAYMENT_REDIRECT_ORIGIN` | Provider origin, for the CSP `form-action`. |
| `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` | Only for a staging environment that deliberately uses test payments. |

**Production will refuse to boot with `PAYMENT_PROVIDER=sandbox`** unless
`PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION="true"` is set. The sandbox provider lets
the caller choose the payment outcome; discovering it is active when a customer
tries to pay is too late.

### Email

| Variable | Notes |
|---|---|
| `EMAIL_TRANSPORT` | `dev`, `none` or `resend`. |
| `EMAIL_FROM` | Must be on a domain you control with SPF/DKIM/DMARC. |
| `EMAIL_API_KEY` | Required when `resend`. |

⚠️ Leave this as `dev` until a sending domain exists. See `docs/operations.md`.

### Rate limiting — strongly recommended

| Variable | Notes |
|---|---|
| `RATE_LIMIT_REDIS_URL` | Upstash Redis REST URL. |
| `RATE_LIMIT_REDIS_TOKEN` | Upstash REST token. |
| `TRUSTED_PROXY_HEADER` | Only if not on Vercel. |

Without these the limiter falls back to a per-instance in-memory counter, which
does not hold across serverless instances. The app logs a warning at startup and
still serves — refusing to start a storefront because a cache is unconfigured
would be the wrong trade — but this is a real reduction in protection.

Both must be set together or neither; `lib/env.ts` enforces that.

### Optional

| Variable | Notes |
|---|---|
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. Defaults to `info` in production. |
| `CSP_REPORT_ONLY` | `"true"` for one deploy while tightening the policy. |

### Seeding only

`SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` — used only by
`npm run db:seed`. **Change the password immediately after first login**, and
remove `SEED_OWNER_PASSWORD` from the environment afterwards.

## Deployment sequence

1. **Provision** Postgres and the bucket. Note the pooled and direct URLs.
2. **Set every variable** above in Vercel, for the Production environment.
3. **Migrate**, using the direct URL:
   ```
   DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy
   ```
   Run this from CI or a workstation, not from a serverless function.
4. **Verify the schema**: `npm run db:verify`. Do not proceed on any `MISSING`.
5. **Seed**, first deploy only: `npm run db:seed`.
6. **Deploy** the application.
7. **Smoke test** — see below.
8. **Change the seeded owner password.**

`npm run build` runs `prisma generate` first, so the client is always generated
against the committed schema.

## Production smoke tests

Run against the real production URL, in order. Stop at the first failure.

1. `GET /` returns 200 and the homepage renders with fonts and images.
2. `curl -sI https://…/ | grep -i content-security-policy` — present, and
   contains `'nonce-` but not `'unsafe-eval'`.
3. `GET /robots.txt` and `/sitemap.xml` return 200 and reference the production
   domain, not localhost.
4. A published product page renders, and its JSON-LD parses
   (Google Rich Results Test).
5. An unpublished product's URL returns 404, and its slug is absent from
   `/sitemap.xml`.
6. `GET /admin` while signed out redirects to `/login`.
7. Sign in as the owner. `/admin` loads.
8. Upload an image in `/admin/media`. It appears, and its URL is on the CDN
   domain. **Redeploy, then confirm it is still there** — this is the test that
   catches `MEDIA_DRIVER=local`.
9. Try to upload a `.txt` renamed to `.png`. It must be refused.
10. Add a purchasable product to the cart, reach `/checkout`, place an order.
11. Confirm the order appears in `/admin/orders` with payment status `UNPAID` or
    `PENDING`.
12. Confirm the confirmation page loads at `/orders/<accessToken>` — **this path
    was broken before Phase 5**.
13. `GET /orders/not-a-real-token` returns 404.
14. Attempt 11 failed logins in a row; the 11th must be rate limited.
15. Check the logs for `rate_limit.backend_degraded`. If present, the Redis
    variables are missing.

## Rollback

The application and the database roll back differently, and this matters.

**Application** — instant, via the Vercel dashboard: promote the previous
deployment. No data implications, provided the database schema has not moved.

**Database** — Prisma has no `migrate down`. Every Phase 5 migration is additive
and idempotent, so the *previous application build runs fine against the new
schema*. That is deliberate: it means a bad deploy is rolled back by reverting
the application alone, with the schema left where it is.

If a schema change genuinely must be undone, restore from a point-in-time backup
(see `docs/operations.md`) and accept the data loss between the restore point and
now. Do not hand-write a reverse migration against a live production database
under time pressure.

**Order of operations for a release that includes a migration:** migrate first,
then deploy. Every Phase 5 migration is backwards-compatible with the currently
deployed code, so there is no window in which the running app sees a schema it
does not understand.
