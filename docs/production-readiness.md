# Production readiness

Status of every subsystem after Phase 8. Read alongside `docs/security.md`,
`docs/deployment.md`, `docs/payment-setup.md`, `docs/media-storage.md` and
`docs/operations.md`.

Legend: ✅ verified · ⚠️ requires manual configuration · 🚫 blocked · ❌ not
verified

## Summary

| Area | Status |
|---|---|
| Database schema & constraints | ✅ (migration added; run `db:verify`) |
| Authentication | ✅ |
| Authorisation / RBAC | ✅ |
| CSRF | ✅ (server actions) |
| XSS / JSON-LD escaping | ✅ (fixed in Phase 5) |
| Content-Security-Policy | ✅ |
| Security headers | ✅ |
| Rate limiting | ⚠️ needs Redis credentials |
| Guest order access | ✅ (critical leak fixed) |
| Payment abstraction | ✅ |
| Paynow adapter | 🚫 needs credentials + business decisions |
| Inventory lifecycle | ✅ (commit/release wired in Phase 5) |
| Webhook hardening | ✅ |
| Media — local driver | ✅ development only |
| Media — S3 driver | ⚠️ implemented; needs a bucket |
| Email | 🚫 needs a sending domain |
| Error handling | ✅ (Phase 8 added the missing error boundaries and 404 pages) |
| Rendered error pages | ✅ (Phase 8; digest only, never a message or stack) |
| Health check / readiness | ✅ `/api/health` (Phase 8); ⚠️ no monitor pointed at it yet |
| Database connection pooling | ⚠️ bounded in Phase 8, **reasoned not load-tested** |
| Observability | ✅ logging; ⚠️ no alerting configured |
| Mixed currency | ✅ (revenue scoped) |
| SEO | ✅ |
| Accessibility | ⚠️ audited statically, not with a screen reader |
| Backups | ⚠️ provider-side, not configured here |
| Caching / static rendering | 🚫 **deferred to Phase 8b.** Everything is `force-dynamic`; see Performance notes |
| Live payments | 🚫 **sandbox provider in production — see blocker 1** |
| Lint | ✅ verified clean by execution (Phase 8) |
| Unit tests | ✅ **383 passing, verified by execution** (Phase 8; 307 before) |
| TypeScript / build / db:verify | ❌ **not verified — must be run on a workstation** |

## What was and was not verified in Phase 8

Phase 8 was able to execute more of the gate than Phase 5 or 7, so this section is
now a mix rather than a blanket disclaimer.

**Verified by execution:**

| Command | Result |
|---|---|
| `npm ci` | 641 packages, clean |
| `npm run lint` | zero findings, including the new `no-console` rule |
| `npm run test` | **383 passing, 23 files** (307 before Phase 8) |

The `no-console` rule was additionally verified to actually *fire*, by planting a
`console.log`, confirming the error, and restoring the file. A lint rule that is
present but not triggering is the same as no rule.

**❌ NOT verified — `npx tsc --noEmit`.**

This is the one gap that matters and it must not be glossed over. `npx prisma
generate` cannot run in the build environment used for this phase: the Prisma engine
download host returns 403, with and without `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`.
Without the generated client, `tsc` reports 80 errors — 5 × `TS2307` for the missing
module and 75 cascading from Prisma types resolving to `any`. None of them are
signals about the code.

To run the test suite at all, the 18 enums in `schema.prisma` were mechanically
derived into a throwaway `lib/generated/prisma/enums.ts`. **That file is not in the
delivered archive** and must not be created on a real machine — `npx prisma generate`
produces the real one.

**So: `npx tsc --noEmit` on your own machine is a required gate, not a formality.**
It is the only check in the set that Phase 8 cannot stand behind.

`npm run build` and `npm run db:verify` were not run, per the working instruction for
this phase. `APPLY.md` lists them as manual steps.

## Blockers before taking real money

0. **🚫 DECIDE WHAT CHECKOUT DOES BEFORE PHASE 6. This is unresolved and it is the
   launch blocker.**

   Phase 6 is deferred, so production runs `PAYMENT_PROVIDER=sandbox` with
   `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION=true`. The sandbox flow is correctly
   hardened — the caller must supply the order access token, it is compared in
   constant time, and a miss returns `notFound()` — but the flow's *purpose* is to
   let the token holder choose the payment outcome. In production the token holder
   is the customer.

   A real customer can therefore reach `/checkout`, place an order, open
   `/checkout/sandbox/<orderNumber>?token=<their own token>`, select `PAID`, and
   receive a confirmed order with stock decremented and a confirmation email sent.
   No money moves.

   This is **not** a code defect and Phase 8 deliberately did not "fix" it, because
   both available fixes change what the business does:

   | Option | What it means | Cost |
   |---|---|---|
   | **A — enquiry-only storefront** | Remove the cart/checkout entry points; the catalogue drives `CustomOrderInquiry` and email/WhatsApp instead. Ship the shop as a catalogue. | Loses the checkout flow from the launch. Reversible in Phase 6 by restoring the entry points. |
   | **B — checkout with manual settlement** | Keep checkout, disable the sandbox settlement path in production, and land every order in `UNPAID` / `PENDING_QUOTE` for the studio to confirm payment out of band. | Orders arrive with no payment attached; Marion must reconcile each one by hand. Matches how the studio likely already works. |

   Option B is closer to current practice and preserves the funnel. But it is
   Marion's call, not an engineering one, so it is recorded here rather than guessed
   at. **Until this is decided, do not advertise the site as a shop.**

1. **Run the Phase 5 migration and `npm run db:verify`.** Without
   `nnino_order_number_seq`, every checkout fails on a fresh database.
2. **Provision object storage and set `MEDIA_DRIVER=s3`.** With `local`, every
   uploaded image is lost on the next deploy.
3. **Implement the Paynow adapter** once credentials and the integration style
   arrive. Until then no real payment can be taken.
4. **Configure a sending domain** or accept that no customer receives an email.
5. **Set the Redis rate-limit credentials**, or accept a per-instance limiter.
6. **Enable and test database backups.**
7. **Set `NEXT_PUBLIC_SITE_URL` to the production https origin** before deploying
   Phase 8. It is now required and the app will not boot without it — see
   `docs/deployment.md`.
8. **Point an uptime monitor at `/api/health`.** The endpoint exists as of Phase 8;
   nothing is watching it.

## Deliberately not built

Not oversights — decisions, recorded so they are not re-litigated silently.

- **No customer accounts.** Guest checkout only. Order access is by unguessable
  token.
- **No delivery pricing.** The studio has no published rate card, so delivery is
  zero *and* flagged `PENDING_QUOTE`, and every surface says the total excludes
  delivery. Inventing a rate would be fabricating business data.
- **No aggregateRating / review / AggregateOffer structured data.** There are no
  reviews. Emitting them to win a rich snippet is both a lie and a manual-action
  risk.
- **No analytics.** No metric is displayed that is not backed by a real row.
- **No exchange rates.** Revenue is scoped to one currency and orders in others
  are counted separately, because a made-up rate is worse than an honest split.
- **No per-product OpenGraph images.** Phase 8 added one generated site-wide card
  (`app/opengraph-image.tsx`). A per-piece card showing that piece's photograph would
  be better, and needs a photograph per piece — most of the catalogue does not have
  one yet.
- **No PWA icons or service worker.** `app/manifest.ts` declares
  `display: "browser"` and no icons, because the available brand artwork is a wide
  wordmark and a motif, neither of which is a square maskable icon. Cropping the
  motif into one is a design decision for Marion.
- **No `sharp`.** Image dimensions are read from headers; a native module
  complicates the Vercel build for an optimisation that is not needed.
- **No `@aws-sdk/client-s3`, no `@upstash/ratelimit`, no `nodemailer`.** Each
  would be a large dependency for one or two operations reachable with `fetch`
  and `node:crypto`.

## Performance notes

Every page is `force-dynamic`, and the site layout reads `cookies()` for the cart
badge, so the whole public tree is dynamic. This is why the nonce-based CSP costs
nothing.

**It remains the largest performance opportunity and it was deferred again in Phase
8, deliberately.** Two consequences are worth stating plainly because they are easy
to miss:

- Every storefront page view hits Postgres. There is no cached path for a catalogue
  that changes a few times a week.
- The ~40 `revalidatePath()` calls carefully placed across the admin server actions
  are **currently no-ops for public routes**, because a `force-dynamic` page has no
  cache entry to invalidate. That work is correct and will start mattering the moment
  caching is enabled; today it does nothing.

The reason for deferring, unchanged from Phase 5 and reaffirmed in Phase 8: the fix
requires moving the cart badge out of the server-rendered layout, which changes
first-paint behaviour on every page of the storefront. Phase 8's remit was additive,
reversible hardening, and this is the one change in the audit that cannot be made
genuinely reversible. It needs a build measurement in front of it and a visual
sign-off behind it.

**Also deferred to Phase 8b, same surface:** `/shop` takes a hard `take: 60` with no
`skip` and no pagination, so published product 61 onwards is unreachable from any UI
while still appearing in `sitemap.xml` — a crawlable URL with no internal path to it.
The `totalPublished` count also ignores active filters, so the displayed count can
contradict the visible grid. Both are real defects; both need a UX decision about
what pagination looks like in a gallery-style catalogue.

Measured facts rather than assumptions:

- Dashboard KPIs are one `Promise.all`, not sequential counts.
- Admin lists are server-side filtered, sorted and paginated, with supporting
  indexes added in the Phase 4 migration.
- Cart rendering re-reads live product data every time — deliberate, so no stale
  price exists anywhere for a client to submit back.
- No N+1 was found: every list query selects its relations explicitly.
- Phase 5 added two partial/compound indexes for the reconciliation queries it
  introduced, rather than speculative ones.
