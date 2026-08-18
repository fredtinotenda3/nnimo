# Security

How Nnino Ceramics is defended, and where the remaining gaps are. Written against
the code as it stands after Phase 5 — if this file and the code disagree, the
code is right and this file is a bug.

## Authentication

Auth.js v5 with a Credentials provider and JWT sessions (8 hour max age).

- Passwords are bcrypt, cost 12.
- A login attempt against a non-existent email still runs a bcrypt comparison
  against a dummy hash, so response time does not reveal which addresses have
  accounts.
- The login form returns one generic failure for every cause.
- Failed logins are logged **without the attempted email address**. A
  failed-login log that records addresses becomes a list of valid admin accounts
  the moment logs leak.
- Login is rate limited at 10 attempts per 15 minutes per client, and this is the
  one limiter that **fails closed** — if the limiter backend is unreachable,
  login is refused. Unlimited credential stuffing is a worse outcome than a
  temporary login outage.

Only the user id goes into the JWT. Role and `isActive` are re-read from the
database on every admin request (`lib/session.ts`), so deactivating an account or
changing a role takes effect on the next request rather than when the token
expires.

### Cookies (Phase 8)

Session cookie flags are now stated in `lib/auth.config.ts` rather than inherited
from Auth.js defaults. The values are identical, so nothing about the runtime
changed and **no existing session was invalidated** — the point is that they are now
asserted by a test.

The name matters more than the flags. `proxy.ts` decides whether a visitor to
`/admin` is anonymous by looking for a cookie in `AUTH_COOKIE_NAMES`, while Auth.js
decides what to actually call it. Those were two independent sources of truth: an
upstream rename would have matched nothing, made every admin request look anonymous,
and put every operator in a `/login` redirect loop — with nothing logged anywhere,
because the proxy would be doing exactly what it was written to do.
`tests/auth-cookies.test.ts` keeps the two in agreement.

`sameSite: "lax"` and not `"strict"`: strict would drop the cookie on a cross-site
navigation *into* the admin, so following a link from an email to an order would
land on the login page. Lax still withholds it from cross-site POSTs, which is the
CSRF-relevant case, and server actions independently verify Origin against Host.

`trustHost: true` is now explicit. Vercel is auto-detected so this changes nothing
today, but off Vercel an unset `AUTH_URL` made sign-in fail with an `UntrustedHost`
error that reads like a credentials problem.

## Authorisation

Six roles, coarse-grained permissions, defined in `lib/rbac.ts`. OWNER is the
only role that can manage users or read the audit log — the two capabilities that
would let someone escalate quietly or cover their tracks.

**`proxy.ts` is not an authorisation boundary.** It performs a cookie-presence
check to redirect anonymous visitors away from `/admin` so they get the login
page instead of a flash of chrome. It does not verify the token and it does not
check roles, deliberately: middleware can be bypassed by request-header
manipulation (CVE-2025-29927 was exactly this class of bug) and cannot see
current database state.

The real boundary is `lib/session.ts` — `requireAdmin`, `requirePermission`,
`requirePermissionOrThrow` — called by every admin page, route handler and server
action. A server action is a public POST endpoint; the `requirePermission()` call
at the top of it is the only thing standing between it and an authenticated user
with the wrong role.

## CSRF

Next.js server actions carry an origin check on every invocation. All admin
mutations and all public form submissions are server actions rather than route
handlers, so this is inherited rather than hand-rolled. The one route handler
that mutates state is the payment callback, which is authenticated by provider
signature instead — a CSRF token is meaningless for a server-to-server call.

## XSS

- React escapes by default; there is no `innerHTML` anywhere.
- The seven JSON-LD blocks use `dangerouslySetInnerHTML` because a `<script>`
  body must. They go through `serialiseJsonLd()` (`lib/security/json-ld.ts`),
  which escapes `<`, `>`, `&`, U+2028 and U+2029. **This was a real vulnerability
  before Phase 5**: `JSON.stringify` does not escape `<`, so admin-authored
  product copy containing `</script>` broke out of the tag on every public page.
- A strict nonce-based CSP is the second layer — see below.
- Uploads are type-checked from their magic bytes, not their declared MIME type,
  so a file claiming `image/png` that is really HTML is refused before it can be
  served from our own origin.

## Content-Security-Policy

Built per request in `proxy.ts` from `lib/security/csp.ts`, with a fresh 128-bit
nonce. `script-src` contains **no `unsafe-inline` and no `unsafe-eval`** in
production.

`style-src` does require `unsafe-inline`, and this is a documented, deliberate
exception: Next.js injects inline `<style>` for critical CSS and `next/font`
emits an inline block defining the `--font-*` custom properties, and neither
accepts a nonce in Next 16. Nonces and `unsafe-inline` are mutually exclusive in
CSP, so adding a nonce to `style-src` would *disable* the inline allowance and
break the fonts. The residual risk is CSS injection, which is materially less
severe than script injection and is separately mitigated: nothing in the
application renders user-controlled style.

A nonce-based policy normally forces dynamic rendering. It costs nothing here —
every page already declares `export const dynamic = "force-dynamic"`, and the
site layout reads `cookies()` for the cart badge.

Set `CSP_REPORT_ONLY="true"` for one deploy when tightening the policy.

## Other security headers

Set in `proxy.ts` for HTML routes, with a minimal always-on subset in
`next.config.ts` for static assets the proxy matcher excludes:

`Strict-Transport-Security` (2 years, includeSubDomains, preload — production
only), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` plus the
payment origin, a deny-by-default `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. `poweredByHeader`
is off.

Locally-stored media under `/media/*` is served with
`Content-Security-Policy: default-src 'none'; sandbox`.

## Payment security

- **The server is authoritative.** A browser redirect back from a provider is
  treated as "go and ask the provider what happened", never as evidence of
  payment. Only `verifyAndApplyPayment` can move an order to PAID.
- Order totals are re-derived inside the order transaction from the products
  themselves. There is no code path by which a client-submitted price or total
  reaches the database.
- Callbacks are authenticated by the provider adapter's `parseWebhook`, which
  must throw `WebhookSignatureError` on anything it cannot verify.
- Even after authentication, the callback's *claimed status* is not believed —
  the status is re-fetched from the provider.
- The provider reference used for verification is read from **our own Payment
  row**, not from the callback payload, so a forged callback cannot point
  verification at an attacker-controlled transaction.
- Amount **and currency** are both verified against the order before PAID is
  accepted (`lib/commerce/payment-verification.ts`). Currency was not checked
  before Phase 5; Paynow issues a separate integration per currency, so a
  misconfigured integration can settle in ZWG with a numeric amount equal to the
  USD total.
- Callbacks are size-capped at 64 KB before the body is read, and flood-limited.

## Idempotency

Every idempotency guard is a database constraint, never an application-level
"have we seen this?" query, because the latter races.

| Concern | Guard |
|---|---|
| Duplicate order from a double submit | `Order.cartId` UNIQUE |
| Duplicate provider payment | `Payment.idempotencyKey` UNIQUE |
| Replayed webhook | `PaymentWebhookEvent.idempotencyKey` UNIQUE |
| Double stock commit/release | `InventoryMovement` rows per order and type |
| Oversell | conditional `UPDATE … WHERE onHand - reserved >= qty` |
| Two primary images | partial unique index `product_image_single_primary` |

## Guest order access

Order pages are keyed on an unguessable `accessToken` (UUIDv4), never the order
number — order numbers come from a sequence, so `/orders/NN-2026-00042` would let
anyone walk the customer list.

Comparisons against that token use `timingSafeEqualString`
(`lib/security/tokens.ts`), which hashes both sides to a fixed width first so the
comparison does identical work regardless of input length.

**Phase 5 fixed a critical break here.** The sandbox payment page took only an
order number, looked the order up, and rendered its `accessToken` into the page.
Anyone could walk the sequence, harvest tokens and read every customer's name,
email, phone and delivery address. The same route's action would also mark any
order PAID given only its number. Both now require the token to be *supplied* and
verified.

## Rate limiting

**Phase 8 wired up a rule that existed but was never called.**
`RATE_LIMIT_RULES.adminMutation` was defined in Phase 5 and invoked from nowhere,
which is worse than a missing limit — a reviewer reading `lib/rate-limit.ts` sees a
rule named for admin mutations and reasonably concludes admin mutations are
limited. It is now enforced by `requireMutationPermission()` in `lib/session.ts`,
which the 29 mutating admin server actions call.

It was deliberately **not** folded into `requirePermission()`, even though that
would have been a one-line change: 26 admin *pages* call that function too, several
times per render in places, so charging reads against a mutation budget would let
an operator throttle themselves out of their own admin simply by browsing the
catalogue. RBAC still runs first — an unauthorised caller is rejected on those
grounds, not told to slow down, because a 429 to an anonymous caller confirms the
endpoint is worth retrying.

`health` was added for `/api/health`, which is unauthenticated by necessity and
touches the database. A throttled prober receives 429 rather than a 503, so a third
party cannot flood the endpoint to make monitoring believe the site is down.

Login remains the only rule that fails **closed**; a test now asserts that, so a
second one cannot be introduced by accident.


`lib/rate-limit.ts`. In-memory for development, Upstash Redis REST in production
(no new dependency — it is one authenticated `fetch`). Fixed window. Fails open
everywhere except login.

Covered: login, contact, commission, cart, checkout, payment callback, order
access, media upload, admin mutation.

Client identity is the platform-set `x-forwarded-for` leftmost entry, **hashed
with a server-side salt** before it is used as a key — the limiter needs a stable
bucket, not a visitor's IP address, and a leaked rate-limit store should not be a
list of IPs. Set `TRUSTED_PROXY_HEADER` if not deploying behind Vercel.

## File upload security

- Whitelist of JPEG, PNG, WebP, AVIF. SVG is not accepted — an SVG is a script.
- The declared MIME type is used only for a cheap early rejection, then ignored.
  The stored type comes from the magic bytes (`lib/media/inspect.ts`).
- The client filename is **never** part of a storage path. Keys are
  `uploads/YYYY/MM/<uuid>.<ext>` where the extension comes from the validated
  type. The original name is kept only as a display string, stripped of path
  separators and control characters.
- 12 MB cap, enforced before the file is read into memory.
- The local driver additionally normalises and re-checks that the resolved path
  is inside the media root.
- Deleting media that is still referenced is refused.
- `dangerouslyAllowSVG` is false and `contentDispositionType` is `attachment` on
  the image optimiser.

## Secrets

Every secret comes from the environment and is validated at boot by
`lib/env.ts`, which fails fast on a missing or half-configured set. No secret is
in the repository, in a migration, or in this documentation.

`lib/logger.ts` redacts structurally on the way out — any key containing
`password`, `secret`, `token`, `key`, `authorization`, `cookie`, `signature` and
similar is replaced before serialisation, and emails and phone numbers are
masked. Relying on every call site to remember not to log a secret is how secrets
end up in logs.

**Phase 8 added two things to this, because key-based redaction was not enough.**

1. **Credential scrubbing inside strings** (`scrubSecrets`). Key patterns cannot
   help when the secret is inside a sentence rather than the value of a field. A
   `PrismaClientInitializationError` message embeds the whole datasource URL —
   username, password, host, database. Every string and every `Error.message` is now
   rewritten to strip the userinfo component of any URI before serialisation, and
   the scrub happens *before* truncation so a cut cannot leave the password as the
   tail of a surviving fragment. The username and host are kept, because a
   connection failure you cannot attribute to a host is not diagnosable.

2. **`no-console` as an ESLint error** across `app/`, `components/` and `lib/`.
   Thirteen `console.error(..., error)` calls had accumulated in the admin server
   actions, `lib/admin/media.ts` and `lib/audit.ts`, each one bypassing all of the
   above. They were replaced — but a fix that depends on nobody adding the
   fourteenth is not a fix, so the rule is the actual control. Exemptions are
   narrow and individually justified: `lib/email/dev-transport.ts` (printing the
   message *is* the dev transport's contract) and `scripts/` + `prisma/` (operator
   CLI tools, never inside a request).

## Error handling

`lib/http/errors.ts`. Users get a safe message and an opaque request id;
operators get the same id plus the real cause in the logs. Stack traces,
database errors and provider responses never reach a response body. Errors whose
messages were written *for* the user (`CheckoutValidationError`,
`MediaUploadError`, and similar) are allow-listed by name and shown verbatim.

### Rendered error pages (Phase 8)

Before Phase 8 there were no error boundaries and no `not-found` files at all, so
every unhandled error and every `notFound()` rendered a Next.js default page.

- `app/(site)/error.tsx` — storefront
- `app/admin/error.tsx` — admin
- `app/global-error.tsx` — a failure in the root layout itself
- `app/not-found.tsx` and `app/(site)/not-found.tsx` — 404s

**All three boundaries render `error.digest` and nothing else.** Never
`error.message`, never `error.stack`. The digest is a hash Next generates
server-side and writes to the platform log beside the real stack trace, so a
customer can quote eight characters and an operator can grep for them — it
correlates without disclosing.

The admin boundary applies the same rule as the public one, and this is deliberate
rather than an oversight. "Everyone at /admin is trusted staff" does not hold:
Nnino has six RBAC roles, a `CONTENT_MANAGER` is not entitled to a Prisma error
naming the `Order` table and its columns, the boundary also catches errors thrown
while the session is still being resolved, and error text has a habit of ending up
in screenshots and support threads.

## Known gaps

- **Paynow signature verification is not implemented.** The adapter is a
  deliberate stub. See `docs/payment-setup.md`.
- **No CSP violation report endpoint.** `report-uri` is not set; violations
  surface in the browser console only.
- **No WAF or bot management** beyond the rate limiter and form honeypots.
- **No automated dependency scanning** wired into CI.
- **Live checkout runs on the sandbox payment provider.** This is the largest open
  security-relevant issue at launch and it is a **business decision, not a code
  defect** — see the blocker in `docs/production-readiness.md`. The sandbox flow is
  correctly hardened (token required, constant-time comparison, `notFound()` on a
  miss), but by design it lets the holder of an order's access token choose the
  payment outcome. In production that holder is the customer.
- **No focus-trap or screen-reader testing beyond static review.** Phase 8 added
  focus containment and restoration to the mobile drawer, but this was reasoned from
  the code rather than verified with VoiceOver or NVDA.
- **Audit log is append-only by convention, not by grant.** The application never
  updates or deletes `AuditLog` rows, but the database role it connects as could.
  A separate restricted role, or a `REVOKE UPDATE, DELETE` on the table, would
  make that structural.
