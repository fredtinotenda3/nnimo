# PHASE 5 IMPLEMENTATION REPORT

Nnino Ceramics — production hardening and launch readiness.

Status legend: ✅ VERIFIED · ⚠️ REQUIRES MANUAL CONFIGURATION · ⚠️ REQUIRES
EXTERNAL SERVICE · ❌ NOT VERIFIED · 🚫 BLOCKED

---

## 1. Executive summary

Phase 5A discovery found **three critical defects** that would have caused
production failure or customer-data disclosure, and **seven high-severity
issues**. All ten are fixed. The application is materially closer to launchable,
but **it cannot take real money yet**, for reasons that are business blockers
rather than engineering ones (Paynow credentials, a sending domain, an object
storage bucket).

The three critical findings, in order of how badly they would have hurt:

1. **A fresh production database would have broken every checkout.** The CHECK
   constraints and the order-number sequence were never folded into migration
   history — they lived in `prisma/sql/*.sql` and had been applied to the dev
   database by hand. `prisma migrate deploy` against a new Neon database would
   produce a schema with no `nnino_order_number_seq`, and checkout calls
   `nextval()` on it inside its transaction.
2. **Any visitor could harvest every customer's personal details.** The sandbox
   payment page took only an order number, looked the order up, and rendered its
   `accessToken` into the page. Order numbers are sequential. The same route's
   action would also mark any order PAID given only its number.
3. **Stock reservations were never resolved.** `commitReservation` and
   `releaseReservation` existed and were called only from tests. Reserved stock
   only ever went up.

**The most important caveat in this report:** the verification gate was **not
run**. See §14.

---

## 2. Discovery findings

Read-only inspection of the repository as supplied.

**Baseline could not be fully established as specified.** The archive contains no
`.git` directory, so `git status`, `git diff` and `git diff --stat` were not
available. Baseline is therefore the file tree as delivered.

Test baseline confirmed by parsing the test files: **140 unit tests** across 8
files, matching the stated Phase 4 baseline.

### What is genuinely well built

Recorded because a security report that lists only problems misrepresents the
codebase:

- Order creation re-derives every price, line total and subtotal inside the
  transaction from the products themselves. There is no path by which a
  client-submitted price reaches the database.
- Cart mutations are scoped by `cartId` — no IDOR.
- Every idempotency guard is a database constraint, not an application-level
  "have we seen this?" query.
- Overselling is prevented by a conditional `UPDATE`, not read-then-write.
- Upload type detection is genuinely byte-based; the client filename never
  becomes a path.
- `lib/session.ts` re-reads `isActive` and role per request, so deactivation
  takes effect immediately despite JWT sessions.
- `proxy.ts` correctly refuses to be the authorisation boundary, with the
  reasoning documented.

### Dead and duplicated code

`lib/payments/registry.ts` was a second, unused copy of the provider registry.
Nothing imported it. Its `getCheckoutPaymentProvider()` fell back to the sandbox
provider **without** checking `isConfigured()` — a silently-active test gateway
waiting for someone to wire it up. Deleted.

---

## 3. Security findings

Only issues substantiated from the repository. No speculative findings.

### CRITICAL

**C-1 — Guest order PII disclosure via the sandbox payment route**
`app/(site)/checkout/sandbox/[orderNumber]/page.tsx`

Looked an order up by its **sequential** order number and rendered
`order.accessToken` into the page. Walk `NN-2026-00001…`, harvest a token per
order, open `/orders/<token>`, read the customer's name, email, phone and
delivery address. `completeSandboxPayment` in the same directory accepted an
order number from the form with **no ownership check** and called
`verifyAndApplyPayment`, so any order could be marked PAID.

Reachable whenever `sandboxProvider.isConfigured()` is true — every non-production
environment, and production with `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION=true`.

Categories: authorization, PII exposure, IDOR. **Fixed.**

**C-2 — Inventory reservations never committed or released**
`lib/inventory.ts`, `lib/commerce/orders.ts`

`createOrderFromCart` reserved stock. Nothing committed it on payment; nothing
released it on failure or cancellation. `Inventory.reserved` only ever climbed,
so `available` decayed to zero with stock physically on the shelf, and `onHand`
never decremented on a sale.

Latent rather than live only because every sellable piece is currently
`MADE_TO_ORDER`, which skips reservation. It breaks the first time real stock
counts are entered. Category: data integrity. **Fixed.**

**C-3 — Database constraints and sequence absent from migration history**
`prisma/migrations/*`

Neither `0002_constraints.sql` nor `0003_order_number_sequence.sql` appears in
any migration. Confirmed by grepping all three migration files for `CHECK` and
`SEQUENCE` — no matches. A fresh `migrate deploy` yields no CHECK constraints, no
partial unique index on `ProductImage`, and no `nnino_order_number_seq`.

Category: deployment correctness / data integrity. **Fixed.**

### HIGH

| ID | Finding | Category |
|---|---|---|
| H-1 | `resultUrl` was `/api/payments/webhook`; the route is `/api/payments/[provider]/callback`. Providers would post settlements into a 404. | webhook |
| H-2 | Post-checkout redirect built `/orders/{orderNumber}?token=…`, but the route queries `where: { accessToken }`. **Every confirmation page 404'd.** | correctness |
| H-3 | JSON-LD embedded with `JSON.stringify`, which does not escape `<`. Admin-authored copy containing `</script>` broke out of the tag on every public page. | XSS |
| H-4 | No Content-Security-Policy anywhere. | headers/CSP |
| H-5 | Payment verification compared amount but **ignored currency**. Paynow issues a separate integration per currency. | payment |
| H-6 | Rate limiting existed only on two public forms. Login, checkout, callback, order access, cart and upload were unprotected — and the limiter was per-process in-memory. | brute force / abuse |
| H-7 | S3 media driver threw on `put`/`delete`. No persistent production media storage existed. | availability |

### MEDIUM

| ID | Finding | Category |
|---|---|---|
| M-1 | Dead duplicate `lib/payments/registry.ts` with an unsafe silent sandbox fallback. | payment |
| M-2 | Dashboard revenue `_sum`'d across currencies. `hasMixedCurrencies()` warned but the figure was still wrong. | correctness |
| M-3 | `markWebhookProcessed` swallowed all errors via `.catch(() => undefined)`. | error handling |
| M-4 | No structured logging; ~20 `console.*` calls with no redaction discipline. | logging |
| M-5 | `EMAIL_TRANSPORT="none"` was accepted by env validation but had no registry entry, so it silently fell through to the dev transport — a setting that did the opposite of what it said. | correctness |
| M-6 | Webhook endpoint read an unbounded request body before authenticating it. | DoS |
| M-7 | Raw client IP used directly as a rate-limit key (personal data at rest). | privacy |

### LOW / INFORMATIONAL

| ID | Finding |
|---|---|
| L-1 | `poweredByHeader` not disabled. |
| L-2 | `images.remotePatterns` scoped to host, not path prefix. |
| L-3 | `dangerouslyAllowSVG` not explicitly set. |
| L-4 | Auth.js `trustHost` not set explicitly (auto-detected on Vercel). **Not changed** — see §15. |
| I-1 | Every page is `force-dynamic`; the site layout reads `cookies()`. Performance opportunity, not a defect. |
| I-2 | `AuditLog` is append-only by convention; the DB role could still update it. |

**Explicitly checked and found clean:** SQL/ORM injection (all raw SQL is
parameterised through Prisma tagged templates), SSRF (no user-controlled outbound
URL), path traversal (storage keys are derived, never client-supplied), open
redirect (`?next=` is validated to a local path), CSRF (server actions carry an
origin check).

---

## 4. Changes made

Grouped by the brief's sections.

**5.2 Critical/high security fixes** — C-1, C-2, C-3, H-1, H-2, H-3, H-5.

**5.3 Payment** — currency verification added; the accept/reject decision
extracted to a pure, unit-testable module; sandbox flow bound to the access
token; dead registry deleted; `getActiveProviderId()` added so callback URLs are
built from the configured provider; production refuses to boot on the sandbox
provider without an explicit flag.

**5.4 Media** — S3 driver implemented with SigV4 over `node:crypto` + `fetch`;
image optimiser hardened; `/media/*` served with a null CSP.

**5.5 Rate limiting** — pluggable backend, nine named rules, applied to login,
checkout, cart, callback, order access, upload and the two public forms.

**5.6 Webhooks** — 64 KB body cap before read, flood limiter, correlation id
threaded through every log line and returned in the response.

**5.7 Error handling / observability** — `lib/logger.ts` with structural
redaction; `lib/http/errors.ts` separating user-facing from internal; every
`console.*` on a changed path replaced.

**5.9 SEO** — JSON-LD escaping (also the XSS fix). Canonical coverage and
publication boundary audited and found already correct.

**5.12 Documentation** — six documents under `docs/`.

---

## 5. Database changes

One migration: `20260815090000_phase5_production_constraints`.

**Additive and idempotent only.** No column dropped, renamed or retyped; no row
deleted. Every `ADD CONSTRAINT` is wrapped in a `DO` block checking
`pg_constraint` first (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); indexes
use `IF NOT EXISTS`. It therefore applies cleanly to **both** a fresh database
and the existing one where these objects were created by hand.

Contents: `nnino_order_number_seq`; the 23 CHECK constraints from `0002`+`0003`;
`product_image_single_primary`; `inventory_low_stock`; plus two new indexes for
Phase 5's reconciliation queries — `payment_webhook_event_unprocessed` (partial,
`processedAt IS NULL`) and `payment_provider_ref_idx`.

No redundant constraints were created — each is guarded against the name already
existing.

`scripts/verify-database.mjs` extended to check the two new indexes.

---

## 6. Payment changes

- Currency verification added alongside the amount check.
- `lib/commerce/payment-verification.ts` — the accept/reject decision as a pure
  function, so all eleven branches are unit tested rather than only reachable
  through a database and a live provider.
- Inventory commit on verified PAID; release on FAILED/CANCELLED. Outside the
  payment transaction, deliberately: the helpers open their own transactions, and
  a stock bookkeeping failure must not roll back a payment that settled.
- Duplicate verification now logs `payment.verification_duplicate` instead of
  silently swallowing.
- Sandbox redirect carries the access token; `PaymentIntentRequest` gained
  `orderAccessToken` (already implicit in `returnUrl`).
- Provider abstraction preserved throughout. Paynow remains an adapter behind the
  interface and is **not** hard-wired anywhere.

---

## 7. Media changes

- S3 driver implemented: PutObject and DeleteObject, SigV4-signed. No SDK.
- Objects written private, `Cache-Control: immutable`, `Content-Type` from the
  **sniffed** type so a stored file cannot be served back as `text/html`.
- Path-style endpoints supported for R2 / B2 / MinIO.
- `remotePatterns` scoped to the configured path prefix, so a shared CDN domain
  cannot proxy arbitrary remote images through our optimiser.
- `dangerouslyAllowSVG: false`, `contentDispositionType: "attachment"`.
- All existing protections preserved: byte-based detection, derived storage keys,
  size limits, dimension validation, referenced-media delete refusal.

---

## 8. Rate limiting changes

`lib/rate-limit.ts` rewritten. In-memory (dev) / Upstash Redis REST (prod),
selected by env. **No new dependency** — the Redis backend is one authenticated
`fetch` to a pipeline endpoint.

Fixed window, one round trip (`INCR` + `PTTL` pipelined). Fails **open**
everywhere except `login`, which fails **closed**.

The in-memory backend is bounded at 10,000 keys with a sweep, so a spoofed-IP
flood cannot exhaust process memory.

Client identity is hashed with a server-side salt before use as a key — the
limiter needs a stable bucket, not a visitor's IP.

The `rateLimit(key)` signature is preserved so the Phase 2 call sites did not
need to change.

---

## 9. Webhook changes

Body size cap (64 KB) applied **before** the body is read, checking both the
declared `content-length` and the actual length. Flood limiter returning 429 so a
genuine provider backs off rather than giving up. Correlation id derived from
`x-request-id`/`x-vercel-id`, stamped on every log line and returned in the
response body so a provider's delivery log joins to ours.

All existing guarantees preserved: signature authentication, at-most-once via
UNIQUE index, server-side re-verification, provider reference read from our own
row rather than the payload.

---

## 10. Error and observability changes

`lib/logger.ts` — structured JSON, no dependency, **redaction on the way out**
rather than at each call site. Keys matching a normalised substring list are
replaced; emails and phones are masked to remain useful for support. Depth,
breadth and string length bounded so a hostile payload cannot produce a
multi-megabyte log line or recurse on a cycle.

`lib/http/errors.ts` — `SafeError` plus an allow-list of error names whose
messages were written *for* the user. Everything else becomes a generic message
plus an opaque reference id. Never swallows: every call emits a log line.

Events covering payment lifecycle, order lifecycle, auth, admin mutations,
webhook failures and unexpected exceptions. Alerting table in
`docs/operations.md`.

---

## 11. Performance changes

**Deliberately minimal.** Phase 5J says not to optimise on assumptions, and
without a running instance no profiling was possible.

Added: two indexes for the reconciliation queries Phase 5 itself introduced.
Confirmed: no N+1 (every list query selects relations explicitly); dashboard KPIs
are one `Promise.all`; admin lists are already paginated with supporting indexes.

**Not changed, and why:** every page is `force-dynamic` because the site layout
reads `cookies()` for the cart badge. Making the catalogue static or ISR-cached
means moving that to a client component or route handler, which changes
first-paint behaviour on the storefront. That is a design decision with a visual
consequence, not a mechanical optimisation, and Phase 5's remit was hardening
rather than redesign. Recorded in `docs/production-readiness.md` as the largest
remaining opportunity.

---

## 12. SEO and accessibility changes

**SEO** — JSON-LD escaping fixed (the same change as the XSS fix); the escaping
round-trips, so structured-data output is byte-identical in meaning and the SEO
value is unchanged. Audited and found **already correct**: canonical coverage on
every indexable page, publication boundary enforced in pages, metadata, sitemap,
JSON-LD and related-product queries; `/cart`, `/checkout` and `/orders/*` already
`noindex`; sitemap dynamic and published-only; `robots.ts` disallows `/admin`,
`/login`, `/api/`.

**Accessibility** — statically audited. Semantic landmarks, a skip link targeting
`main`, labelled forms, `not-italic` on `<address>`, `<dl>` for key/value pairs,
and alt text carried through the media model with the admin nudging for it. No
concrete defect was found that could be fixed without a browser, so **nothing was
changed** — Phase 5L says to fix concrete issues, not to rewrite the design.
⚠️ This is a static review, not a screen-reader or contrast-tool audit; recorded
as a limitation rather than claimed as verified.

---

## 13. Tests added

**66 added. 140 baseline preserved. Total 206.** No test was removed or weakened.

| File | Tests | Covers |
|---|---|---|
| `tests/csp.test.ts` | 14 | nonce, no `unsafe-*` in prod script-src, documented style-src exception, frame/object/base denial, CDN and payment origins, HSTS, report-only |
| `tests/payment-verification.test.ts` | 11 | under/overpayment, **wrong currency with matching amount**, provider silence, non-PAID passthrough, never-PENDING-on-reject |
| `tests/sigv4.test.ts` | 11 | AWS published signing-key vector, RFC 3986 encoding, key encoding, determinism, signed-header naming, path-style endpoints |
| `tests/rate-limit.test.ts` | 10 | counting, per-identity and per-rule isolation, login fails closed / others open, rule coverage, unknown-prefix fallback |
| `tests/logger.test.ts` | 8 | secret redaction across casings, PII masking, nesting, circularity, size bounds |
| `tests/json-ld.test.ts` | 6 | `</script>` breakout, exact escape set, **round-trip so SEO is unchanged**, nesting |
| `tests/tokens.test.ts` | 6 | equality, single-character difference, unequal lengths without throwing, unicode |

Every security fix that is unit-testable has a regression test. The three that
are not — C-1, C-2, C-3 — require a database; recommended integration tests are
listed in `APPLY.md`.

---

## 14. Verification results

### ❌ NOT VERIFIED — the gate was not run

`npm run db:generate`, `npx tsc --noEmit`, `npm run lint`, `npm run test`,
`npm run build`, `npm run db:verify` were **not executed**.

The archive contains no `node_modules` and no database, and the working
instruction for this phase was to skip heavy commands and return code plus manual
steps instead. Per rule 22 — do not claim build or test success unless you
actually ran it — **no such claim is made**. Every change is reviewed and
reasoned, not compiler-checked.

### ✅ What *was* verified, by direct execution

| Check | Result |
|---|---|
| AWS SigV4 signing-key vector recomputed with `node:crypto` | ✅ matches `c4afb1cc…a4b9` |
| SHA-256 of empty payload | ✅ `e3b0c442…b855` |
| `x-amz-date` format | ✅ `20260815T091500Z` |
| Brace balance across all 26 rewritten files | ✅ balanced |
| Every `@/lib/*` import resolves to a real file | ✅ (only the gitignored generated Prisma client unresolved, as expected) |
| No reference to the deleted `lib/payments/registry.ts` | ✅ none |
| No `__html: JSON.stringify` remains in `app/` or `components/` | ✅ none |
| Test count vs 140 baseline | ✅ 206, nothing removed |
| Migration column names checked against `schema.prisma` | ✅ (`createdAt`, not `receivedAt`) |

**Run the gate before deploying.** `APPLY.md` §3.

---

## 15. Remaining blockers

| # | Blocker | Status |
|---|---|---|
| 1 | Verification gate not run | ❌ NOT VERIFIED — run it first |
| 2 | Paynow adapter unimplemented | 🚫 needs credentials + integration style |
| 3 | No object storage bucket | ⚠️ REQUIRES EXTERNAL SERVICE |
| 4 | No sending domain | 🚫 needs a business decision |
| 5 | Redis rate-limit credentials | ⚠️ REQUIRES EXTERNAL SERVICE |
| 6 | Backups not configured or restore-tested | ⚠️ REQUIRES MANUAL CONFIGURATION |
| 7 | No alerting wired to the log events | ⚠️ REQUIRES MANUAL CONFIGURATION |

**Deliberately not changed, flagged for your decision:**

- **L-4, Auth.js `trustHost`.** Auto-detected on Vercel. Setting it explicitly
  is a one-line change, but getting it wrong on a non-Vercel host breaks login
  entirely, and I could not verify the target platform from the repository.
- **Housekeeping jobs** — abandoned cart sweep, stale-reservation timeout,
  webhook event retention. Each needs a business-chosen threshold ("cancel unpaid
  orders after how many days?"). Documented in `docs/operations.md` rather than
  guessed.

---

## 16. Manual production configuration

Full checklist in `docs/deployment.md`. The short version:

**Must set:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
`NEXT_PUBLIC_SITE_URL`.

**Must set for real media:** `MEDIA_DRIVER=s3` plus the five `MEDIA_S3_*`
variables.

**Strongly recommended:** `RATE_LIMIT_REDIS_URL` + `RATE_LIMIT_REDIS_TOKEN`.

**When Paynow arrives:** `PAYMENT_PROVIDER=paynow`, the two Paynow credentials,
the two URLs, `PAYMENT_REDIRECT_ORIGIN`.

**When a domain arrives:** `EMAIL_TRANSPORT=resend`, `EMAIL_API_KEY`,
`EMAIL_FROM` on that domain, with SPF/DKIM/DMARC published.

No real secret appears anywhere in this repository or its documentation.

---

## 17. Deployment checklist

1. Apply this patch (`APPLY.md`).
2. Run the full verification gate. **Do not proceed on any failure.**
3. Provision Postgres and the storage bucket.
4. Set every environment variable.
5. `DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy`.
6. `npm run db:verify` — **no `MISSING` lines permitted**.
7. Deploy.
8. Run the 15 smoke tests in `docs/deployment.md`.
9. Change the seeded owner password; remove `SEED_OWNER_PASSWORD`.
10. Confirm no `rate_limit.backend_degraded` in the logs.

---

## 18. Rollback procedure

**Application:** promote the previous Vercel deployment. Instant.

**Database:** Prisma has no `migrate down`. The Phase 5 migration is additive and
idempotent, so **the previous application build runs fine against the new
schema** — deliberately, because it means a bad deploy is rolled back by
reverting the application alone.

If a schema change must genuinely be undone, restore from a point-in-time backup
and accept the data loss. Do not hand-write a reverse migration against live
production under pressure.

**Release ordering:** migrate first, then deploy. Every Phase 5 migration is
backwards-compatible with the currently deployed code, so there is no window in
which the running app sees a schema it does not understand.

---

## 19. Files changed

**Deleted (1):** `lib/payments/registry.ts`

**New — application (11):** `lib/logger.ts`, `lib/http/errors.ts`,
`lib/security/csp.ts`, `lib/security/json-ld.ts`, `lib/security/tokens.ts`,
`lib/security/client-identity.ts`, `lib/media/sigv4.ts`,
`lib/commerce/inventory-lifecycle.ts`, `lib/commerce/payment-verification.ts`,
`lib/email/resend-transport.ts`,
`prisma/migrations/20260815090000_phase5_production_constraints/migration.sql`

**New — tests (7):** `csp`, `json-ld`, `logger`, `payment-verification`,
`rate-limit`, `sigv4`, `tokens`

**New — docs (8):** six under `docs/`, plus `PHASE-5-REPORT.md` and `APPLY.md`

**Modified (26):** `proxy.ts`, `next.config.ts`, `.env.example`,
`scripts/verify-database.mjs`, `lib/env.ts`, `lib/rate-limit.ts`,
`lib/media/s3-driver.ts`, `lib/email/index.ts`, `lib/payments/index.ts`,
`lib/payments/types.ts`, `lib/payments/sandbox-provider.ts`,
`lib/commerce/payment-service.ts`, `lib/commerce/orders.ts`,
`lib/admin/dashboard.ts`, `app/api/payments/[provider]/callback/route.ts`,
`app/(auth)/login/actions.ts`, `app/(site)/cart/actions.ts`,
`app/(site)/checkout/actions.ts`, `app/(site)/checkout/sandbox/actions.ts`,
`app/(site)/checkout/sandbox/[orderNumber]/page.tsx`,
`app/(site)/custom/actions.ts`, `app/(site)/orders/[accessToken]/page.tsx`,
`app/(site)/page.tsx`, `app/(site)/contact/page.tsx`,
`app/(site)/products/[slug]/page.tsx`, `app/(site)/shop/page.tsx`,
`app/(site)/collections/page.tsx`, `app/(site)/collections/[slug]/page.tsx`,
`app/admin/page.tsx`, `app/admin/media/actions.ts`

No `.env`, credential, generated artifact, `node_modules`, `.next`, temp file,
debug log or test secret is included.

---

## 20. Known limitations

1. **The build and test gate was not run.** The single most important caveat.
2. **Accessibility was reviewed statically**, not with a screen reader or
   contrast tool.
3. **The Upstash rate-limit backend is untested against a live Redis.** The
   decision logic is unit tested; the HTTP path is not.
4. **The Resend transport is untested against the live API.**
5. **The S3 driver is untested against a live bucket.** The signer is verified
   against AWS's published vector, which is the part most likely to be wrong, but
   endpoint style and bucket policy still need a real bucket.
6. **Sandbox payment outcomes remain in process memory** and do not survive a
   restart or cross instances. Correct for a dev-only provider; noted so it is
   not mistaken for a production limitation.
7. **No CSP violation reporting endpoint.**
8. **`AuditLog` is append-only by convention, not by database grant.**
9. **No automated dependency scanning** in CI.
10. **Fixed-window rate limiting** can admit up to 2× the limit across a window
    boundary. Accepted; limits are set low enough that 2× is still safe.
