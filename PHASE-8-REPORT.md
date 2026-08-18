# PHASE 8 — FINAL LAUNCH HARDENING — REPORT

Read-only discovery first, then Stages 1, 2 and 4 of the plan that discovery
produced. Stage 3 (caching) was deferred with reasons.

No feature added. No route removed. No schema change, no migration, no dependency
change — `package.json` and `package-lock.json` are untouched.

---

## 1. Verification results

Stated first, because everything below should be read against what was actually
executed rather than asserted.

| Gate | Baseline | After Phase 8 | Executed? |
|---|---|---|---|
| `npm ci` | — | 641 packages, clean | ✅ |
| `npm run lint` | clean | clean, incl. new `no-console` rule | ✅ |
| `npm run test` | 307 | **383 passing, 23 files** | ✅ |
| `npx tsc --noEmit` | clean (reported) | **not verified** | ❌ |
| `npm run build` | — | not run | ❌ per instruction |
| `npm run db:verify` | — | not run | ❌ per instruction |

**76 tests added, none removed or weakened.** Final count 383 ≥ the required 307.

### The one gap that matters

`npx prisma generate` cannot run in the environment this phase was built in:
`binaries.prisma.sh` returns 403 for the schema-engine fetch, with and without
`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`. Without the generated client, `tsc`
reports 80 errors — 5 × `TS2307` for the missing module and 75 cascading from Prisma
types resolving to `any`. The error-code distribution (60 × TS7006, 7 × TS2322,
4 × TS2339, 2 × TS2345, 1 × TS2365, 1 × TS7053) is entirely consistent with that and
contains no independent signal.

To run the test suite at all, the 18 enums in `prisma/schema.prisma` were
mechanically derived into a throwaway `lib/generated/prisma/enums.ts`. **That file is
excluded from the archive** and must not be hand-created.

**So TypeScript was never compiled against these changes.** `npx tsc --noEmit` on
your machine is a required gate, not a formality. Most likely candidates if it
complains: the new `requireMutationPermission` import across the ten admin action
files, and the `ref` types in `components/layout/site-header.tsx`.

The `no-console` rule was additionally verified to *fire*, by planting a
`console.log`, confirming the error, and restoring the file. A lint rule that is
present but not triggering is the same as no rule.

---

## 2. Discovery findings

### Already good — stated because the list below shouldn't read as a bigger problem than it is

The CSP is nonce-based with `strict-dynamic` and no `unsafe-inline`/`unsafe-eval` on
`script-src`, with the one unavoidable `style-src 'unsafe-inline'` documented against
its actual cause. The authorisation boundary is in the right place, with `proxy.ts`
explicitly not being it and citing CVE-2025-29927. Webhook handling authenticates,
records once via a UNIQUE index, then re-verifies server-side without trusting the
payload's status or reference, with the body capped before authentication. The
sandbox payment page requires a supplied token compared in constant time. Env
validation fails fast with all-or-nothing credential groups. RBAC and audit coverage
is complete across all 16 admin action files. Every `next/image` has explicit `sizes`
with `priority` only above the fold. Admin lists are paginated in Postgres with
clamped inputs. **No N+1 was found** — `lib/catalogue.ts` selects relations
explicitly throughout.

### Findings, by severity

| ID | Severity | Finding | Status |
|---|---|---|---|
| C1 | **Critical** | Live checkout runs on the sandbox provider; a customer can settle their own order | 🚫 **Documented, not fixed — needs your decision** |
| H1 | High | `NEXT_PUBLIC_SITE_URL` silently defaulted to localhost in 3 files | ✅ Fixed |
| H2 | High | No `not-found.tsx`, `error.tsx` or `global-error.tsx` anywhere | ✅ Fixed |
| H3 | High | Nothing cacheable; `revalidatePath` calls are no-ops for public routes | ⏸ Deferred to 8b |
| H4 | High | 13 `console.error` calls bypassing the redacting logger | ✅ Fixed + guarded |
| M1 | Medium | Unbounded pg pool on serverless | ✅ Fixed (reasoned) |
| M2 | Medium | `/shop` caps at 60 products with no pagination | ⏸ Deferred to 8b |
| M3 | Medium | `adminMutation` rate-limit rule defined but never called | ✅ Fixed |
| M4 | Medium | Mobile drawer: no focus trap/restore, dangling `aria-controls`, duplicate landmark | ✅ Fixed |
| M5 | Medium | No health check endpoint | ✅ Fixed |
| M6 | Medium | `summary_large_image` declared with no OG image; no manifest | ✅ Fixed |
| M7 | Medium | `robots.txt` didn't disallow `/cart`, `/checkout`, `/orders/` | ✅ Fixed |
| L1 | Low | `.env.example` falsely claimed all its variables are validated | ✅ Fixed |
| L2 | Low | Cookie flags and `trustHost` inherited rather than stated | ✅ Fixed |
| L3 | Low | Paynow `parseWebhook` stub; route's `GET` reads a body Paynow sends as query | 📝 Recorded for Phase 6 |
| L4 | Low | Phase 7 index created without `CONCURRENTLY` | 📝 Recorded |
| L5 | Low | `MediaImage` ignores stored width/height; unused `data:`/`blob:` in `img-src` | 📝 Recorded |

**Not statically verifiable:** contrast of `warm-white/80` over hero photography
(depends on the image, not the token), and real bundle sizes (needs `npm run build`).

---

## 3. C1 — the launch blocker, unresolved

Recorded rather than guessed at, per the phase rule about fixes needing business
input.

With Phase 6 deferred, production runs `PAYMENT_PROVIDER=sandbox` +
`PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION=true`. The sandbox flow is correctly hardened —
token required, constant-time comparison, `notFound()` on a miss, rate limited. But
its *purpose* is to let the token holder choose the payment outcome, and in production
the token holder is the customer.

A customer can place an order, open `/checkout/sandbox/<orderNumber>?token=<their own
token>`, select `PAID`, and receive a confirmed order with stock decremented and a
confirmation email sent. No money moves.

Two options, costed in `docs/production-readiness.md` (blocker 0):

- **A — enquiry-only storefront.** Remove cart/checkout entry points; the catalogue
  drives `CustomOrderInquiry`. Reversible in Phase 6.
- **B — checkout with manual settlement.** Keep checkout, disable the sandbox
  settlement path in production, land orders in `UNPAID`/`PENDING_QUOTE` for the
  studio to reconcile.

B is closer to how the studio likely already works and preserves the funnel. It is
still Marion's call. **Until it is decided, the site should not be advertised as a
shop.**

---

## 4. Changes by category

### Security

**H4 — logging.** All 13 `console.*` calls replaced with `logger`. Swapping the call
was *not* sufficient on its own: `redact()` returned `Error.message` verbatim, and a
`PrismaClientInitializationError` message embeds the datasource URL including the
password — so the credential would simply have moved from console-to-stdout to
logger-to-stdout and still landed in the retained platform log. Added `scrubSecrets()`
at the sink, which rewrites the userinfo component of any URI in any string, applied
*before* truncation so a cut cannot leave the password as the tail of a fragment. The
username and host are kept because a connection failure you can't attribute to a host
isn't diagnosable. Error `code` is now preserved — it's the most useful field and
carries no secret. Guarded permanently by `no-console` in ESLint.

**M3 — admin mutation limiting.** `adminMutation` was defined in Phase 5 and called
from nowhere, which is worse than a missing limit because it reads as coverage. Now
enforced by a new `requireMutationPermission()` in `lib/session.ts`, adopted by 29
call sites across 10 action files. Deliberately **not** folded into
`requirePermission()` despite that being a one-line change: 26 admin *pages* call
that too, several times per render, so charging reads against a mutation budget would
let an operator throttle themselves out of the admin by browsing. RBAC still runs
first, so an unauthorised caller is rejected on those grounds rather than told to
slow down.

**L2 — cookies.** Flags stated rather than inherited, with the same values, so no
session is invalidated. The valuable part is the test: `proxy.ts` and Auth.js were two
independent sources of truth for the cookie *name*, and an upstream rename would have
put every operator in a silent `/login` redirect loop with nothing logged.

**M7 — robots.** `/cart`, `/checkout/`, `/orders/` added. Defence in depth — the
page-level `noindex` was already correct — but `/orders/[accessToken]` carries
customer PII and the token is in the path, so it lands in crawler logs and referrer
headers.

**H2 — error page disclosure.** All boundaries render `error.digest` only, never
`message` or `stack`. The admin boundary applies the same rule, deliberately: six
RBAC roles mean an authenticated `CONTENT_MANAGER` isn't entitled to a Prisma error
naming the `Order` table, and the boundary also catches errors thrown while the
session is still resolving.

### Reliability

**H2 — five files.** `app/not-found.tsx`, `app/(site)/not-found.tsx`,
`app/(site)/error.tsx`, `app/admin/error.tsx`, `app/global-error.tsx`. Two 404s are
needed because route groups don't appear in URLs, so an unmatched path never reaches
the `(site)` one. `global-error.tsx` uses inline styles and a system font stack
because it *replaces* the root layout, so neither `globals.css` nor the `next/font`
variables exist — CSP-compatible because `style-src` carries `unsafe-inline` and the
file contains no inline script.

**M5 — `/api/health`.** Liveness/readiness with a `SELECT 1`, 503 on degraded, `HEAD`
handled, `no-store`, rate limited. Shaping extracted to `lib/health.ts` so the
*negative* properties are testable. Checks the database and only the database:
deliberately not media (an S3 outage degrades images, it doesn't stop orders), email
(a failed send is recoverable, a closed shop isn't), the rate-limit cache (designed to
fail open, so its absence isn't a health event), or the payment provider (polling a
third party from a public endpoint is how you get rate-limited by them). A throttled
prober gets 429, never a false 503 — otherwise flooding the endpoint would be a way to
make monitoring believe the site is down.

**M1 — connection pool.** `max` (default 5), `idleTimeoutMillis`,
`connectionTimeoutMillis`, and the client now cached on `globalThis` unconditionally
rather than only outside production. Unbounded, node-postgres pools 10 *per instance*,
so twenty warm Vercel instances reach for 200 connections against a managed Postgres
whose ceiling is commonly a few hundred — and the failure is `too many clients already`
on every route at once, `/admin` included, so the studio can't log in to see what's
wrong. **Marked as reasoned, not measured:** 5 was chosen so the 3–4 parallel queries
on the public pages still run concurrently while 20 instances stay under 100. Does not
replace pointing `DATABASE_URL` at the pooled endpoint.

### Correctness / SEO

**H1 — one resolver.** `lib/site-url.ts` validates once: required in production,
https, non-loopback, normalised (trailing slashes stripped, query/fragment discarded).
Lenient outside production so dev and test need no configuration — but a
present-but-broken value throws everywhere, because tolerating absence isn't
tolerating a typo. All three call sites use it and `lib/env.ts` enforces the same rule
at boot via the same function, so there's one implementation and no drift.

**M6 — social preview.** `app/opengraph-image.tsx` generates a 1200×630 typographic
card in the brand palette, reproducing the gallery-label device from `globals.css`.
Deliberately not pointing at `hero-giraffe-tureen.webp`: it's a WebP (inconsistent
OG support, and WhatsApp is the channel that matters most here), it's the wrong ratio
so a centre crop would decapitate the vessel, and it would promise one specific
one-off piece on every share of every page. **Nothing invented** — studio name,
existing tagline, location from `lib/brand.ts`. Plus `app/manifest.ts`, with
`display: "browser"` and no icons, because there's no service worker and the available
artwork is a wide wordmark and a motif, neither a square maskable icon.

### Accessibility

**M4 — mobile drawer.** Focus moves into the drawer on open, is contained by
Tab/Shift+Tab while open (with the toggle kept in the cycle so Escape isn't the only
exit), and returns to the toggle on close — guarded by a `wasOpen` ref so it doesn't
steal focus on mount. `aria-controls` now points at an always-rendered wrapper instead
of an element that only existed while open, which was a dangling reference for most of
the page's life. The drawer's `<nav>` relabelled `Mobile`, because the desktop
`Primary` nav stays in the DOM (hidden only by a breakpoint class) so two landmarks
shared one name.

### Documentation

- **`docs/deployment.md`** — Phase 8 breaking-change warning, `NEXT_PUBLIC_SITE_URL`
  and `DATABASE_POOL_MAX` rows, smoke tests extended with items 16–23 plus the manual
  contrast check.
- **`docs/production-readiness.md`** — status through Phase 8, honest
  verified/not-verified split, blocker 0 (C1) with both options costed, H3/M2
  deferrals stated including the fact that the `revalidatePath` calls are currently
  no-ops.
- **`docs/operations.md`** — new health-check and connection-pool sections, six new
  alertable events, scrubbing note.
- **`docs/security.md`** — scrubbing and `no-console`, rendered error pages, cookie
  section, rate-limiting update, two new known gaps.
- **`.env.example`** — L1 corrected (the "every variable is validated" claim was
  untrue for the three `SEED_OWNER_*` values), `DATABASE_POOL_MAX` documented,
  `NEXT_PUBLIC_SITE_URL` marked required.

**A note on the smoke-test checklist:** the brief said to add one "if missing". It
wasn't missing — `docs/deployment.md` already had 15 items. Extending it was the right
move; creating `docs/production-smoke-test.md` would have duplicated it.

---

## 5. Files

### Created (16)

```
lib/site-url.ts
lib/health.ts
app/not-found.tsx
app/(site)/not-found.tsx
app/(site)/error.tsx
app/admin/error.tsx
app/global-error.tsx
app/api/health/route.ts
app/opengraph-image.tsx
app/manifest.ts
tests/site-url.test.ts
tests/auth-cookies.test.ts
tests/robots.test.ts
tests/health.test.ts
PHASE-8-REPORT.md
APPLY-PHASE-8.md
```

### Modified (30)

```
.env.example
eslint.config.mjs
app/layout.tsx
app/robots.ts
app/sitemap.ts
app/admin/collections/actions.ts
app/admin/content/actions.ts
app/admin/customers/actions.ts
app/admin/inquiries/actions.ts
app/admin/media/actions.ts
app/admin/orders/actions.ts
app/admin/products/actions.ts
app/admin/publish-actions.ts
app/admin/settings/actions.ts
app/admin/team/actions.ts
components/layout/site-header.tsx
lib/audit.ts
lib/auth.config.ts
lib/db.ts
lib/env.ts
lib/logger.ts
lib/rate-limit.ts
lib/session.ts
lib/admin/media.ts
tests/logger.test.ts
tests/rate-limit.test.ts
docs/deployment.md
docs/operations.md
docs/production-readiness.md
docs/security.md
```

### Deleted

None. No `rm` step in `APPLY-PHASE-8.md`, unlike Phase 5.

---

## 6. Tests added (76)

| File | Tests | Covers |
|---|---|---|
| `tests/site-url.test.ts` | 22 | H1 — production refuses missing/loopback/http/malformed; normalisation |
| `tests/health.test.ts` | 15 | M5 — status/code mapping, and that the payload discloses no version, commit, env, hostname or driver error |
| `tests/logger.test.ts` (+) | 17 | H4 — credential scrubbing across schemes, all occurrences, scrub-before-truncate, no false positives on emails |
| `tests/auth-cookies.test.ts` | 10 | L2 — name agreement with `proxy.ts`, HttpOnly, SameSite, trustHost |
| `tests/robots.test.ts` | 9 | M7 — disallow coverage, and that public routes stay crawlable |
| `tests/rate-limit.test.ts` (+) | 6 | M3/M5 — `adminMutation` and `health` bounds, fail-open, and that login stays the only fail-closed rule |

Plus the `no-console` ESLint rule, which is the H4 regression guard that can't be
expressed as a Vitest case — what's asserted is the absence of a call across the whole
tree.

---

## 7. Remaining blockers

**Needs your decision:**

1. **C1 — what checkout does before Phase 6.** Section 3 above. Nothing else in the
   launch is as consequential.

**Deferred to Phase 8b, with reasons:**

2. **H3 — caching.** Requires moving the cart badge out of the server-rendered layout,
   changing first-paint on every storefront page. The one finding in the audit that
   can't be made genuinely reversible. Wants a build measurement in front of it.
3. **M2 — `/shop` pagination.** Product 61+ unreachable from the UI while present in
   `sitemap.xml`; the count ignores filters. Same surface as H3, same UX decision.

**Unchanged external/business blockers from Phase 5:**

4. Paynow credentials and integration style.
5. S3 bucket — `MEDIA_DRIVER=local` loses every upload on redeploy.
6. Sending domain with SPF/DKIM/DMARC.
7. Redis rate-limit credentials.
8. Database backups enabled *and a restore tested*.

**New operational asks:**

9. Set `NEXT_PUBLIC_SITE_URL` before deploying (step 0 of `APPLY-PHASE-8.md`).
10. Point an uptime monitor at `/api/health`.
11. Run `npx tsc --noEmit` and tell me if it reports anything.

---

## 8. Manual production steps

In order:

1. Confirm `NEXT_PUBLIC_SITE_URL` in the Vercel dashboard — **https, not localhost.**
2. `npm ci && npx prisma generate && npx tsc --noEmit && npm run lint && npm run test`
3. `npm run build`
4. `npm run db:verify` (should be unchanged — no migration this phase)
5. Deploy.
6. Smoke tests 1–23 in `docs/deployment.md`.
7. Verify an existing admin session still works, then sign out and back in.
8. Save a product in `/admin` to exercise `requireMutationPermission`.
9. Point a monitor at `/api/health`.
10. Contrast-check the hero navigation against the hero photograph.
