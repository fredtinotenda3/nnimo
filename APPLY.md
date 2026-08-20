# APPLY.md — applying this Phase 9 delivery

> This file replaces the Phase 7 `APPLY.md`. If you still need those
> instructions, they are in git history on the Phase 7 commit.

This ZIP contains only files created or modified in Phase 9, plus this
document and `PHASE-9-REPORT.md`. It does not contain a full copy of the
repository.

## 1. What's inside

```
app/(site)/about/page.tsx                          modified
app/(site)/cart/loading.tsx                         new
app/(site)/checkout/loading.tsx                     new
app/(site)/collections/[slug]/loading.tsx            new
app/(site)/collections/[slug]/page.tsx              modified
app/(site)/collections/loading.tsx                   new
app/(site)/contact/page.tsx                         modified
app/(site)/custom/page.tsx                          modified
app/(site)/family/page.tsx                          modified
app/(site)/loading.tsx                               new
app/(site)/page.tsx                                 modified
app/(site)/products/[slug]/loading.tsx               new
app/(site)/products/[slug]/page.tsx                 modified
app/(site)/shop/loading.tsx                          new
app/(site)/shop/page.tsx                            modified
app/admin/audit/loading.tsx                          new
app/admin/collections/loading.tsx                    new
app/admin/content/loading.tsx                        new
app/admin/customers/loading.tsx                      new
app/admin/inquiries/loading.tsx                      new
app/admin/loading.tsx                                new
app/admin/media/loading.tsx                          new
app/admin/orders/loading.tsx                         new
app/admin/products/loading.tsx                       new
app/admin/settings/loading.tsx                       new
app/admin/team/loading.tsx                           new
app/globals.css                                     modified
components/admin/form-loading.tsx                    new
components/admin/list-loading.tsx                    new
components/catalogue/media-image.tsx                modified
components/catalogue/product-gallery.tsx              new
components/site/editorial-image.tsx                   new
components/ui/badge.tsx                             modified
components/ui/button.tsx                            modified
lib/editorial-images.ts                              new
public/images/README.md                              new
public/images/{about,brand,collection-atmosphere,contact,craft,custom,editorial,family,hero,studio}/.gitkeep  new (empty folders)
PHASE-9-REPORT.md                                     new
APPLY.md                                              new
```

## 2. Applying it

1. Unzip into the root of your working copy of the repository, allowing it
   to merge into existing folders (`app/`, `components/`, `lib/`, `public/`).
   Every path above is additive or a targeted modification — nothing outside
   this list is touched, so this is safe to overlay directly.
2. No new npm dependencies were added. `npm install` is not required unless
   your existing `node_modules` is already stale for an unrelated reason.
3. No environment variables, Prisma schema, or migration changes. Do **not**
   run `prisma migrate` as part of applying this — there is nothing
   database-related in this delivery.
4. Run:
   ```
   npx tsc --noEmit
   npm run lint
   npm run test
   npm run build
   ```
   in an environment that can resolve `@/lib/generated/prisma/*` (i.e. one
   that has already run `npm run db:generate` successfully, or can reach
   `binaries.prisma.sh` to do so) — see `PHASE-9-REPORT.md` §8 for why this
   couldn't be fully confirmed in the delivery environment.

## 3. Adding real editorial photography

See `public/images/README.md` for the full explanation. Short version:

1. Drop a file at the path named for the slot you want in
   `lib/editorial-images.ts` (e.g. `craft-hands` expects
   `public/images/craft/hands.webp`).
2. That's it. No component changes needed — `resolveEditorialImage()` checks
   the filesystem per-request.
3. No slot is currently used by any page — see `PHASE-9-REPORT.md` §3 for why
   wiring them into specific sections was left for a follow-up once you know
   which images go where.

## 4. Rollback

Every file listed above under "modified" has a corresponding entry in your
version control history prior to this delivery. If anything here needs to be
reverted, `git checkout <ref-before-phase-9> -- <path>` for the specific
file(s) is sufficient — nothing in this delivery depends on another file
outside this list, so partial rollback is safe.
