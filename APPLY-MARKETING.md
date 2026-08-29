# APPLY-MARKETING.md — applying the Marketing Engine phase

This ZIP contains only files created or modified in this phase, plus this
document and `MARKETING-REPORT.md`. It does not contain a full copy of the
repository — extract it over an existing checkout of the project, do not
extract it as a standalone project.

## 1. What's inside

```
prisma/schema.prisma                                          modified
prisma/migrations/20260825120000_marketing_engine/
  migration.sql                                                new

lib/admin/schemas.ts                                           modified
lib/audit.ts                                                   modified
lib/admin-sections.ts                                          modified
lib/analytics/sections.ts                                      modified
lib/editorial-images.ts                                        modified
lib/marketing/utm.ts                                           new
lib/marketing/attribution.ts                                   new
lib/marketing/newsletter.ts                                    new
lib/marketing/banner.ts                                        new
lib/marketing/public.ts                                        new
lib/analytics/marketing-compute.ts                             new
lib/analytics/marketing.ts                                     new
lib/commerce/orders.ts                                         modified
lib/commerce/order-views.ts                                    modified

app/(site)/layout.tsx                                          modified
app/(site)/attribution-actions.ts                               new
app/(site)/attribution-capture.tsx                               new
app/(site)/newsletter-actions.ts                                 new
app/(site)/checkout/actions.ts                                 modified
app/(site)/custom/actions.ts                                   modified
app/(site)/c/[slug]/page.tsx                                     new
app/(site)/products/[slug]/page.tsx                             modified
app/(site)/collections/[slug]/page.tsx                          modified

app/admin/campaigns/actions.ts                                   new
app/admin/campaigns/page.tsx                                     new
app/admin/campaigns/new/page.tsx                                 new
app/admin/campaigns/[id]/page.tsx                                 new
app/admin/campaigns/newsletter/page.tsx                           new
app/admin/campaigns/newsletter/export/route.ts                    new
app/admin/landing-pages/actions.ts                                new
app/admin/landing-pages/page.tsx                                  new
app/admin/landing-pages/new/page.tsx                               new
app/admin/landing-pages/[id]/page.tsx                              new
app/admin/analytics/campaigns/page.tsx                            new
app/admin/orders/[id]/page.tsx                                   modified
app/admin/inquiries/[id]/page.tsx                                 modified
app/admin/content/page.tsx                                       modified
app/admin/content/banner-actions.ts                                new

components/admin/campaign-form.tsx                                new
components/admin/landing-page-form.tsx                             new
components/admin/banner-form.tsx                                   new
components/site/share-links.tsx                                    new
components/site/promo-banner.tsx                                   new
components/site/newsletter-form.tsx                                new
components/layout/site-footer.tsx                                 modified

tests/campaign-authorization.test.ts                               new
tests/landing-page-authorization.test.ts                           new
tests/utm-parsing.test.ts                                          new
tests/utm-attribution.test.ts                                      new
tests/campaign-performance.test.ts                                 new
tests/newsletter-validation.test.ts                                new
tests/banner-validation.test.ts                                    new
tests/integration/landing-pages.integration.test.ts                new
```

55 files total. See `MARKETING-REPORT.md` for what each area does and why.

## 2. Apply the files

```bash
# From the root of your existing nnino-ceramics checkout:
unzip -o marketing-engine.zip -d .
```

Nothing here overwrites a file this phase didn't intentionally modify — the
list above is exhaustive.

## 3. Apply the database migration

**This is the one step that could not be completed or verified in the
environment this phase was built in** — it has no network path to
`binaries.prisma.sh`, so `prisma generate`/`migrate` cannot run there. Do this
in your own environment, against a real (or disposable/staging) database:

```bash
npx prisma generate
npx prisma migrate dev
```

`prisma migrate dev` will detect that `schema.prisma` has already moved ahead
of the last applied migration and offer to create a new migration for the
difference. You have two reasonable choices:

- **Let Prisma generate its own migration.** It should describe the same
  additive changes as the hand-written
  `prisma/migrations/20260825120000_marketing_engine/migration.sql` in this
  ZIP. This is the safer choice if you are unsure.
- **Keep the hand-written migration and mark it applied**, if you have
  reviewed `migration.sql` and are confident it matches your database's
  current state (`npx prisma migrate resolve --applied
  20260825120000_marketing_engine`, then continue normally).

Either way, **read `migration.sql` before running it against anything that
matters** — it was written to match `schema.prisma` exactly, but it has not
been executed anywhere. It is additive only (no dropped/renamed/retyped
columns, no deleted data), so the ordinary risk of an additive migration
against a live database applies and nothing more.

## 4. Verify

```bash
npx tsc --noEmit     # should be clean once `prisma generate` has run
npm run lint         # should already be clean
npm run test         # 439 tests, all passing, once the Prisma client exists
npm run test:integration   # or your project's equivalent — needs TEST_DATABASE_URL
```

If `tsc` still shows errors after `prisma generate`, they are not from this
phase — cross-check against `MARKETING-REPORT.md` §8, which lists every file
this phase actually touched.

## 5. Smoke-test manually

1. Sign in as a Manager or Marketing Manager. **Campaigns** and **Landing
   pages** should now appear in the admin nav (no longer greyed out).
2. Create a campaign, set it Active, create a landing page under it, set the
   landing page Published.
3. Visit `/c/{the landing page's slug}?utm_source=test&utm_medium=smoke_test`
   in an incognito window. Confirm the page renders, and check dev tools →
   Application → Cookies for `nnino_attribution` — it should be set and
   contain `test`/`smoke_test` plus the campaign and landing page ids.
4. Place a test order (or submit the custom-commission form) in that same
   incognito session. Open the resulting order/enquiry in
   `/admin/orders/{id}` or `/admin/inquiries/{id}` — the new **Attribution**
   panel should show the campaign, landing page, and UTM values captured in
   step 3.
5. Check `/admin/analytics/campaigns` — the campaign from step 2 should show
   1 order (once paid) or 1 enquiry.
6. In `/admin/content`, enable the promotional banner with some text and
   save. Confirm it appears at the top of the public site. Turn it off again
   and confirm it disappears.
7. Sign up for the newsletter from the site footer. Confirm the email appears
   in `/admin/campaigns/newsletter`, and that **Export CSV** downloads a file
   containing it.
