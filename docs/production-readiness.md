# Production readiness

Status of every subsystem after Phase 5. Read alongside `docs/security.md`,
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
| Error handling | ✅ |
| Observability | ✅ logging; ⚠️ no alerting configured |
| Mixed currency | ✅ (revenue scoped) |
| SEO | ✅ |
| Accessibility | ⚠️ audited statically, not with a screen reader |
| Backups | ⚠️ provider-side, not configured here |
| Build / test verification | ❌ **not run in this environment** |

## ❌ What was not verified

`npm install`, `tsc --noEmit`, `lint`, `test`, `build` and `db:verify` were **not
executed**. The delivered archive contains no `node_modules` and no database, and
the working instruction for this phase was to skip heavy commands. Every code
change is therefore reviewed and reasoned, not compiler-checked.

Independently verified by direct execution:

- The AWS SigV4 signing-key vector, the SHA-256 of the empty payload and the
  `x-amz-date` format used in `tests/sigv4.test.ts`, computed with `node:crypto`.
- Test counts, by parsing the test files.
- That nothing imports the deleted `lib/payments/registry.ts`.
- That no `__html: JSON.stringify` remains anywhere in `app/` or `components/`.

**Run the full gate before deploying.** See `APPLY.md`.

## Blockers before taking real money

1. **Run the Phase 5 migration and `npm run db:verify`.** Without
   `nnino_order_number_seq`, every checkout fails on a fresh database.
2. **Provision object storage and set `MEDIA_DRIVER=s3`.** With `local`, every
   uploaded image is lost on the next deploy.
3. **Implement the Paynow adapter** once credentials and the integration style
   arrive. Until then no real payment can be taken.
4. **Configure a sending domain** or accept that no customer receives an email.
5. **Set the Redis rate-limit credentials**, or accept a per-instance limiter.
6. **Enable and test database backups.**

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
- **No `sharp`.** Image dimensions are read from headers; a native module
  complicates the Vercel build for an optimisation that is not needed.
- **No `@aws-sdk/client-s3`, no `@upstash/ratelimit`, no `nodemailer`.** Each
  would be a large dependency for one or two operations reachable with `fetch`
  and `node:crypto`.

## Performance notes

Every page is `force-dynamic`, and the site layout reads `cookies()` for the cart
badge, so the whole public tree is dynamic. This is why the nonce-based CSP costs
nothing.

It is also the largest remaining performance opportunity, and it was **not**
changed in Phase 5 — making the catalogue static or ISR-cached means moving the
cart badge to a client component or a route handler, which changes first-paint
behaviour on the storefront. That is a design decision with a visual consequence,
not a mechanical optimisation, and Phase 5's remit was hardening rather than
redesign.

Measured facts rather than assumptions:

- Dashboard KPIs are one `Promise.all`, not sequential counts.
- Admin lists are server-side filtered, sorted and paginated, with supporting
  indexes added in the Phase 4 migration.
- Cart rendering re-reads live product data every time — deliberate, so no stale
  price exists anywhere for a client to submit back.
- No N+1 was found: every list query selects its relations explicitly.
- Phase 5 added two partial/compound indexes for the reconciliation queries it
  introduced, rather than speculative ones.
