# Operations

## Logging

Structured JSON to stdout/stderr (`lib/logger.ts`). No logging dependency —
Vercel, CloudWatch, Datadog and Loki all ingest JSON lines, and the platform
already provides the transport.

Redaction happens **structurally, on the way out**, not at each call site. Keys
containing `password`, `secret`, `token`, `key`, `authorization`, `cookie`,
`signature` and similar are replaced with `[redacted]`; emails and phone numbers
are masked to `m***@example.com` and `***567` so a log line stays useful for
support without becoming a PII dump.

`LOG_LEVEL` controls verbosity; `info` in production.

### Events worth alerting on

| Event | Meaning | Urgency |
|---|---|---|
| `payment.verification_mismatch` | Provider's amount or currency disagrees with the order. | **Page someone.** |
| `inventory.commit_failed` | Order paid, stock not decremented. Needs manual correction. | High |
| `inventory.release_failed` | Stock held against a dead order. Availability understated. | Medium |
| `webhook.verification_failed` | Callback authenticated but verification failed; provider will retry. | High if repeating |
| `webhook.rejected_unauthenticated` | Failed signature check. One is noise; a burst is an attack. | Medium |
| `rate_limit.backend_degraded` | Redis unconfigured in production; limiter is per-instance. | High |
| `rate_limit.backend_error` | Redis unreachable. Login is failing closed. | High |
| `email.transport_not_configured` | Selected transport cannot send; mail is going to the log. | High |
| `email.delivery_failed` | A customer did not get their email. | Medium |
| `auth.login_rate_limited` | Sustained bursts indicate credential stuffing. | Medium |
| `media.s3_put_failed` | Uploads are failing. | Medium |

### Correlation

Route handlers derive a request id from `x-request-id` or Vercel's `x-vercel-id`,
falling back to a fresh UUID, and stamp it on every line via `logger.child()`.
The payment callback returns it in the response body, so a provider's delivery
log can be joined to ours during reconciliation.

## Backup and restore

**⚠️ REQUIRES MANUAL CONFIGURATION.** Backups are a function of the managed
Postgres provider and are not configured by this repository.

Before launch:

- Enable point-in-time recovery. Neon and Supabase both offer it; confirm the
  retention window is at least 7 days.
- Take a manual snapshot immediately before any migration.
- **Test a restore into a scratch database at least once.** An untested backup is
  a hypothesis.
- Object storage: enable bucket versioning so a mistaken delete is recoverable.
  The application deletes objects for real.

Restore procedure:

1. Restore to a **new** database. Never restore over a live one.
2. Point `DIRECT_DATABASE_URL` at it and run `npm run db:verify`.
3. Repoint `DATABASE_URL` and redeploy.
4. Reconcile payments taken between the restore point and now, from the provider
   dashboard and `PaymentWebhookEvent`.

## Email

**⚠️ BLOCKED on a business decision.** `EMAIL_TRANSPORT` stays `dev` — messages
are written to the server log rather than sent.

Nnino's published addresses are Gmail. Transactional mail sent "from" a
gmail.com address through a third-party provider fails DMARC alignment and is
quarantined or rejected. An order confirmation that silently vanishes is worse
than one never attempted.

To enable production email:

1. **Register or confirm a sending domain** (e.g. `nninoceramics.co.zw`).
2. Create an account with a transactional provider. `lib/email/resend-transport.ts`
   implements Resend; Postmark or SES is a second file implementing
   `EmailTransport` plus one registry entry.
3. Publish the **SPF**, **DKIM** and **DMARC** records the provider specifies.
4. Verify the domain in the provider dashboard.
5. Set `EMAIL_FROM` to an address on that domain, `EMAIL_API_KEY`, and
   `EMAIL_TRANSPORT="resend"`.
6. Place a test order and confirm delivery to Gmail, Outlook **and** a Zimbabwean
   ISP address. Check it lands in the inbox, not spam.

`lib/env.ts` refuses to boot with `EMAIL_TRANSPORT="resend"` and no API key. If
the transport is selected but unconfigured, the app logs
`email.transport_not_configured` and falls back to the log rather than silently
dropping mail.

## Incident response

**A customer says they paid but the order shows unpaid**

1. Find the order in `/admin/orders`. Note the order number.
2. Search logs for that order number. Look for `payment.verified`,
   `payment.verification_mismatch`, `webhook.*`.
3. Check `PaymentWebhookEvent` for a row with `processedAt IS NULL` — that is a
   callback received but not completed.
4. Confirm in the provider dashboard that the payment actually settled, and for
   the right amount **and currency**.
5. If it settled and we missed it, the fix is to re-run verification, not to edit
   the order by hand. Editing the order bypasses the inventory commit and the
   audit entry.

**Suspected fraudulent order**

1. Do not delete it. Cancel it via the admin — that releases the stock
   reservation and writes an audit entry.
2. Refund through the provider dashboard (Paynow has no refund API).
3. Record the reconciliation against the order.

**Secret leaked**

1. Rotate immediately in the provider's dashboard.
2. Update the Vercel environment variable and redeploy.
3. `AUTH_SECRET` rotation invalidates every session — all admins must sign in
   again. It also changes the rate-limiter identity salt, which resets counters.
   Expect both.
4. Review the audit log for anything the leak window allowed.

**Site is up but nothing can be bought**

Check, in order: `npm run db:verify` (is `nnino_order_number_seq` present?);
`PAYMENT_PROVIDER` and whether the provider reports configured; logs for
`checkout.order_creation_failed`.

## Routine admin workflow

**Daily:** review new orders, confirm those that are paid, check for new
enquiries.

**Weekly:** review stock and the low-stock list; review the audit log (OWNER
only); check for `payment.verification_mismatch` and unprocessed webhook events.

**Monthly:** review admin accounts and deactivate anyone who has left; confirm
backups are running; check the media library for orphaned images.

## Housekeeping not yet automated

**⚠️ Not implemented — decide before these become a problem.**

- **Abandoned carts.** `Cart` rows live for 30 days by cookie but are never
  swept. They accumulate.
- **Stale reservations.** An order that is never paid and never cancelled holds
  its stock indefinitely. Payment failure and cancellation both release
  correctly; there is no timeout for an order that simply sits. Consider a job
  that cancels unpaid orders after N days — N is a business decision.
- **Webhook event retention.** `PaymentWebhookEvent` grows without bound and
  holds full provider payloads. Consider pruning processed events older than a
  retention period.
- **Log retention** is whatever Vercel's plan provides.
