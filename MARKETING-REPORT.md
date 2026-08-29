# Marketing Engine — Phase Report

## 1. Discovery findings

Before writing anything, the existing code was inspected directly (not assumed from the brief):

- **`Campaign`, `CampaignProduct`, and `LandingPage` already existed in `prisma/schema.prisma`** from an earlier phase, with `campaign:read`/`campaign:write` already defined in `lib/rbac.ts` and already granted to `MARKETING_MANAGER` and `MANAGER` — but with **no admin UI, no public route, and no other code referencing any of it**. This phase is genuinely additive: it builds the surface on top of schema that was already waiting.
- **`Order` already had partial attribution**: `utmSource`, `utmMedium`, `utmCampaign`, `campaignId`, `landingPageId`. Missing: `utmTerm`, `utmContent`.
- **`CustomOrderInquiry` had no attribution fields at all.** Added the full set, matching Order's shape.
- **`lib/admin-sections.ts` already listed Campaigns and Landing pages** with `built: false` — the "Soon" badge convention this codebase uses for planned-but-unbuilt sections. Flipping that flag is the actual "update navigation" step; no new entries were needed.
- **The product page already had OpenGraph *and* Twitter Card metadata; the collection page had OpenGraph but was missing Twitter Card.** A genuine, narrow gap — fixed by adding the missing `twitter` block, not a rewrite.
- **No newsletter, banner, UTM-capture, or share-link code existed anywhere.** Built from scratch, following the closest existing pattern in each case (see §2).
- **`proxy.ts` (the Next.js middleware) carries an explicit comment: "TWO RESPONSIBILITIES, AND ONLY TWO."** UTM capture was kept out of it entirely for this reason — see §2's attribution design.

## 2. What was built

### Campaign management (`/admin/campaigns`)
Full CRUD mirroring the existing Collections admin section field-for-field: list with search/status filters, create/edit form (name, slug, description, hero image, optional linked range, CTA link + button text, start/end dates, status), product assignment (a join-table add/remove, since — unlike a range — a product can run in more than one campaign at once), and a list of the campaign's own landing pages. Publishing is handled two ways: the list page's quick toggle (Active ⇄ Archived), and the edit form's full 5-value status select (Draft, Scheduled, Active, Ended, Archived) for the other transitions.

### Advertising landing pages (`/admin/landing-pages`)
Same CRUD pattern. Renders publicly at **`/c/{slug}`** — chosen over `/p/{slug}` because `/p/` risks visual confusion with the existing `/products/` route, while `/c/` reads naturally as "campaign" and no route currently uses that prefix. CTA falls back from the landing page's own link to its linked campaign's link when the page doesn't set its own. Draft/archived pages 404 for a visitor, including one with the exact URL — see §"Draft protection" below.

### Social sharing / OpenGraph
- Twitter Card metadata added to the collection page (the one real gap).
- Campaign context is carried through the landing page it's linked to (campaigns themselves have no separate public page — see §"Design decisions").
- `components/site/share-links.tsx`: plain WhatsApp/Facebook/X share-intent URLs, no SDK. Wired onto product, collection, and landing pages.

### UTM tracking and attribution
- `lib/marketing/utm.ts`: pure parsing and first-touch resolution logic (no `db` import — see "Testing" below for why that split matters).
- `lib/marketing/attribution.ts`: an httpOnly cookie (`nnino_attribution`, 30-day window, matching `CART_COOKIE_MAX_AGE`'s reasoning), captured via a client component + Server Action pair (`app/(site)/attribution-capture.tsx` + `attribution-actions.ts`) rather than in `proxy.ts` — see "Design decisions".
- **First-touch, not last-touch**: once attribution is on record, a later direct visit never overwrites it.
- **FK-verified before every database write**: `verifiedAttribution()` confirms `campaignId`/`landingPageId` still reference real rows before they reach an `Order` or `CustomOrderInquiry` insert, because the cookie can outlive the campaign it names by up to 30 days, and an insert naming a deleted campaign would otherwise throw a foreign-key violation and break checkout.
- Wired into `createOrderFromCart` (new optional `attribution` param, defaults to all-null — every existing caller and test is unaffected), `app/(site)/checkout/actions.ts`, and both enquiry paths in `app/(site)/custom/actions.ts`.
- Displayed read-only on the admin order and enquiry detail pages, with links through to the linked campaign/landing page where one exists.

### Customer capture / newsletter
- `NewsletterSubscriber` model (new, additive).
- `lib/marketing/newsletter.ts`: signup validation — **consent must be explicitly ticked**; an email address alone is never treated as permission.
- Footer signup form (`components/site/newsletter-form.tsx`), rate-limited, honeypot-protected, matching `app/(site)/custom/actions.ts`'s existing public-form conventions exactly.
- Admin list + CSV export at `/admin/campaigns/newsletter` (nested under Campaigns rather than a new top-level nav entry — see "Design decisions").

### Promotional banners
Reused `ContentBlock` (`type: JSON`, key `marketing.banner`, using the model's own `mediaId` column for the optional image) rather than a new model, per the brief's stated preference. One dedicated form on `/admin/content` (its four fields validate together, unlike the rest of that page's one-block-per-form pattern). Public `<PromoBanner>` renders nothing at all unless a banner is both **enabled and has text** — an unwritten banner cannot accidentally be "on."

### Campaign performance
New **Campaigns** tab on `/admin/analytics` (gated on the existing `campaign:read`, no new permission). Two tables: every real campaign's order count/revenue/enquiry count for the selected period (zero shown honestly when true, never omitted), and a source/medium breakdown of settled orders that carry UTM values but no campaign link. Revenue is measured on `paidAt` for settled orders only (`PAID`/`PARTIALLY_REFUNDED`), matching `lib/analytics/sales.ts`'s own axis rule exactly — this also means the query is served by the existing `order_settled_paid_at` partial index from the Phase 7 migration, not a new one.

## 3. Design decisions worth flagging explicitly

- **UTM capture lives outside `proxy.ts`.** That file states its two responsibilities are deliberate and singular. A client component (`AttributionCapture`) fires once on mount and calls a Server Action, which is the only place `cookies().set()` is legal outside middleware. One instance mounts in `app/(site)/layout.tsx` for the general case (an ad linking straight at any page); the landing page mounts its own second instance with its own campaign/landing ids and UTM defaults filled in.
- **`/c/{slug}` for landing pages only — campaigns have no public page of their own.** The brief's routing instruction named this pattern for landing pages specifically; a campaign's public presence is entirely through the landing page(s) attached to it.
- **Newsletter admin lives at `/admin/campaigns/newsletter`, not a new top-level nav entry.** `lib/admin-sections.ts` was kept to exactly the two sections the brief asked to be made navigable (Campaigns, Landing pages); the subscriber list is secondary to Campaigns, linked from its list page.
- **`campaign.products_updated` was added to the audit action list** beyond the eight the brief named explicitly, because it is genuinely used (product↔campaign assignment) — the brief's own instruction was "only add actions that are actually used," and an unaudited mutation would be the wrong side of that rule.

## 4. Routes added

| Route | Purpose |
|---|---|
| `/admin/campaigns` | Campaign list |
| `/admin/campaigns/new` | Create campaign |
| `/admin/campaigns/[id]` | Edit campaign, product assignment, linked landing pages |
| `/admin/campaigns/newsletter` | Newsletter subscriber list |
| `/admin/campaigns/newsletter/export` | CSV export (Route Handler) |
| `/admin/landing-pages` | Landing page list |
| `/admin/landing-pages/new` | Create landing page |
| `/admin/landing-pages/[id]` | Edit landing page |
| `/admin/analytics/campaigns` | Campaign performance |
| `/c/[slug]` | Public landing page (draft-protected) |

## 5. Permissions / audit changes

**Permissions:** none added. `campaign:read`/`campaign:write` already existed and already covered exactly the intended roles (`MARKETING_MANAGER`, `MANAGER`, plus `OWNER` implicitly). Verified this explicitly in `tests/campaign-authorization.test.ts` rather than assumed.

**Audit actions added** (`lib/audit.ts`), all genuinely called:
`campaign.created`, `campaign.updated`, `campaign.published`, `campaign.unpublished`, `campaign.products_updated`, `landing_page.created`, `landing_page.updated`, `landing_page.published`, `landing_page.unpublished`.

The banner is audited as the existing `content.updated` action, since it genuinely is a `ContentBlock` update — a new action would have described the same event twice.

## 6. Schema changes (additive only)

All in `prisma/schema.prisma`, hand-written into `prisma/migrations/20260825120000_marketing_engine/migration.sql`:

- `Order`: `+utmTerm`, `+utmContent` (String?)
- `CustomOrderInquiry`: `+utmSource, +utmMedium, +utmCampaign, +utmTerm, +utmContent, +campaignId, +landingPageId` (String?, plus two new FKs, both `onDelete: SetNull`)
- `Campaign`: `+ctaLabel` (String?)
- `LandingPage`: `+ctaLabel, +defaultUtmTerm, +defaultUtmContent` (String?)
- New model: `NewsletterSubscriber` (id, email [unique], consent, source, utmSource, utmMedium, utmCampaign, createdAt, unsubscribedAt)

No column dropped, renamed, or retyped. No data deleted. Every new column is nullable or defaulted, so this applies cleanly to a populated database.

**This migration has not been run.** See "Remaining blockers."

## 7. Files changed

55 files, all listed in the ZIP. New: everything under `app/admin/campaigns/`, `app/admin/landing-pages/`, `app/admin/analytics/campaigns/`, `app/(site)/c/`, `lib/marketing/`, `lib/analytics/marketing.ts`, `lib/analytics/marketing-compute.ts`, the marketing test files, plus `components/admin/campaign-form.tsx`, `landing-page-form.tsx`, `banner-form.tsx`, `components/site/share-links.tsx`, `promo-banner.tsx`, `newsletter-form.tsx`. Modified: `prisma/schema.prisma`, `lib/admin/schemas.ts`, `lib/audit.ts`, `lib/admin-sections.ts`, `lib/analytics/sections.ts`, `lib/editorial-images.ts`, `lib/commerce/orders.ts`, `lib/commerce/order-views.ts`, `app/(site)/layout.tsx`, `app/(site)/checkout/actions.ts`, `app/(site)/custom/actions.ts`, `app/(site)/products/[slug]/page.tsx`, `app/(site)/collections/[slug]/page.tsx`, `app/admin/orders/[id]/page.tsx`, `app/admin/inquiries/[id]/page.tsx`, `app/admin/content/page.tsx`, `components/layout/site-footer.tsx`.

No Phase 1–9 file was changed beyond what integrating this phase required (adding fields to two existing detail pages, extending one existing function's parameters optionally, and the two-file collection-metadata fix).

## 8. Verification results

Run in this environment (see §"Remaining blockers" for the one thing that could not run here):

- **`npx tsc --noEmit`** — every error in the output traces to one root cause: this sandbox's network allowlist does not include `binaries.prisma.sh`, so `npx prisma generate` cannot complete, and `@/lib/generated/prisma/enums`/`client` cannot be resolved. That cascades into implicit-`any` errors across dozens of files that were never touched by this phase (`lib/analytics/sales.ts`, `lib/commerce/fulfilment.ts`, `lib/rbac.ts`, etc.) — this is the exact same limitation and error signature documented in this project's own prior fix (`next.config.ts`, "A `use server` file can only export..."). Two real bugs this phase *did* introduce were found this way and fixed: a missing `EDITORIAL_SLOTS` entry for the new `campaign-atmosphere` slot key, and `OrderDetailView` (`lib/commerce/order-views.ts`) not yet listing the new attribution fields the order detail page now selects.
- **`npm run lint`** — clean. (Three real `react/no-unescaped-entities` errors were caught and fixed during development — an apostrophe in the campaign product-search empty state and two in the newsletter form.)
- **`npm run test`** — **439 of 439 tests pass** (394 pre-existing + 45 new). The only 2 failing suites (`tests/analytics-authorization.test.ts`, `tests/order-totals.test.ts`) fail for the same Prisma-generation reason above, unchanged from before this phase — confirmed by re-running the suite before writing any code.

New tests, by the brief's list:
- Campaign CRUD authorization → `tests/campaign-authorization.test.ts`
- Landing page authorization → `tests/landing-page-authorization.test.ts`
- Draft landing page protection → the RBAC/status-contract half in `tests/landing-page-authorization.test.ts`; the real data-layer assertion (`getPublicLandingPageBySlug` returns `null` for DRAFT/ARCHIVED, the row for PUBLISHED) in `tests/integration/landing-pages.integration.test.ts` — see below for why that half needs a real database.
- UTM parameter parsing → `tests/utm-parsing.test.ts`
- UTM storage on order/enquiry → `tests/utm-attribution.test.ts` (the pure first-touch resolution rules); the actual database write is exercised through `createOrderFromCart`'s and the enquiry actions' existing integration coverage plus the new `verifiedAttribution` FK-check, which is inherently a database-touching function
- Campaign performance calculations → `tests/campaign-performance.test.ts`
- Newsletter signup validation → `tests/newsletter-validation.test.ts`
- Promotional banner validation → `tests/banner-validation.test.ts`

Every new pure-logic test was deliberately written without importing `@/lib/db` or a runtime Prisma enum value, mirroring how `lib/analytics/compute.ts` is split from `lib/analytics/sales.ts` in the existing codebase — this is what let 45 new tests run and pass in this sandbox at all. Where a guarantee is inherently database-shaped (draft-page visibility, FK verification), the test lives in `tests/integration/` instead, matching the project's own established split, and is honestly reported as unrun here rather than faked.

## 9. Remaining blockers

1. **The migration has not been applied.** `npx prisma generate` / `migrate dev` need `binaries.prisma.sh`, which this sandbox's network allowlist blocks — identical to this project's own prior documented limitation. `prisma/migrations/20260825120000_marketing_engine/migration.sql` was hand-written to match `schema.prisma` exactly, in the same style as this repo's other hand-authored SQL, but it has not been run against a real database.
2. **`tests/integration/landing-pages.integration.test.ts` has not been run**, for the same reason — no `TEST_DATABASE_URL` reachable here. It is written to the project's existing integration-test conventions and should run cleanly against a real test database.
3. **Landing page view tracking was not built.** The brief marked this explicitly optional ("if tracked"), and it was left out to keep this phase's schema surface to what is actually used.

## 10. Manual steps

Before deploying:

1. Run `npx prisma migrate dev` (or `db push`, per your workflow) against a real Postgres instance to apply `20260825120000_marketing_engine`, or let Prisma regenerate an equivalent migration from the updated `schema.prisma` — either way, confirm it actually applies before trusting the hand-written file.
2. Run `npx prisma generate`, then re-run `npx tsc --noEmit` once to confirm a fully clean pass (every remaining error in this report's tsc output should disappear once the client exists).
3. Run the integration suite (`npm run test:integration` or your project's equivalent) against a real test database, including the new `landing-pages.integration.test.ts`.
4. Create at least one Campaign and one Published LandingPage in the admin to confirm `/c/{slug}` renders correctly end-to-end, including the attribution cookie being set (check dev tools → Application → Cookies → `nnino_attribution` after visiting with `?utm_source=test`).
5. Set the promotional banner's enabled flag on/off once in `/admin/content` to confirm the public site reflects it (`revalidatePath("/", "layout")` should make this immediate).
