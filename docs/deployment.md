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

## ⚠️ Phase 8 changed one variable from optional to required

`NEXT_PUBLIC_SITE_URL` is now **mandatory in production**, must use `https`, and
must not be a loopback host. `lib/site-url.ts` throws otherwise, and because
`app/layout.tsx` imports it, **the build or the first render will fail** rather
than serve wrong metadata.

This is deliberate. Before Phase 8, three separate files fell back to
`http://localhost:3000` when the variable was absent — so a missing value produced
a sitemap, a set of canonical tags and a `robots.txt` full of localhost URLs, with
no error and no log line. The only symptom was that the site indexed badly, weeks
later.

**Check this variable in the Vercel dashboard before deploying Phase 8.** If it is
already set to the production https origin, nothing changes for you.

## Environment variables

Never commit real values. Set these in the Vercel dashboard.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **Pooled** connection string. Used by the app at runtime. |
| `DIRECT_DATABASE_URL` | **Unpooled**. Used by `prisma migrate`. |
| `AUTH_SECRET` | ≥32 chars. `npx auth secret` or `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical origin, `https://…`. Required for correct cookies. |
| `NEXT_PUBLIC_SITE_URL` | Canonical public origin. Drives canonical URLs, sitemap, `robots.txt`, OG tags and absolute links in email. **Phase 8: must be https and non-loopback, or the app refuses to boot.** |
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
| `DEPLOYMENT_ENV` | `development`, `staging` or `production`. State it — `next build` sets `NODE_ENV=production` for staging too. Unset production builds are treated as the real shop. |
| `PAYMENT_PROVIDER` | `manual`, `sandbox` or `paynow`. **Use `manual` in production** until Paynow exists. |
| `PAYNOW_INTEGRATION_ID` | Required when `paynow`. |
| `PAYNOW_INTEGRATION_KEY` | Required when `paynow`. |
| `PAYNOW_RETURN_URL` | Absolute https. |
| `PAYNOW_RESULT_URL` | Absolute https — `https://…/api/payments/paynow/callback`. |
| `PAYMENT_REDIRECT_ORIGIN` | Provider origin, for the CSP `form-action`. |
| `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` | **Deprecated** — use `DEPLOYMENT_ENV="staging"`. Still honoured. |

**`PAYMENT_PROVIDER=sandbox` on a production deployment resolves to `manual`**
and logs `config.sandbox_provider_in_production` at error level. It no longer
refuses to boot: the old behaviour left an operator with two ways out, and the
convenient one — setting `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` — was the
dangerous one. Falling back to manual settlement keeps the storefront up and
makes a false `PAID` impossible.

Under manual settlement, orders are created `UNPAID` and the studio confirms
payment in `/admin/orders/<id>`. That requires the `order:settle` permission
(OWNER and MANAGER).

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
| `DATABASE_POOL_MAX` | Phase 8. Max pg connections **per instance**. Defaults to 5. Raise only with evidence; see the connection-pool note in `docs/operations.md`. |

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

Added in Phase 8 — run these too:

16. `curl -s https://…/api/health` returns `200` and
    `{"status":"ok","checks":{"database":"ok"},...}`. A `503` with
    `"database":"failed"` means the app is up and Postgres is not; check
    `DATABASE_URL` and the pooled endpoint. **This is the single best
    post-deploy check** — it is the only one that proves the runtime can reach the
    database.
17. `curl -sI https://…/api/health | grep -i cache-control` contains `no-store`. A
    cached health check reports the past.
18. `GET /a-url-that-does-not-exist` returns 404 **and renders the branded Nnino
    page** with a working navigation list — not the default Next.js 404.
19. `GET /products/a-slug-that-does-not-exist` returns the branded 404 **with the
    site header and footer present**. This is a different file from the one above
    (`app/(site)/not-found.tsx` vs `app/not-found.tsx`) and both need checking.
20. `GET /robots.txt` disallows `/orders/`, `/cart` and `/checkout/` as well as
    `/admin`.
21. `curl -sI https://…/opengraph-image` returns 200 and `content-type: image/png`.
    Then paste the homepage URL into a WhatsApp draft and confirm a preview card
    renders with an image — before Phase 8 this was a blank grey panel.
22. `GET /manifest.webmanifest` returns 200 and valid JSON.
23. Sign in, then open the mobile navigation on a phone (or a narrow window) and
    press `Tab` repeatedly. Focus must stay inside the drawer, and `Escape` must
    close it and return focus to the hamburger button.

**One test that cannot be automated and must not be skipped:** on the homepage
hero, check the transparent-header navigation text against the photograph behind
it with a contrast checker. The palette tokens are AA-compliant on the warm
background, but the over-hero state renders `warm-white/80` on whatever image is
loaded, and that is a per-photograph property no static audit can settle.

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
